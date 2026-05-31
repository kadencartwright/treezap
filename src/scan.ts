import { Effect, Ref, Stream } from "effect";

import { type GitCommandError, listWorktrees } from "./git";
import { clearProgress, renderProgressBar, writeProgress } from "./progress";
import { type DiscoverReposError, discoverRepos } from "./repos";
import type { WorktreePorcelainEntry } from "./worktreePorcelain";

export interface ScannedRepository {
  readonly path: string;
  readonly worktrees: ReadonlyArray<WorktreePorcelainEntry>;
}

export interface ScanResult {
  readonly root: string;
  readonly repositories: ReadonlyArray<ScannedRepository>;
}

export interface ScanOptions {
  readonly progress?: boolean;
  readonly concurrency?: number;
}

export type ScanRootError = DiscoverReposError | GitCommandError;

const defaultConcurrency = 16;

const renderRepoProgress = (
  checkedRepos: number,
  totalRepos: number,
  worktrees: number,
): string => {
  const repoLabel = totalRepos === 1 ? "repo" : "repos";
  const worktreeLabel = worktrees === 1 ? "worktree" : "worktrees";

  return renderProgressBar(
    "checking repos",
    checkedRepos,
    totalRepos,
    `${repoLabel}, ${worktrees} ${worktreeLabel}`,
  );
};

export const scanRoot = (
  rootPath: string,
  options: ScanOptions = {},
): Stream.Stream<ScannedRepository, ScanRootError> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const progress = options.progress ?? false;
      const concurrency = options.concurrency ?? defaultConcurrency;
      yield* writeProgress(progress, "treezap: scanning repos...");
      const repositories = yield* discoverRepos(rootPath).pipe(
        Stream.runCollect,
        Effect.map((items) => Array.from(items)),
      );
      const checkedRepos = yield* Ref.make(0);
      const worktreesDiscovered = yield* Ref.make(0);
      yield* writeProgress(
        progress,
        renderRepoProgress(0, repositories.length, 0),
      );

      return Stream.fromIterable(repositories).pipe(
        Stream.mapEffect(
          (repo) =>
            Effect.gen(function* () {
              const worktrees = yield* listWorktrees(repo);
              const worktreeCount = yield* Ref.updateAndGet(
                worktreesDiscovered,
                (count) => count + worktrees.length,
              );
              const checkedRepoCount = yield* Ref.updateAndGet(
                checkedRepos,
                (count) => count + 1,
              );
              yield* writeProgress(
                progress,
                renderRepoProgress(
                  checkedRepoCount,
                  repositories.length,
                  worktreeCount,
                ),
              );

              return {
                path: repo,
                worktrees,
              };
            }),
          { concurrency },
        ),
        Stream.ensuring(clearProgress(progress)),
      );
    }),
  );

export const collectScanRoot = (
  rootPath: string,
  options: ScanOptions = {},
): Effect.Effect<ScanResult, ScanRootError> =>
  scanRoot(rootPath, options).pipe(
    Stream.runCollect,
    Effect.map((repositories) => ({
      root: rootPath,
      repositories: Array.from(repositories),
    })),
  );
