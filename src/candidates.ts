import { Effect, Stream } from "effect"

import {
  selectDeletionCandidates,
  type CandidateSelectionOptions,
  type DeletionCandidate
} from "./deletable"
import { scanRoot, type ScanRootError } from "./scan"
import { inspectPath, type StatusError } from "./status"

export interface CandidateResult {
  readonly root: string
  readonly minimumAgeDays: number
  readonly candidates: ReadonlyArray<DeletionCandidate>
}

export type CandidateError = ScanRootError | StatusError

export const collectCandidates = (
  root: string,
  options: CandidateSelectionOptions = {}
): Effect.Effect<CandidateResult, CandidateError> => {
  const minimumAgeDays = options.minimumAgeDays ?? 30

  return scanRoot(root).pipe(
    Stream.flatMap((repository) => Stream.fromIterable(repository.worktrees)),
    Stream.mapEffect((worktree) => inspectPath(worktree.path)),
    Stream.runCollect,
    Effect.map((statuses) =>
      selectDeletionCandidates(statuses, {
        ...options,
        minimumAgeDays
      })
    ),
    Effect.map((candidates): CandidateResult => ({
      root,
      minimumAgeDays,
      candidates
    }))
  )
}
