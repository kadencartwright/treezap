import { Effect } from "effect";

import {
  type CherryCommit,
  type GitCommandError,
  getDefaultRemoteBranch,
  inspectPatchEquivalence,
  type PatchEquivalence,
  parseGitCherryOutput,
} from "./git";

export type { CherryCommit };
export type CommittedWorkStatus = PatchEquivalence;
export { parseGitCherryOutput };

export interface InspectCommittedWorkOptions {
  readonly defaultBranch?: string | null;
}

export const inspectCommittedWork = (
  path: string,
  options: InspectCommittedWorkOptions = {},
): Effect.Effect<CommittedWorkStatus | undefined, GitCommandError> =>
  getKnownDefaultBranch(path, options).pipe(
    Effect.flatMap((defaultBranch) => {
      if (defaultBranch === undefined) {
        return Effect.succeed(undefined);
      }

      return inspectPatchEquivalence(path, defaultBranch);
    }),
  );

const getKnownDefaultBranch = (
  path: string,
  options: InspectCommittedWorkOptions,
): Effect.Effect<string | undefined, never> => {
  if (options.defaultBranch !== undefined) {
    return Effect.succeed(options.defaultBranch ?? undefined);
  }

  return getDefaultRemoteBranch(path);
};
