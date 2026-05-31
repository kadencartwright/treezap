import { spawnSync } from "node:child_process";
import { performance } from "node:perf_hooks";

import { Data, Effect, Either } from "effect";

import {
  parseWorktreePorcelain,
  type WorktreePorcelainEntry,
} from "./worktreePorcelain";

export type GitPath = string;
export type CommitHash = string;
export type RefName = string;
export type BranchName = string;

export type GitHead =
  | {
      readonly kind: "branch";
      readonly branch: BranchName;
      readonly commit: CommitHash;
    }
  | {
      readonly kind: "detached";
      readonly commit: CommitHash;
    };

export interface WorkingTreeChanges {
  readonly dirty: boolean;
  readonly untracked: boolean;
  readonly porcelain: string;
}

export interface UpstreamStatus {
  readonly upstream?: RefName;
  readonly ahead: number;
  readonly behind: number;
}

export interface StatusV2BranchInspection {
  readonly head: GitHead;
  readonly changes: WorkingTreeChanges;
  readonly upstream: UpstreamStatus;
}

export interface GitWorktreeInspection {
  readonly path: GitPath;
  readonly isInsideWorkTree: boolean;
  readonly head: GitHead;
  readonly lastCommitAt: string;
  readonly changes: WorkingTreeChanges;
  readonly upstream: UpstreamStatus;
}

export interface GitWorktreeInspectionOptions {
  readonly lastCommitAt?: string;
}

export interface CherryCommit {
  readonly hash: CommitHash;
}

export interface PatchEquivalence {
  readonly base: RefName;
  readonly uniquePatchCount: number;
  readonly equivalentPatchCount: number;
  readonly uniqueCommits: ReadonlyArray<CherryCommit>;
  readonly equivalentCommits: ReadonlyArray<CherryCommit>;
}

export interface GitCommandResult {
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

export interface GitCommandTiming {
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly exitCode: number | undefined;
  readonly durationMs: number;
}

export interface GitTimingSummary {
  readonly totalCommands: number;
  readonly totalDurationMs: number;
  readonly byCommand: ReadonlyArray<{
    readonly command: string;
    readonly count: number;
    readonly totalDurationMs: number;
    readonly averageDurationMs: number;
  }>;
}

export class GitCommandError extends Data.TaggedError("GitCommandError")<{
  readonly cwd: string;
  readonly args: ReadonlyArray<string>;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number | undefined;
  readonly cause: unknown;
}> {}

export type WorktreeRemoveFailureReason =
  | "contains_submodules"
  | "dirty_worktree"
  | "locked_worktree";

export class GitRemoveWorktreeError extends Data.TaggedError(
  "GitRemoveWorktreeError",
)<{
  readonly path: GitPath;
  readonly reason: WorktreeRemoveFailureReason;
  readonly commandError: GitCommandError;
}> {}

const gitCommandTimings: Array<GitCommandTiming> = [];

export const resetGitCommandTimings = (): void => {
  gitCommandTimings.length = 0;
};

export const getGitCommandTimings = (): ReadonlyArray<GitCommandTiming> => [
  ...gitCommandTimings,
];

export const summarizeGitCommandTimings = (): GitTimingSummary => {
  const byCommand = new Map<
    string,
    { count: number; totalDurationMs: number }
  >();

  for (const timing of gitCommandTimings) {
    const command = timing.args.join(" ");
    const existing = byCommand.get(command) ?? {
      count: 0,
      totalDurationMs: 0,
    };
    existing.count += 1;
    existing.totalDurationMs += timing.durationMs;
    byCommand.set(command, existing);
  }

  const totalDurationMs = gitCommandTimings.reduce(
    (total, timing) => total + timing.durationMs,
    0,
  );

  return {
    totalCommands: gitCommandTimings.length,
    totalDurationMs,
    byCommand: Array.from(byCommand, ([command, value]) => ({
      command,
      count: value.count,
      totalDurationMs: value.totalDurationMs,
      averageDurationMs: value.totalDurationMs / value.count,
    })).sort((left, right) => right.totalDurationMs - left.totalDurationMs),
  };
};

export const runGit = (
  cwd: string,
  args: ReadonlyArray<string>,
): Effect.Effect<GitCommandResult, GitCommandError> => {
  const spawn = Effect.try({
    try: () => {
      const startedAt = performance.now();
      const result = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
      });
      gitCommandTimings.push({
        cwd,
        args,
        exitCode: result.status ?? undefined,
        durationMs: performance.now() - startedAt,
      });
      return result;
    },
    catch: (cause): GitCommandError =>
      new GitCommandError({
        cwd,
        args,
        stdout: "",
        stderr: "",
        exitCode: undefined,
        cause,
      }),
  });

  return spawn.pipe(
    Effect.flatMap((result) => {
      if (result.error !== undefined || result.status !== 0) {
        return Effect.fail(
          new GitCommandError({
            cwd,
            args,
            stdout: result.stdout,
            stderr: result.stderr,
            exitCode: result.status ?? undefined,
            cause: result.error ?? result,
          }),
        );
      }

      return Effect.succeed({
        cwd,
        args,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.status,
      });
    }),
  );
};

