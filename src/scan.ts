import { Effect, Stream } from "effect"

import { discoverReposStream, type DiscoverReposError } from "./repos"
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

export const scanRoot = (rootPath: string): Effect.Effect<ScanResult, ScanRootError> =>
  discoverReposStream(rootPath).pipe(
    Stream.mapEffect((repo) =>
      Effect.map(listWorktrees(repo), (worktrees): ScannedRepository => ({
        path: repo,
        worktrees
      }))
    ),
    Stream.runCollect,
    Effect.map((repositories) => ({
      root: rootPath,
      repositories: Array.from(repositories)
    }))
  )
