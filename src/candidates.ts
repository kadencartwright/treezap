import { Effect, Ref, Stream } from "effect";
import {
  type CandidateSelectionOptions,
  calculateAgeDays,
  type DeletionCandidate,
  type DeletionDecision,
  type DeletionReason,
  evaluateDeletion,
  selectDeletionCandidates,
} from "./deletable";
import { getCommitDates, getDefaultRemoteBranch, type RefName } from "./git";
import { clearProgress, renderProgressBar, writeProgress } from "./progress";
import {
  type ScannedRepository,
  type ScanOptions,
  type ScanRootError,
  scanRoot,
} from "./scan";
import { inspectPath, type StatusError, type WorktreeStatus } from "./status";
import {
  isInspectableLinkedWorktree,
  type WorktreePorcelainEntry,
} from "./worktreePorcelain";

export interface CandidateCounts {
  readonly deletable: number;
  readonly oldEnoughBlocked: {
    readonly total: number;
    readonly reasons: Readonly<Record<DeletionReason, number>>;
  };
}

export interface CandidateEvaluation {
  readonly path: string;
  readonly ageDays: number;
  readonly status: WorktreeStatus;
  readonly decision: DeletionDecision;
}

export interface CandidateResult {
  readonly root: string;
  readonly minimumAgeDays: number;
  readonly counts: CandidateCounts;
  readonly candidates: ReadonlyArray<DeletionCandidate>;
  readonly blockedCandidates: ReadonlyArray<CandidateEvaluation>;
}

export type CandidateError = ScanRootError | StatusError;

export interface CandidateCollectionOptions
  extends CandidateSelectionOptions,
    ScanOptions {
  readonly inspectConcurrency?: number;
}

const defaultRepoConcurrency = 16;
const defaultInspectConcurrency = 2;

interface InspectableWorktree {
  readonly path: string;
  readonly worktree: WorktreePorcelainEntry;
  readonly defaultBranch: RefName | undefined;
  readonly lastCommitAt?: string;
}

interface InspectableRepository {
  readonly path: string;
  readonly worktrees: ReadonlyArray<InspectableWorktree>;
}

interface CandidateProgressContext {
  readonly progress: boolean;
  readonly inspected: Ref.Ref<number>;
  readonly total: number;
}

const summarizeCandidateCounts = (input: {
  readonly candidates: ReadonlyArray<DeletionCandidate>;
  readonly blockedCandidates: ReadonlyArray<CandidateEvaluation>;
}): CandidateCounts => {
  const counts = {
    deletable: input.candidates.length,
    oldEnoughBlocked: {
      total: input.blockedCandidates.length,
      reasons: {
        dirty: 0,
        missing_default_branch: 0,
        untracked: 0,
        unique_patches: 0,
      },
    },
  };

  for (const candidate of input.blockedCandidates) {
    for (const reason of candidate.decision.reasons) {
      counts.oldEnoughBlocked.reasons[reason] += 1;
    }
  }

  return counts;
};

const selectSafetyBlockedCandidates = (
  statuses: Iterable<WorktreeStatus>,
  options: Required<Pick<CandidateSelectionOptions, "minimumAgeDays" | "now">>,
): ReadonlyArray<CandidateEvaluation> => {
  const blockedCandidates: Array<CandidateEvaluation> = [];

  for (const status of statuses) {
    const ageDays = calculateAgeDays(status.lastCommitAt, options.now);
    const decision = evaluateDeletion(status);

    if (ageDays <= options.minimumAgeDays || decision.deletable) {
      continue;
    }

    blockedCandidates.push({
      path: status.path,
      ageDays,
      status,
      decision,
    });
  }

  return blockedCandidates;
};

export const collectCandidates = (
  root: string,
  options: CandidateCollectionOptions = {},
): Effect.Effect<CandidateResult, CandidateError> =>
  Effect.gen(function* () {
    const minimumAgeDays = options.minimumAgeDays ?? 30;
    const now = options.now ?? new Date();
    const progress = options.progress ?? false;
    const repoConcurrency = options.concurrency ?? defaultRepoConcurrency;
    const repositories = yield* Stream.runCollect(scanRoot(root, options));
    const inspectableRepositories = yield* collectInspectableRepositories(
      Array.from(repositories),
      repoConcurrency,
    );
    const oldEnoughRepositories = selectOldEnoughRepositories(
      inspectableRepositories,
      { minimumAgeDays, now },
    );
    const total = countInspectableWorktrees(inspectableRepositories);
    const inspected = yield* Ref.make(0);
    const progressContext = {
      progress,
      inspected,
      total,
    };

    yield* writeProgress(
      progress,
      renderProgressBar("inspecting worktrees", 0, total, "worktrees"),
    );
    const statuses = yield* inspectCandidateRepositories(
      oldEnoughRepositories,
      progressContext,
      {
        inspectConcurrency:
          options.inspectConcurrency ?? defaultInspectConcurrency,
        repoConcurrency,
      },
    ).pipe(Effect.ensuring(clearProgress(progress)));
    const candidates = selectDeletionCandidates(statuses, {
      ...options,
      minimumAgeDays,
      now,
    });
    const blockedCandidates = selectSafetyBlockedCandidates(statuses, {
      minimumAgeDays,
      now,
    });
    const counts = summarizeCandidateCounts({
      candidates,
      blockedCandidates,
    });

    return {
      root,
      minimumAgeDays,
      counts,
      candidates,
      blockedCandidates,
    };
  });

