import assert from "node:assert/strict"
import test from "node:test"

import { evaluateDeletion, selectDeletionCandidates } from "../src/deletable"
import type { WorktreeStatus } from "../src/status"

const cleanStatus = (overrides: Partial<WorktreeStatus> = {}): WorktreeStatus => ({
  path: "/repo",
  exists: true,
  isGitWorktree: true,
  status: { kind: "branch", branch: "main" },
  head: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  dirty: false,
  untracked: false,
  ahead: 0,
  behind: 0,
  committedWork: {
    base: "origin/main",
    uniquePatchCount: 0,
    equivalentPatchCount: 0,
    uniqueCommits: [],
    equivalentCommits: []
  },
  lastCommitAt: "2026-01-01T12:00:00Z",
  ...overrides
})

test("marks a clean worktree with no default branch as not deletable", () => {
  assert.deepEqual(evaluateDeletion(cleanStatus({ committedWork: undefined })), {
    deletable: false,
    reasons: ["missing_default_branch"]
  })
})

test("marks dirty, untracked, and unique-patch worktrees as not deletable", () => {
  assert.deepEqual(
    evaluateDeletion(
      cleanStatus({
        upstream: "origin/main",
        dirty: true,
        untracked: true,
        ahead: 1,
        committedWork: {
          base: "origin/main",
          uniquePatchCount: 1,
          equivalentPatchCount: 0,
          uniqueCommits: [{ hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }],
          equivalentCommits: []
        }
      })
    ),
    {
      deletable: false,
      reasons: ["dirty", "untracked", "unique_patches"]
    }
  )
})

test("does not use missing upstream as a hard blocker when default-branch patches are equivalent", () => {
  assert.deepEqual(evaluateDeletion(cleanStatus({ upstream: undefined, ahead: 1 })), {
    deletable: true,
    reasons: []
  })
})

test("selects only safe worktrees older than the minimum age", () => {
  const now = new Date("2026-05-29T12:00:00Z")

  assert.deepEqual(
    selectDeletionCandidates(
      [
        cleanStatus({
          path: "/old-safe",
          upstream: "origin/main",
          lastCommitAt: "2026-04-28T12:00:00Z"
        }),
        cleanStatus({
          path: "/young-safe",
          upstream: "origin/main",
          lastCommitAt: "2026-04-29T12:00:01Z"
        }),
        cleanStatus({
          path: "/old-unsafe",
          committedWork: undefined,
          lastCommitAt: "2026-04-01T12:00:00Z"
        })
      ],
      { now }
    ),
    [
      {
        path: "/old-safe",
        ageDays: 31,
        status: cleanStatus({
          path: "/old-safe",
          upstream: "origin/main",
          lastCommitAt: "2026-04-28T12:00:00Z"
        }),
        decision: {
          deletable: true,
          reasons: []
        }
      }
    ]
  )
})

test("selects candidates using a custom minimum age", () => {
  const now = new Date("2026-05-29T12:00:00Z")

  assert.deepEqual(
    selectDeletionCandidates(
      [
        cleanStatus({
          path: "/ten-days-old",
          upstream: "origin/main",
          lastCommitAt: "2026-05-19T12:00:00Z"
        })
      ],
      {
        now,
        minimumAgeDays: 7
      }
    ).map((candidate) => candidate.path),
    ["/ten-days-old"]
  )
})
