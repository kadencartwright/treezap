import assert from "node:assert/strict"
import test from "node:test"

import { evaluateDeletion } from "../src/deletable"
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
