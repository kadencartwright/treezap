import { Effect } from "effect";

import {
  type CommittedWorkStatus,
  inspectCommittedWork,
} from "./committedWork";
import { type GitCommandError, type GitHead, inspectWorktree } from "./git";
import type { WorktreePorcelainStatus } from "./worktreePorcelain";

export interface WorktreeStatus {
  readonly path: string;
  readonly exists: boolean;
  readonly isGitWorktree: boolean;
  readonly status: WorktreePorcelainStatus;
  readonly head: string;
  readonly upstream?: string;
  readonly dirty: boolean;
  readonly untracked: boolean;
  readonly ahead: number;
  readonly behind: number;
  readonly committedWork?: CommittedWorkStatus;
  readonly lastCommitAt: string;
}

export type StatusError = GitCommandError;

export interface InspectPathOptions {
  readonly defaultBranch?: string | null;
  readonly lastCommitAt?: string;
}

export const inspectPath = (
  path: string,
  options: InspectPathOptions = {},
): Effect.Effect<WorktreeStatus, StatusError> =>
  Effect.gen(function* () {
    const worktree = yield* inspectWorktree(path, {
      lastCommitAt: options.lastCommitAt,
    });
    const committedWork = yield* inspectCommittedWork(path, {
      defaultBranch: options.defaultBranch,
    });

    return {
      path,
      exists: true,
      isGitWorktree: worktree.isInsideWorkTree,
      status: toWorktreePorcelainStatus(worktree.head),
      head: worktree.head.commit,
      lastCommitAt: worktree.lastCommitAt,
      upstream: worktree.upstream.upstream,
      dirty: worktree.changes.dirty,
      untracked: worktree.changes.untracked,
      ahead: worktree.upstream.ahead,
      behind: worktree.upstream.behind,
      committedWork,
    };
  });

const toWorktreePorcelainStatus = (head: GitHead): WorktreePorcelainStatus =>
  head.kind === "branch"
    ? {
        kind: "branch",
        branch: head.branch,
      }
    : {
        kind: "detached",
      };
