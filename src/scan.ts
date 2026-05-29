import { Effect } from "effect"

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

export const scanRoot = (rootPath: string): Effect.Effect<ScanResult, ScanRootError> =>
  Effect.gen(function* () {
    const repos = yield* discoverRepos(rootPath)
    const repositories = yield* Effect.forEach(repos, (repo) =>
      Effect.map(listWorktrees(repo), (worktrees): ScannedRepository => ({
        path: repo,
        worktrees
      }))
    )

    return {
      root: rootPath,
      repositories
    }
  })
