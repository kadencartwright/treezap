import { Effect } from "effect"

import {
  calculateAgeDays,
  evaluateDeletion,
  type DeletionDecision
} from "./deletable"
import { runGit } from "./git"
import { inspectPath, type StatusError, type WorktreeStatus } from "./status"

export interface RemoveEvaluationOptions {
  readonly now?: Date
  readonly minimumAgeDays?: number
}

export interface RemoveEvaluationResult {
  readonly path: string
  readonly minimumAgeDays: number
  readonly deleted: boolean
  readonly eligible: boolean
  readonly ageDays: number
  readonly status: WorktreeStatus
  readonly decision: DeletionDecision
}

const defaultMinimumAgeDays = 30

export const evaluateRemove = (
  path: string,
  options: RemoveEvaluationOptions = {}
): Effect.Effect<RemoveEvaluationResult, StatusError> => {
  const now = options.now ?? new Date()
  const minimumAgeDays = options.minimumAgeDays ?? defaultMinimumAgeDays

  return Effect.gen(function* () {
    const initial = yield* inspectPath(path)
    const initialEvaluation = evaluateStatus(initial, now, minimumAgeDays)

    if (!initialEvaluation.eligible) {
      return initialEvaluation
    }

    const revalidated = yield* inspectPath(path)
    const revalidatedEvaluation = evaluateStatus(revalidated, now, minimumAgeDays)

    if (!revalidatedEvaluation.eligible) {
      return revalidatedEvaluation
    }

    yield* runGit(path, ["worktree", "remove", path])

    return {
      ...revalidatedEvaluation,
      deleted: true
    }
  })
}

const evaluateStatus = (
  status: WorktreeStatus,
  now: Date,
  minimumAgeDays: number
): RemoveEvaluationResult => {
  const decision = evaluateDeletion(status)
  const ageDays = calculateAgeDays(status.lastCommitAt, now)

  return {
    path: status.path,
    minimumAgeDays,
    deleted: false,
    eligible: decision.deletable && ageDays > minimumAgeDays,
    ageDays,
    status,
    decision
  }
}
