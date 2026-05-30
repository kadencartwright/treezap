import { spawnSync } from "node:child_process"

import { Data, Effect, Either } from "effect"

import { parseWorktreePorcelain, type WorktreePorcelainEntry } from "./worktreePorcelain"

export type GitPath = string
export type CommitHash = string
export type RefName = string
export type BranchName = string

export type GitHead =
  | {
      readonly kind: "branch"
      readonly branch: BranchName
      readonly commit: CommitHash
    }
  | {
      readonly kind: "detached"
      readonly commit: CommitHash
    }

export interface WorkingTreeChanges {
  readonly dirty: boolean
  readonly untracked: boolean
  readonly porcelain: string
}

export interface UpstreamStatus {
  readonly upstream?: RefName
  readonly ahead: number
  readonly behind: number
}

export interface GitWorktreeInspection {
  readonly path: GitPath
  readonly isInsideWorkTree: boolean
  readonly head: GitHead
  readonly lastCommitAt: string
  readonly changes: WorkingTreeChanges
  readonly upstream: UpstreamStatus
}

export interface CherryCommit {
  readonly hash: CommitHash
}

export interface PatchEquivalence {
  readonly base: RefName
  readonly uniquePatchCount: number
  readonly equivalentPatchCount: number
  readonly uniqueCommits: ReadonlyArray<CherryCommit>
  readonly equivalentCommits: ReadonlyArray<CherryCommit>
}

export interface GitCommandResult {
  readonly cwd: string
  readonly args: ReadonlyArray<string>
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly cwd: string
  readonly args: ReadonlyArray<string>
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | undefined
  readonly cause: unknown
}> {}

export type WorktreeRemoveFailureReason =
  | "contains_submodules"
  | "dirty_worktree"
  | "locked_worktree"

export class GitRemoveWorktreeError extends Data.TaggedError("GitRemoveWorktreeError")<{
  readonly path: GitPath
  readonly reason: WorktreeRemoveFailureReason
  readonly commandError: GitCommandError
}> {}

export const runGit = (
  cwd: string,
  args: ReadonlyArray<string>
): Effect.Effect<GitCommandResult, GitCommandError> => {
  const spawn = Effect.try({
    try: () =>
      spawnSync("git", args, {
        cwd,
        encoding: "utf8"
      }),
    catch: (cause): GitCommandError =>
      new GitCommandError({
        cwd,
        args,
        stdout: "",
        stderr: "",
        exitCode: undefined,
        cause
      })
  })

  return spawn.pipe(
    Effect.flatMap((result) => {
      if (result.error !== undefined || result.status !== 0) {
        return Effect.fail(
          new GitCommandError({
            cwd,
            args,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.status ?? undefined,
            cause: result.error ?? result
          })
        )
      }

      return Effect.succeed({
        cwd,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status
      })
    })
  )
}

export const listWorktrees = (
  repoPath: GitPath
): Effect.Effect<ReadonlyArray<WorktreePorcelainEntry>, GitCommandError> =>
  runGit(repoPath, ["worktree", "list", "--porcelain"]).pipe(
    Effect.map((result) => parseWorktreePorcelain(result.stdout))
  )

export const inspectWorktree = (
  path: GitPath
): Effect.Effect<GitWorktreeInspection, GitCommandError> =>
  Effect.gen(function* () {
    const worktree = yield* runGit(path, ["rev-parse", "--is-inside-work-tree"])
    const commit = yield* getHeadCommit(path)
    const lastCommit = yield* runGit(path, ["log", "-1", "--format=%cI"])
    const head = yield* getHead(path, commit)
    const changes = yield* getWorkingTreeChanges(path)
    const upstream = yield* getUpstreamStatus(path)

    return {
      path,
      isInsideWorkTree: worktree.stdout.trim() === "true",
      head,
      lastCommitAt: lastCommit.stdout.trim(),
      changes,
      upstream
    }
  })

export const getDefaultRemoteBranch = (
  path: GitPath
): Effect.Effect<RefName | undefined, never> =>
  runGit(path, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.catchAll(() => Effect.succeed(undefined))
  )

export const inspectPatchEquivalence = (
  path: GitPath,
  base: RefName
): Effect.Effect<PatchEquivalence, GitCommandError> =>
  runGit(path, ["cherry", base, "HEAD"]).pipe(
    Effect.map((result) => parseGitCherryOutput(base, result.stdout))
  )

