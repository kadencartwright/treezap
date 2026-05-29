import type { WorktreeStatus } from "./status"

export type DeletionReason =
  | "dirty"
  | "missing_upstream"
  | "untracked"
  | "unpushed"

export interface DeletionDecision {
  readonly deletable: boolean
  readonly reasons: ReadonlyArray<DeletionReason>
}

export interface DeletionCandidate {
  readonly path: string
  readonly ageDays: number
  readonly status: WorktreeStatus
  readonly decision: DeletionDecision
}

export interface CandidateSelectionOptions {
  readonly now?: Date
  readonly minimumAgeDays?: number
}

const millisecondsPerDay = 24 * 60 * 60 * 1000
const defaultMinimumAgeDays = 30

export const evaluateDeletion = (status: WorktreeStatus): DeletionDecision => {
  const reasons: Array<DeletionReason> = []

  if (status.dirty) {
    reasons.push("dirty")
  }

  if (status.untracked) {
    reasons.push("untracked")
  }

  if (status.upstream === undefined) {
    reasons.push("missing_upstream")
  }

  if (status.ahead > 0) {
    reasons.push("unpushed")
  }

  return {
    deletable: reasons.length === 0,
    reasons
  }
}

export const selectDeletionCandidates = (
  statuses: Iterable<WorktreeStatus>,
  options: CandidateSelectionOptions = {}
): ReadonlyArray<DeletionCandidate> => {
  const now = options.now ?? new Date()
  const minimumAgeDays = options.minimumAgeDays ?? defaultMinimumAgeDays
  const candidates: Array<DeletionCandidate> = []

  for (const status of statuses) {
    const decision = evaluateDeletion(status)
    const ageDays = getAgeDays(status.lastCommitAt, now)

    if (decision.deletable && ageDays > minimumAgeDays) {
      candidates.push({
        path: status.path,
        ageDays,
        status,
        decision
      })
    }
  }

  return candidates
}

const getAgeDays = (date: string, now: Date): number =>
  Math.floor((now.getTime() - new Date(date).getTime()) / millisecondsPerDay)
