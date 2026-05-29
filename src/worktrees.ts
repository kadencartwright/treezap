import { Effect } from "effect"

import { runGit, type GitCommandError } from "./git"
import { parseWorktreePorcelain, type WorktreePorcelainEntry } from "./worktreePorcelain"

export type WorktreeListError = GitCommandError

export const listWorktrees = (
  repoPath: string
): Effect.Effect<ReadonlyArray<WorktreePorcelainEntry>, WorktreeListError> =>
  runGit(repoPath, ["worktree", "list", "--porcelain"]).pipe(
    Effect.map((result) => parseWorktreePorcelain(result.stdout))
  )
