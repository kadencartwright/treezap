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
  lastCommitAt: "2026-01-01T12:00:00Z",
  ...overrides
})

test("marks a clean repository with no upstream as not deletable", () => {
  assert.deepEqual(evaluateDeletion(cleanStatus()), {
    deletable: false,
    reasons: ["missing_upstream"]
  })
})

test("marks dirty, untracked, and ahead worktrees as not deletable", () => {
  assert.deepEqual(
    evaluateDeletion(
      cleanStatus({
        upstream: "origin/main",
        dirty: true,
        untracked: true,
        ahead: 1
      })
    ),
    {
      deletable: false,
      reasons: ["dirty", "untracked", "unpushed"]
    }
  )
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
