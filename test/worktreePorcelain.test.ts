import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { parseWorktreePorcelain } from "../src/worktreePorcelain.ts"

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

test("parses real git porcelain for a repo with one linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-porcelain-"))
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

  const parsed = parseWorktreePorcelain(git(repo, ["worktree", "list", "--porcelain"]))
  const byPath = new Map(parsed.map((entry) => [entry.path, entry]))

  assert.equal(parsed.length, 2)

  const main = byPath.get(repo)
  assert.ok(main)
  assert.match(main.head ?? "", /^[0-9a-f]{40}$/)
  assert.equal(main.branch, "main")
  assert.equal(main.detached, false)

  const linked = byPath.get(linkedWorktree)
  assert.ok(linked)
  assert.match(linked.head ?? "", /^[0-9a-f]{40}$/)
  assert.equal(linked.branch, "feature/linked")
  assert.equal(linked.detached, false)
})
