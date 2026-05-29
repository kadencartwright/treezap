import { Effect } from "effect"

import { runGit, type GitCommandError } from "./git"

export interface CherryCommit {
  readonly hash: string
}

export interface CommittedWorkStatus {
  readonly base: string
  readonly uniquePatchCount: number
  readonly equivalentPatchCount: number
  readonly uniqueCommits: ReadonlyArray<CherryCommit>
  readonly equivalentCommits: ReadonlyArray<CherryCommit>
}

export const inspectCommittedWork = (
  path: string
): Effect.Effect<CommittedWorkStatus | undefined, GitCommandError> =>
  getDefaultBranch(path).pipe(
    Effect.flatMap((defaultBranch) => {
      if (defaultBranch === undefined) {
        return Effect.succeed(undefined)
      }

      return runGit(path, ["cherry", defaultBranch, "HEAD"]).pipe(
        Effect.map((result) => parseGitCherryOutput(defaultBranch, result.stdout))
      )
    })
  )

export const parseGitCherryOutput = (
  base: string,
  output: string
): CommittedWorkStatus => {
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

const getDefaultBranch = (path: string): Effect.Effect<string | undefined, never> =>
  runGit(path, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.catchAll(() => Effect.succeed(undefined))
  )
