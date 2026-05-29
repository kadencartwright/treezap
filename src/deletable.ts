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
