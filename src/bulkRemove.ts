import { Effect, Either } from "effect"

import { removePath, type RemoveEvaluationResult } from "./remove"
import { collectScanRoot, type ScanRootError } from "./scan"

export interface BulkRemoveOptions {
  readonly minimumAgeDays?: number
}

export interface BulkRemoveFailure {
  readonly path: string
  readonly error: unknown
}

export interface BulkRemoveResult {
  readonly root: string
  readonly minimumAgeDays: number
  readonly deleted: ReadonlyArray<RemoveEvaluationResult>
  readonly skipped: ReadonlyArray<RemoveEvaluationResult>
  readonly failed: ReadonlyArray<BulkRemoveFailure>
}

interface BulkRemoveBuckets {
  readonly deleted: Array<RemoveEvaluationResult>
  readonly skipped: Array<RemoveEvaluationResult>
  readonly failed: Array<BulkRemoveFailure>
}

const defaultMinimumAgeDays = 30

export const removeOldWorktrees = (
  root: string,
  options: BulkRemoveOptions = {}
): Effect.Effect<BulkRemoveResult, ScanRootError> =>
  Effect.gen(function* () {
    const minimumAgeDays = options.minimumAgeDays ?? defaultMinimumAgeDays
    const scan = yield* collectScanRoot(root)
    const deleted: Array<RemoveEvaluationResult> = []
    const skipped: Array<RemoveEvaluationResult> = []
    const failed: Array<BulkRemoveFailure> = []
    const linkedWorktrees = scan.repositories.flatMap((repository) =>
      repository.worktrees
        .filter((worktree) => worktree.path !== repository.path)
        .map((worktree) => worktree.path)
    )

    yield* Effect.forEach(
      linkedWorktrees,
      (path) =>
        removePath(path, { minimumAgeDays }).pipe(
          Effect.either,
          Effect.map((result) =>
            recordRemoveResult(path, result, {
              deleted,
              skipped,
              failed
            })
          )
        ),
      { discard: true }
    )

    return {
      root,
      minimumAgeDays,
      deleted,
      skipped,
      failed
    }
  })

const recordRemoveResult = (
  path: string,
  result: Either.Either<RemoveEvaluationResult, unknown>,
  buckets: BulkRemoveBuckets
): void => {
  if (Either.isLeft(result)) {
    buckets.failed.push({
      path,
      error: result.left
    })
    return
  }

  if (result.right.deleted) {
    buckets.deleted.push(result.right)
    return
  }

  buckets.skipped.push(result.right)
}
