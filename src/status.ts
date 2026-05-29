import { Effect } from "effect"

import { runGit, type GitCommandError } from "./git"
import type { WorktreePorcelainStatus } from "./worktreePorcelain"

export interface WorktreeStatus {
  readonly path: string
  readonly exists: boolean
  readonly isGitWorktree: boolean
  readonly status: WorktreePorcelainStatus
  readonly head: string
  readonly upstream?: string
  readonly dirty: boolean
  readonly untracked: boolean
  readonly ahead: number
  readonly behind: number
  readonly lastCommitAt: string
}

export type StatusError = GitCommandError

export const inspectPath = (path: string): Effect.Effect<WorktreeStatus, StatusError> =>
  Effect.gen(function* () {
    const worktree = yield* runGit(path, ["rev-parse", "--is-inside-work-tree"])
    const head = yield* runGit(path, ["rev-parse", "HEAD"])
    const lastCommit = yield* runGit(path, ["log", "-1", "--format=%cI"])
    const branchStatus = yield* getBranchStatus(path)
    const status = yield* runGit(path, ["status", "--porcelain"])
    const upstream = yield* getUpstream(path)
    const upstreamDivergence = yield* getUpstreamDivergence(path, upstream)

    return {
      path,
      exists: true,
      isGitWorktree: worktree.stdout.trim() === "true",
      status: branchStatus,
      head: head.stdout.trim(),
      lastCommitAt: lastCommit.stdout.trim(),
      upstream,
      dirty: hasTrackedChanges(status.stdout),
      untracked: hasUntrackedChanges(status.stdout),
      ahead: upstreamDivergence.ahead,
      behind: upstreamDivergence.behind
    }
  })

const getBranchStatus = (path: string): Effect.Effect<WorktreePorcelainStatus, never> =>
  runGit(path, ["symbolic-ref", "--short", "HEAD"]).pipe(
    Effect.map((result): WorktreePorcelainStatus => ({
      kind: "branch",
      branch: result.stdout.trim()
    })),
    Effect.catchAll(() =>
      Effect.succeed({
        kind: "detached" as const
      })
    )
  )

const getUpstream = (path: string): Effect.Effect<string | undefined, never> =>
  runGit(path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.catchAll(() => Effect.succeed(undefined))
  )

const getUpstreamDivergence = (
  path: string,
  upstream: string | undefined
): Effect.Effect<{ readonly ahead: number; readonly behind: number }, StatusError> => {
  if (upstream === undefined) {
    return Effect.succeed({
      ahead: 0,
      behind: 0
    })
  }

  return runGit(path, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]).pipe(
    Effect.map((result) => parseDivergence(result.stdout))
  )
}

const parseDivergence = (output: string): { readonly ahead: number; readonly behind: number } => {
  const [ahead = "0", behind = "0"] = output.trim().split(/\s+/)

  return {
    ahead: Number.parseInt(ahead, 10),
    behind: Number.parseInt(behind, 10)
  }
}

const hasTrackedChanges = (porcelainStatus: string): boolean =>
  porcelainStatus
    .split(/\r?\n/)
    .filter((line) => line !== "")
    .some((line) => !line.startsWith("??"))

const hasUntrackedChanges = (porcelainStatus: string): boolean =>
  porcelainStatus
    .split(/\r?\n/)
    .filter((line) => line !== "")
    .some((line) => line.startsWith("??"))
