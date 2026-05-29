import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { Effect } from "effect"

import { listWorktrees } from "../src/worktrees.ts"

const git = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-01-01T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T12:00:00Z"
    }
  })

test("lists real git worktrees for one repository", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-list-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")
  const linkedWorktree = join(root, "linked-worktree")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "sentinel-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])
  git(repo, ["worktree", "add", "--quiet", "-b", "feature/linked", linkedWorktree, "HEAD"])

  const worktrees = await Effect.runPromise(listWorktrees(repo))
  const byPath = new Map(worktrees.map((entry) => [entry.path, entry]))

  assert.equal(worktrees.length, 2)
  assert.deepEqual(byPath.get(repo)?.status, { kind: "branch", branch: "main" })
  assert.deepEqual(byPath.get(linkedWorktree)?.status, { kind: "branch", branch: "feature/linked" })
})
