import { execFileSync } from "node:child_process"

import { Effect } from "effect"

import { parseWorktreePorcelain, type WorktreePorcelainEntry } from "./worktreePorcelain"

export interface WorktreeListError {
  readonly _tag: "WorktreeListError"
  readonly repoPath: string
  readonly cause: unknown
}

export const listWorktrees = (
  repoPath: string
): Effect.Effect<ReadonlyArray<WorktreePorcelainEntry>, WorktreeListError> =>
  Effect.try({
    try: () => {
      const porcelain = execFileSync("git", ["-C", repoPath, "worktree", "list", "--porcelain"], {
        encoding: "utf8"
      })

      return parseWorktreePorcelain(porcelain)
    },
    catch: (cause): WorktreeListError => ({
      _tag: "WorktreeListError",
      repoPath,
      cause
    })
  })