export const removeWorktree = (
  path: GitPath,
  options: { readonly force?: boolean } = {}
): Effect.Effect<void, GitCommandError | GitRemoveWorktreeError> => {
  const args = options.force
    ? ["worktree", "remove", "--force", path]
    : ["worktree", "remove", path]

  return runGit(path, args).pipe(
    Effect.either,
    Effect.flatMap((result): Effect.Effect<void, GitCommandError | GitRemoveWorktreeError> => {
      if (Either.isRight(result)) {
        return Effect.void
      }

      const removeError = classifyRemoveWorktreeError(path, result.left)
      return removeError === undefined ? Effect.fail(result.left) : Effect.fail(removeError)
    })
  )
}

export const classifyRemoveWorktreeError = (
  path: GitPath,
  error: GitCommandError
): GitRemoveWorktreeError | undefined => {
  const reason = classifyRemoveWorktreeFailureReason(error.stderr)

  return reason === undefined
    ? undefined
    : new GitRemoveWorktreeError({
        path,
        reason,
        commandError: error
      })
}

export const parseWorkingTreeChanges = (porcelainStatus: string): WorkingTreeChanges => {
  const lines = porcelainStatus.split(/\r?\n/).filter((line) => line !== "")

  return {
    dirty: lines.some((line) => !line.startsWith("??")),
    untracked: lines.some((line) => line.startsWith("??")),
    porcelain: porcelainStatus
  }
}

export const parseDivergence = (
  output: string
): { readonly ahead: number; readonly behind: number } => {
  const [ahead = "0", behind = "0"] = output.trim().split(/\s+/)

  return {
    ahead: Number.parseInt(ahead, 10),
    behind: Number.parseInt(behind, 10)
  }
}

export const parseGitCherryOutput = (base: RefName, output: string): PatchEquivalence => {
  const uniqueCommits: Array<CherryCommit> = []
  const equivalentCommits: Array<CherryCommit> = []

  for (const line of output.split(/\r?\n/)) {
    if (line === "") {
      continue
    }

    const marker = line[0]
    const hash = line.slice(2).trim().split(/\s+/, 1)[0] ?? ""

    if (hash === "") {
      continue
    }

    if (marker === "+") {
      uniqueCommits.push({ hash })
      continue
    }

    if (marker === "-") {
      equivalentCommits.push({ hash })
    }
  }

  return {
    base,
    uniquePatchCount: uniqueCommits.length,
    equivalentPatchCount: equivalentCommits.length,
    uniqueCommits,
    equivalentCommits
  }
}

const getHeadCommit = (path: GitPath): Effect.Effect<CommitHash, GitCommandError> =>
  runGit(path, ["rev-parse", "HEAD"]).pipe(Effect.map((result) => result.stdout.trim()))

const getHead = (
  path: GitPath,
  commit: CommitHash
): Effect.Effect<GitHead, never> =>
  runGit(path, ["symbolic-ref", "--short", "HEAD"]).pipe(
    Effect.map((result): GitHead => ({
      kind: "branch",
      branch: result.stdout.trim(),
      commit
    })),
    Effect.catchAll(() =>
      Effect.succeed({
        kind: "detached" as const,
        commit
      })
    )
  )

const getWorkingTreeChanges = (
  path: GitPath
): Effect.Effect<WorkingTreeChanges, GitCommandError> =>
  runGit(path, ["status", "--porcelain"]).pipe(
    Effect.map((result) => parseWorkingTreeChanges(result.stdout))
  )

const getUpstream = (path: GitPath): Effect.Effect<RefName | undefined, never> =>
  runGit(path, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.catchAll(() => Effect.succeed(undefined))
  )

const getUpstreamStatus = (
  path: GitPath
): Effect.Effect<UpstreamStatus, GitCommandError> =>
  getUpstream(path).pipe(
    Effect.flatMap((upstream) => {
      if (upstream === undefined) {
        return Effect.succeed({
          ahead: 0,
          behind: 0
        })
      }

      return runGit(path, ["rev-list", "--left-right", "--count", `HEAD...${upstream}`]).pipe(
        Effect.map((result) => ({
          upstream,
          ...parseDivergence(result.stdout)
        }))
      )
    })
  )

const classifyRemoveWorktreeFailureReason = (
  stderr: string
): WorktreeRemoveFailureReason | undefined => {
  if (stderr.includes("working trees containing submodules cannot be moved or removed")) {
    return "contains_submodules"
  }

  if (stderr.includes("cannot remove a locked working tree")) {
    return "locked_worktree"
  }

  if (
    stderr.includes("contains modified or untracked files") ||
    stderr.includes("is dirty")
  ) {
    return "dirty_worktree"
  }

  return undefined
}
