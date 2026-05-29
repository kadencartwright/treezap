import { Effect, Stream } from "effect"

import { discoverRepos, type DiscoverReposError } from "./repos"
import type { WorktreePorcelainEntry } from "./worktreePorcelain"
import { listWorktrees, type WorktreeListError } from "./worktrees"

export interface ScannedRepository {
  readonly path: string
  readonly worktrees: ReadonlyArray<WorktreePorcelainEntry>
}

export interface ScanResult {
  readonly root: string
  readonly repositories: ReadonlyArray<ScannedRepository>
}

export type ScanRootError = DiscoverReposError | WorktreeListError

export const scanRoot = (rootPath: string): Stream.Stream<ScannedRepository, ScanRootError> =>
  discoverRepos(rootPath).pipe(
    Stream.mapEffect((repo) =>
      Effect.map(listWorktrees(repo), (worktrees): ScannedRepository => ({
        path: repo,
        worktrees
      }))
    )
  )

export const collectScanRoot = (rootPath: string): Effect.Effect<ScanResult, ScanRootError> =>
  scanRoot(rootPath).pipe(
    Stream.runCollect,
    Effect.map((repositories) => ({
      root: rootPath,
      repositories: Array.from(repositories)
    }))
  )