const collectInspectableRepositories = (
  repositories: ReadonlyArray<ScannedRepository>,
  repoConcurrency: number,
): Effect.Effect<ReadonlyArray<InspectableRepository>, CandidateError> =>
  Effect.forEach(
    repositories,
    (repository) => collectInspectableRepository(repository),
    { concurrency: repoConcurrency },
  );

const collectInspectableRepository = (
  repository: ScannedRepository,
): Effect.Effect<InspectableRepository, CandidateError> =>
  Effect.gen(function* () {
    const worktrees = repository.worktrees.filter((worktree) =>
      isInspectableLinkedWorktree(repository.path, worktree),
    );
    const defaultBranch = yield* getDefaultRemoteBranch(repository.path);
    const commitDates = yield* getCommitDates(
      repository.path,
      worktrees.flatMap((worktree) =>
        worktree.head === undefined ? [] : [worktree.head],
      ),
    );

    return {
      path: repository.path,
      worktrees: worktrees.map(
        (worktree): InspectableWorktree => ({
          path: worktree.path,
          worktree,
          defaultBranch,
          lastCommitAt:
            worktree.head === undefined
              ? undefined
              : commitDates.get(worktree.head),
        }),
      ),
    };
  });

const selectOldEnoughRepositories = (
  repositories: ReadonlyArray<InspectableRepository>,
  options: Required<Pick<CandidateSelectionOptions, "minimumAgeDays" | "now">>,
): ReadonlyArray<InspectableRepository> =>
  repositories.map(
    (repository): InspectableRepository => ({
      path: repository.path,
      worktrees: repository.worktrees.filter(
        (worktree) =>
          worktree.lastCommitAt === undefined ||
          calculateAgeDays(worktree.lastCommitAt, options.now) >
            options.minimumAgeDays,
      ),
    }),
  );

const countInspectableWorktrees = (
  repositories: ReadonlyArray<InspectableRepository>,
): number =>
  repositories.reduce(
    (count, repository) => count + repository.worktrees.length,
    0,
  );

const inspectCandidateRepositories = (
  repositories: ReadonlyArray<InspectableRepository>,
  progressContext: CandidateProgressContext,
  concurrency: {
    readonly inspectConcurrency: number;
    readonly repoConcurrency: number;
  },
): Effect.Effect<ReadonlyArray<WorktreeStatus>, CandidateError> =>
  Effect.gen(function* () {
    const statusesByRepository = yield* Effect.forEach(
      repositories,
      (repository) =>
        inspectCandidateRepository(
          repository,
          progressContext,
          concurrency.inspectConcurrency,
        ),
      { concurrency: concurrency.repoConcurrency },
    );
    yield* completeInspectionProgress(progressContext);
    return statusesByRepository.flat();
  });

const inspectCandidateRepository = (
  repository: InspectableRepository,
  progressContext: CandidateProgressContext,
  inspectConcurrency: number,
): Effect.Effect<ReadonlyArray<WorktreeStatus>, CandidateError> =>
  Effect.forEach(
    repository.worktrees,
    (worktree) => inspectCandidateWorktree(worktree, progressContext),
    { concurrency: inspectConcurrency },
  );

const inspectCandidateWorktree = (
  worktree: InspectableWorktree,
  progressContext: CandidateProgressContext,
): Effect.Effect<WorktreeStatus, CandidateError> =>
  Effect.gen(function* () {
    const status = yield* inspectPath(worktree.path, {
      defaultBranch: worktree.defaultBranch ?? null,
      lastCommitAt: worktree.lastCommitAt,
    });
    yield* updateInspectionProgress(progressContext);
    return status;
  });

const updateInspectionProgress = (
  context: CandidateProgressContext,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    const count = yield* Ref.updateAndGet(
      context.inspected,
      (current) => current + 1,
    );
    yield* writeProgress(
      context.progress,
      renderProgressBar(
        "inspecting worktrees",
        count,
        context.total,
        "worktrees",
      ),
    );
  });

const completeInspectionProgress = (
  context: CandidateProgressContext,
): Effect.Effect<void> =>
  Effect.gen(function* () {
    yield* Ref.set(context.inspected, context.total);
    yield* writeProgress(
      context.progress,
      renderProgressBar(
        "inspecting worktrees",
        context.total,
        context.total,
        "worktrees",
      ),
    );
  });
