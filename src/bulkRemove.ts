import { Effect, Either, Ref } from "effect";
import { clearProgress, renderProgressBar, writeProgress } from "./progress";
import { type RemoveEvaluationResult, removePath } from "./remove";
import {
  collectScanRoot,
  type ScannedRepository,
  type ScanOptions,
  type ScanRootError,
} from "./scan";
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

interface RemovableRepository {
  readonly path: string;
  readonly worktrees: ReadonlyArray<string>;
}

interface RemovalProgressContext {
  readonly progress: boolean;
  readonly total: number;
  readonly buckets: BulkRemoveBuckets;
  readonly completed: Ref.Ref<number>;
}

const defaultMinimumAgeDays = 30;
const defaultRepoConcurrency = 16;

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
    const repositories = scan.repositories.map(toRemovableRepository);
    const total = countRemovableWorktrees(repositories);
    const progress = options.progress ?? false;
    const repoConcurrency = options.concurrency ?? defaultRepoConcurrency;
    const buckets = {
      deleted,
      skipped,
      failed,
    };
    const completed = yield* Ref.make(0);
    const progressContext = {
      progress,
      total,
      buckets,
      completed,
    };

    yield* writeProgress(progress, renderRemovalProgress(0, total, buckets));
    yield* Effect.forEach(
      repositories,
      (repository) =>
        removeRepositoryWorktrees(repository, minimumAgeDays, progressContext),
      { concurrency: repoConcurrency, discard: true },
    ).pipe(Effect.ensuring(clearProgress(progress)));

    return {
      root,
      minimumAgeDays,
      deleted,
      skipped,
      failed,
    };
  });

const toRemovableRepository = (
  repository: ScannedRepository,
): RemovableRepository => ({
  path: repository.path,
  worktrees: repository.worktrees
    .filter((worktree) =>
      isInspectableLinkedWorktree(repository.path, worktree),
    )
    .map((worktree) => worktree.path),
});

const countRemovableWorktrees = (
  repositories: ReadonlyArray<RemovableRepository>,
): number =>
  repositories.reduce(
    (count, repository) => count + repository.worktrees.length,
    0,
  );

const removeRepositoryWorktrees = (
  repository: RemovableRepository,
  minimumAgeDays: number,
  progressContext: RemovalProgressContext,
): Effect.Effect<void> =>
  Effect.forEach(
    repository.worktrees,
    (path) => removeWorktreePath(path, minimumAgeDays, progressContext),
    { discard: true },
  );

const removeWorktreePath = (
  path: string,
  minimumAgeDays: number,
  progressContext: RemovalProgressContext,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const result = yield* Effect.either(removePath(path, { minimumAgeDays }));
    recordRemoveResult(path, result, progressContext.buckets);
    yield* updateRemovalProgress(progressContext);
  });

const updateRemovalProgress = (
  context: RemovalProgressContext,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const count = yield* Ref.updateAndGet(
      context.completed,
      (current) => current + 1,
    );
    yield* writeProgress(
      context.progress,
      renderRemovalProgress(count, context.total, context.buckets),
    );
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
