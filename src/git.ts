import { spawnSync } from "node:child_process"

import { Effect } from "effect"

export interface GitCommandResult {
  readonly cwd: string
  readonly args: ReadonlyArray<string>
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

export interface GitCommandError {
  readonly _tag: "GitCommandError"
  readonly cwd: string
  readonly args: ReadonlyArray<string>
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number | undefined
  readonly cause: unknown
}

export const runGit = (
  cwd: string,
  args: ReadonlyArray<string>
): Effect.Effect<GitCommandResult, GitCommandError> =>
  Effect.try({
    try: () => {
      const result = spawnSync("git", args, {
        cwd,
        encoding: "utf8"
      })

      if (result.error !== undefined || result.status !== 0) {
        throw result
      }

      return {
        cwd,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status
      }
    },
    catch: (cause): GitCommandError => {
      const failed = parseFailedGitResult(cause)

      return {
        _tag: "GitCommandError",
        cwd,
        args,
        stdout: failed.stdout,
        stderr: failed.stderr,
        exitCode: failed.exitCode,
        cause
      }
    }
  })

const parseFailedGitResult = (
  cause: unknown
): Pick<GitCommandError, "stdout" | "stderr" | "exitCode"> => {
  if (isSpawnSyncResult(cause)) {
    return {
      stdout: cause.stdout,
      stderr: cause.stderr,
      exitCode: cause.status ?? undefined
    }
  }

  return {
    stdout: "",
    stderr: "",
    exitCode: undefined
  }
}

const isSpawnSyncResult = (
  cause: unknown
): cause is { readonly stdout: string; readonly stderr: string; readonly status: number | null } =>
  typeof cause === "object" &&
  cause !== null &&
  "stdout" in cause &&
  "stderr" in cause &&
  "status" in cause &&
  typeof cause.stdout === "string" &&
  typeof cause.stderr === "string" &&
  (typeof cause.status === "number" || cause.status === null)
