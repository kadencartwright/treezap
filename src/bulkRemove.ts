import { Effect, Either, Ref } from "effect";
import { clearProgress, renderProgressBar, writeProgress } from "./progress";
import { type RemoveEvaluationResult, removePath } from "./remove";
import { collectScanRoot, type ScanOptions, type ScanRootError } from "./scan";
import { isInspectableLinkedWorktree } from "./worktreePorcelain";

export interface BulkRemoveOptions extends ScanOptions {
  readonly minimumAgeDays?: number;
}

export interface BulkRemoveFailure {
  readonly path: string;
  readonly error: unknown;
}

export interface BulkRemoveResult {
  readonly root: string;
  readonly minimumAgeDays: number;
  readonly deleted: ReadonlyArray<RemoveEvaluationResult>;
  readonly skipped: ReadonlyArray<RemoveEvaluationResult>;
  readonly failed: ReadonlyArray<BulkRemoveFailure>;
}

interface BulkRemoveBuckets {
  readonly deleted: Array<RemoveEvaluationResult>;
  readonly skipped: Array<RemoveEvaluationResult>;
  readonly failed: Array<BulkRemoveFailure>;
}

const defaultMinimumAgeDays = 30;

const renderRemovalProgress = (
  completed: number,
  total: number,
  buckets: BulkRemoveBuckets,
): string =>
  renderProgressBar(
    "deleting worktrees",
    completed,
    total,
    `${buckets.deleted.length} deleted, ${buckets.skipped.length} skipped, ${buckets.failed.length} failed`,
  );

export const removeOldWorktrees = (
  root: string,
  options: BulkRemoveOptions = {},
): Effect.Effect<BulkRemoveResult, ScanRootError> =>
  Effect.gen(function* () {
    const minimumAgeDays = options.minimumAgeDays ?? defaultMinimumAgeDays;
    const scan = yield* collectScanRoot(root, options);
    const deleted: Array<RemoveEvaluationResult> = [];
    const skipped: Array<RemoveEvaluationResult> = [];
    const failed: Array<BulkRemoveFailure> = [];
    const linkedWorktrees = scan.repositories.flatMap((repository) =>
      repository.worktrees
        .filter((worktree) =>
          isInspectableLinkedWorktree(repository.path, worktree),
        )
        .map((worktree) => worktree.path),
    );
    const progress = options.progress ?? false;
    const buckets = {
      deleted,
      skipped,
      failed,
    };
    const completed = yield* Ref.make(0);

    yield* writeProgress(
      progress,
      renderRemovalProgress(0, linkedWorktrees.length, buckets),
    );
    yield* Effect.forEach(
      linkedWorktrees,
      (path) =>
        removePath(path, { minimumAgeDays }).pipe(
          Effect.either,
          Effect.flatMap((result) =>
            Effect.sync(() => recordRemoveResult(path, result, buckets)).pipe(
              Effect.flatMap(() =>
                Ref.updateAndGet(completed, (count) => count + 1),
              ),
              Effect.flatMap((count) =>
                writeProgress(
                  progress,
                  renderRemovalProgress(count, linkedWorktrees.length, buckets),
                ),
              ),
            ),
          ),
        ),
      { discard: true },
    ).pipe(Effect.ensuring(clearProgress(progress)));

    return {
      root,
      minimumAgeDays,
      deleted,
      skipped,
      failed,
    };
  });

const recordRemoveResult = (
  path: string,
  result: Either.Either<RemoveEvaluationResult, unknown>,
  buckets: BulkRemoveBuckets,
): void => {
  if (Either.isLeft(result)) {
    buckets.failed.push({
      path,
      error: result.left,
    });
    return;
  }

  if (result.right.deleted) {
    buckets.deleted.push(result.right);
    return;
  }

  buckets.skipped.push(result.right);
};
