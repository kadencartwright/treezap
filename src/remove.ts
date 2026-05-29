import { Effect } from "effect"

import {
  calculateAgeDays,
  evaluateDeletion,
  type DeletionDecision
} from "./deletable"
import { inspectPath, type StatusError, type WorktreeStatus } from "./status"

export interface RemoveEvaluationOptions {
  readonly now?: Date
  readonly minimumAgeDays?: number
}

export interface RemoveEvaluationResult {
  readonly path: string
  readonly minimumAgeDays: number
  readonly deleted: false
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

  return inspectPath(path).pipe(
    Effect.map((status) => {
      const decision = evaluateDeletion(status)
      const ageDays = calculateAgeDays(status.lastCommitAt, now)

      return {
        path,
        minimumAgeDays,
        deleted: false as const,
        eligible: decision.deletable && ageDays > minimumAgeDays,
        ageDays,
        status,
        decision
      }
    })
  )
}
