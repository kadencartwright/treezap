import { Effect, Ref, Stream } from "effect"

import {
  calculateAgeDays,
  evaluateDeletion,
  selectDeletionCandidates,
  type CandidateSelectionOptions,
  type DeletionCandidate,
  type DeletionDecision,
  type DeletionReason
} from "./deletable"
import { clearProgress, renderProgressBar, writeProgress } from "./progress"
import { scanRoot, type ScanOptions, type ScanRootError } from "./scan"
import { inspectPath, type StatusError, type WorktreeStatus } from "./status"
import { isInspectableLinkedWorktree } from "./worktreePorcelain"

export interface CandidateCounts {
  readonly deletable: number
  readonly oldEnoughBlocked: {
    readonly total: number
    readonly reasons: Readonly<Record<DeletionReason, number>>
  }
}

export interface CandidateEvaluation {
  readonly path: string
  readonly ageDays: number
  readonly status: WorktreeStatus
  readonly decision: DeletionDecision
}

export interface CandidateResult {
  readonly root: string
  readonly minimumAgeDays: number
  readonly counts: CandidateCounts
  readonly candidates: ReadonlyArray<DeletionCandidate>
  readonly blockedCandidates: ReadonlyArray<CandidateEvaluation>
}

export type CandidateError = ScanRootError | StatusError

export interface CandidateCollectionOptions extends CandidateSelectionOptions, ScanOptions {
  readonly inspectConcurrency?: number
}

const defaultInspectConcurrency = 128

const summarizeCandidateCounts = (
  input: {
    readonly candidates: ReadonlyArray<DeletionCandidate>
    readonly blockedCandidates: ReadonlyArray<CandidateEvaluation>
  },
): CandidateCounts => {
  const counts = {
    deletable: input.candidates.length,
    oldEnoughBlocked: {
      total: input.blockedCandidates.length,
      reasons: {
        dirty: 0,
        missing_default_branch: 0,
        untracked: 0,
        unique_patches: 0
      }
    }
  }

  for (const candidate of input.blockedCandidates) {
    for (const reason of candidate.decision.reasons) {
      counts.oldEnoughBlocked.reasons[reason] += 1
    }
  }

  return counts
}

const selectSafetyBlockedCandidates = (
  statuses: Iterable<WorktreeStatus>,
  options: Required<Pick<CandidateSelectionOptions, "minimumAgeDays" | "now">>
): ReadonlyArray<CandidateEvaluation> => {
  const blockedCandidates: Array<CandidateEvaluation> = []

  for (const status of statuses) {
    const ageDays = calculateAgeDays(status.lastCommitAt, options.now)
    const decision = evaluateDeletion(status)

    if (ageDays <= options.minimumAgeDays || decision.deletable) {
      continue
    }

    blockedCandidates.push({
      path: status.path,
      ageDays,
      status,
      decision
    })
  }

  return blockedCandidates
}

export const collectCandidates = (
  root: string,
  options: CandidateCollectionOptions = {}
): Effect.Effect<CandidateResult, CandidateError> => {
  const minimumAgeDays = options.minimumAgeDays ?? 30
  const now = options.now ?? new Date()
  const progress = options.progress ?? false

  return scanRoot(root, options).pipe(
    Stream.runCollect,
    Effect.flatMap((repositories) =>
      Effect.gen(function* () {
        const repositoryList = Array.from(repositories)
        const inspectableWorktrees = repositoryList.flatMap((repository) =>
          repository.worktrees.filter((worktree) =>
            isInspectableLinkedWorktree(repository.path, worktree)
          )
        )
        const inspected = yield* Ref.make(0)
        const total = inspectableWorktrees.length
        yield* writeProgress(
          progress,
          renderProgressBar("inspecting worktrees", 0, total, "worktrees")
        )
        const statuses = yield* Effect.forEach(
          inspectableWorktrees,
          (worktree) =>
            inspectPath(worktree.path).pipe(
              Effect.tap(() =>
                Ref.updateAndGet(inspected, (count) => count + 1).pipe(
                  Effect.flatMap((count) =>
                    writeProgress(
                      progress,
                      renderProgressBar("inspecting worktrees", count, total, "worktrees")
                    )
                  )
                )
              )
            ),
          { concurrency: options.inspectConcurrency ?? defaultInspectConcurrency }
        ).pipe(Effect.ensuring(clearProgress(progress)))
        const candidates = selectDeletionCandidates(statuses, {
          ...options,
          minimumAgeDays,
          now
        })
        const blockedCandidates = selectSafetyBlockedCandidates(statuses, {
          minimumAgeDays,
          now
        })
        const counts = summarizeCandidateCounts(
          {
            candidates,
            blockedCandidates
          }
        )

        return {
          counts,
          candidates,
          blockedCandidates
        }
      })
    ),
    Effect.map((result): CandidateResult => ({
      root,
      minimumAgeDays,
      counts: result.counts,
      candidates: result.candidates,
      blockedCandidates: result.blockedCandidates
    }))
  )
}