export const listWorktrees = (
  repoPath: GitPath,
): Effect.Effect<ReadonlyArray<WorktreePorcelainEntry>, GitCommandError> =>
  runGit(repoPath, ["worktree", "list", "--porcelain", "-z"]).pipe(
    Effect.map((result) => parseWorktreePorcelain(result.stdout)),
  );

export const inspectWorktree = (
  path: GitPath,
  options: GitWorktreeInspectionOptions = {},
): Effect.Effect<GitWorktreeInspection, GitCommandError> =>
  Effect.gen(function* () {
    const lastCommitAt =
      options.lastCommitAt ??
      (yield* runGit(path, ["log", "-1", "--format=%cI"]).pipe(
        Effect.map((result) => result.stdout.trim()),
      ));
    const status = yield* getStatusV2BranchInspection(path);

    return {
      path,
      isInsideWorkTree: true,
      head: status.head,
      lastCommitAt,
      changes: status.changes,
      upstream: status.upstream,
    };
  });

export const getDefaultRemoteBranch = (
  path: GitPath,
): Effect.Effect<RefName | undefined, never> =>
  runGit(path, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]).pipe(
    Effect.map((result) => result.stdout.trim()),
    Effect.catchAll(() => Effect.succeed(undefined)),
  );

export const inspectPatchEquivalence = (
  path: GitPath,
  base: RefName,
): Effect.Effect<PatchEquivalence, GitCommandError> =>
  runGit(path, ["cherry", base, "HEAD"]).pipe(
    Effect.map((result) => parseGitCherryOutput(base, result.stdout)),
  );

export const getCommitDates = (
  repoPath: GitPath,
  commits: Iterable<CommitHash>,
): Effect.Effect<ReadonlyMap<CommitHash, string>, GitCommandError> => {
  const uniqueCommits = Array.from(new Set(commits)).filter(
    (commit) => commit !== "",
  );

  if (uniqueCommits.length === 0) {
    return Effect.succeed(new Map());
  }

  return runGit(repoPath, [
    "show",
    "-s",
    "--format=%H%x00%cI%x00",
    ...uniqueCommits,
  ]).pipe(Effect.map((result) => parseCommitDates(result.stdout)));
};

export const removeWorktree = (
  path: GitPath,
  options: { readonly force?: boolean } = {},
): Effect.Effect<void, GitCommandError | GitRemoveWorktreeError> => {
  const args = options.force
    ? ["worktree", "remove", "--force", path]
    : ["worktree", "remove", path];

  return runGit(path, args).pipe(
    Effect.either,
    Effect.flatMap(
      (
        result,
      ): Effect.Effect<void, GitCommandError | GitRemoveWorktreeError> => {
        if (Either.isRight(result)) {
          return Effect.void;
        }

        const removeError = classifyRemoveWorktreeError(path, result.left);
        return removeError === undefined
          ? Effect.fail(result.left)
          : Effect.fail(removeError);
      },
    ),
  );
};

export const classifyRemoveWorktreeError = (
  path: GitPath,
  error: GitCommandError,
): GitRemoveWorktreeError | undefined => {
  const reason = classifyRemoveWorktreeFailureReason(error.stderr);

  return reason === undefined
    ? undefined
    : new GitRemoveWorktreeError({
        path,
        reason,
        commandError: error,
      });
};

export const parseWorkingTreeChanges = (
  porcelainStatus: string,
): WorkingTreeChanges => {
  const lines = porcelainStatus.split(/\r?\n/).filter((line) => line !== "");

  return {
    dirty: lines.some((line) => !line.startsWith("??")),
    untracked: lines.some((line) => line.startsWith("??")),
    porcelain: porcelainStatus,
  };
};

export const parseStatusV2BranchInspection = (
  porcelainStatus: string,
): StatusV2BranchInspection => {
  const draft: StatusV2BranchInspectionDraft = {
    commit: "",
    ahead: 0,
    behind: 0,
    dirty: false,
    untracked: false,
  };

  for (const record of porcelainStatus.split("\0")) {
    applyStatusV2Record(draft, record);
  }

  return {
    head: toStatusV2Head(draft),
    changes: {
      dirty: draft.dirty,
      untracked: draft.untracked,
      porcelain: porcelainStatus,
    },
    upstream: {
      upstream: draft.upstream,
      ahead: draft.ahead,
      behind: draft.behind,
    },
  };
};

