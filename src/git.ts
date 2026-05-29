import { spawnSync } from "node:child_process"

import { Data, Effect } from "effect"

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
