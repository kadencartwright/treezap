import { Effect, Either } from "effect";

import {
  calculateAgeDays,
  type DeletionDecision,
  evaluateDeletion,
} from "./deletable";
import { type GitRemoveWorktreeError, removeWorktree } from "./git";
import { inspectPath, type StatusError, type WorktreeStatus } from "./status";

export interface RemoveEvaluationOptions {
  readonly now?: Date;
  readonly minimumAgeDays?: number;
}

export interface RemoveEvaluationResult {
  readonly path: string;
  readonly minimumAgeDays: number;
  readonly deleted: boolean;
  readonly eligible: boolean;
  readonly ageDays: number;
  readonly status: WorktreeStatus;
  readonly decision: DeletionDecision;
}

const defaultMinimumAgeDays = 30;

type RemovePathError = StatusError | GitRemoveWorktreeError;

const isSubmoduleWorktreeRemoveError = (error: RemovePathError): boolean =>
  error._tag === "GitRemoveWorktreeError" &&
  error.reason === "contains_submodules";

export const removePath = (
  path: string,
  options: RemoveEvaluationOptions = {},
): Effect.Effect<RemoveEvaluationResult, RemovePathError> => {
  const now = options.now ?? new Date();
  const minimumAgeDays = options.minimumAgeDays ?? defaultMinimumAgeDays;

  return Effect.gen(function* () {
    const initial = yield* inspectPath(path);
    const initialEvaluation = evaluateStatus(initial, now, minimumAgeDays);

    if (!initialEvaluation.eligible) {
      return initialEvaluation;
    }

    const revalidated = yield* inspectPath(path);
    const revalidatedEvaluation = evaluateStatus(
      revalidated,
      now,
      minimumAgeDays,
    );

    if (!revalidatedEvaluation.eligible) {
      return revalidatedEvaluation;
    }

    let deletionEvaluation = revalidatedEvaluation;
    const removeResult = yield* removeWorktree(path).pipe(Effect.either);

    if (Either.isLeft(removeResult)) {
      if (!isSubmoduleWorktreeRemoveError(removeResult.left)) {
        return yield* Effect.fail(removeResult.left);
      }

      const submoduleRevalidated = yield* inspectPath(path);
      const submoduleRevalidatedEvaluation = evaluateStatus(
        submoduleRevalidated,
        now,
        minimumAgeDays,
      );

      if (!submoduleRevalidatedEvaluation.eligible) {
        return submoduleRevalidatedEvaluation;
      }

      deletionEvaluation = submoduleRevalidatedEvaluation;
      yield* removeWorktree(path, { force: true });
    }

    return {
      ...deletionEvaluation,
      deleted: true,
    };
  });
};

const evaluateStatus = (
  status: WorktreeStatus,
  now: Date,
  minimumAgeDays: number,
): RemoveEvaluationResult => {
  const decision = evaluateDeletion(status);
  const ageDays = calculateAgeDays(status.lastCommitAt, now);

  return {
    path: status.path,
    minimumAgeDays,
    deleted: false,
    eligible: decision.deletable && ageDays > minimumAgeDays,
    ageDays,
    status,
    decision,
  };
};