interface StatusV2BranchInspectionDraft {
  commit: CommitHash;
  branch?: BranchName;
  upstream?: RefName;
  ahead: number;
  behind: number;
  dirty: boolean;
  untracked: boolean;
}

const applyStatusV2Record = (
  draft: StatusV2BranchInspectionDraft,
  record: string,
): void => {
  if (record === "") {
    return;
  }

  if (record.startsWith("# branch.oid ")) {
    draft.commit = record.slice("# branch.oid ".length);
    return;
  }

  if (record.startsWith("# branch.head ")) {
    const value = record.slice("# branch.head ".length);
    draft.branch = value === "(detached)" ? undefined : value;
    return;
  }

  if (record.startsWith("# branch.upstream ")) {
    draft.upstream = record.slice("# branch.upstream ".length);
    return;
  }

  if (record.startsWith("# branch.ab ")) {
    applyStatusV2Divergence(draft, record);
    return;
  }

  if (record.startsWith("? ")) {
    draft.untracked = true;
    return;
  }

  if (isStatusV2TrackedChange(record)) {
    draft.dirty = true;
  }
};

const applyStatusV2Divergence = (
  draft: StatusV2BranchInspectionDraft,
  record: string,
): void => {
  const match = /^# branch\.ab \+(\d+) -(\d+)$/.exec(record);

  if (match === null) {
    return;
  }

  draft.ahead = Number.parseInt(match[1] ?? "0", 10);
  draft.behind = Number.parseInt(match[2] ?? "0", 10);
};

const isStatusV2TrackedChange = (record: string): boolean =>
  record.startsWith("1 ") || record.startsWith("2 ") || record.startsWith("u ");

const toStatusV2Head = (draft: StatusV2BranchInspectionDraft): GitHead =>
  draft.branch === undefined
    ? {
        kind: "detached",
        commit: draft.commit,
      }
    : {
        kind: "branch",
        branch: draft.branch,
        commit: draft.commit,
      };

export const parseDivergence = (
  output: string,
): { readonly ahead: number; readonly behind: number } => {
  const [ahead = "0", behind = "0"] = output.trim().split(/\s+/);

  return {
    ahead: Number.parseInt(ahead, 10),
    behind: Number.parseInt(behind, 10),
  };
};

export const parseGitCherryOutput = (
  base: RefName,
  output: string,
): PatchEquivalence => {
  const uniqueCommits: Array<CherryCommit> = [];
  const equivalentCommits: Array<CherryCommit> = [];

  for (const line of output.split(/\r?\n/)) {
    if (line === "") {
      continue;
    }

    const marker = line[0];
    const hash = line.slice(2).trim().split(/\s+/, 1)[0] ?? "";

    if (hash === "") {
      continue;
    }

    if (marker === "+") {
      uniqueCommits.push({ hash });
      continue;
    }

    if (marker === "-") {
      equivalentCommits.push({ hash });
    }
  }

  return {
    base,
    uniquePatchCount: uniqueCommits.length,
    equivalentPatchCount: equivalentCommits.length,
    uniqueCommits,
    equivalentCommits,
  };
};

export const parseCommitDates = (
  output: string,
): ReadonlyMap<CommitHash, string> => {
  const dates = new Map<CommitHash, string>();

  for (const line of output.split(/\r?\n/)) {
    if (line === "") {
      continue;
    }

    const [commit, committedAt] = line.split("\0");

    if (
      commit === undefined ||
      commit === "" ||
      committedAt === undefined ||
      committedAt === ""
    ) {
      continue;
    }

    dates.set(commit, committedAt);
  }

  return dates;
};

const getStatusV2BranchInspection = (
  path: GitPath,
): Effect.Effect<StatusV2BranchInspection, GitCommandError> =>
  runGit(path, ["status", "--porcelain=v2", "--branch", "-z"]).pipe(
    Effect.map((result) => parseStatusV2BranchInspection(result.stdout)),
  );

const classifyRemoveWorktreeFailureReason = (
  stderr: string,
): WorktreeRemoveFailureReason | undefined => {
  if (
    stderr.includes(
      "working trees containing submodules cannot be moved or removed",
    )
  ) {
    return "contains_submodules";
  }

  if (stderr.includes("cannot remove a locked working tree")) {
    return "locked_worktree";
  }

  if (
    stderr.includes("contains modified or untracked files") ||
    stderr.includes("is dirty")
  ) {
    return "dirty_worktree";
  }

  return undefined;
};
