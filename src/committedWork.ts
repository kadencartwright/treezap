import { Effect } from "effect"

import {
  getDefaultRemoteBranch,
  inspectPatchEquivalence,
  parseGitCherryOutput,
  type CherryCommit,
  type GitCommandError,
  type PatchEquivalence
} from "./git"

export type { CherryCommit }
export type CommittedWorkStatus = PatchEquivalence
export { parseGitCherryOutput }

export const inspectCommittedWork = (
  path: string
): Effect.Effect<CommittedWorkStatus | undefined, GitCommandError> =>
  getDefaultRemoteBranch(path).pipe(
    Effect.flatMap((defaultBranch) => {
      if (defaultBranch === undefined) {
        return Effect.succeed(undefined)
      }

      return inspectPatchEquivalence(path, defaultBranch)
    })
  )
