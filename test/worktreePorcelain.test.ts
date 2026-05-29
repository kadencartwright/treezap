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

test("parses real git porcelain for a detached linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-porcelain-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")
  const detachedWorktree = join(root, "detached-worktree")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "sentinel-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])
  git(repo, ["worktree", "add", "--quiet", "--detach", detachedWorktree, "HEAD"])

  const parsed = parseWorktreePorcelain(git(repo, ["worktree", "list", "--porcelain"]))
  const detached = new Map(parsed.map((entry) => [entry.path, entry])).get(detachedWorktree)

  assert.ok(detached)
  assert.match(detached.head ?? "", /^[0-9a-f]{40}$/)
  assert.equal(detached.branch, undefined)
  assert.equal(detached.detached, true)
})

test("parses real git porcelain for a locked linked worktree with a spaced path", (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-porcelain-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")
  const lockedWorktree = join(root, "locked worktree")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "sentinel-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])
  git(repo, ["worktree", "add", "--quiet", "-b", "feature/locked", lockedWorktree, "HEAD"])
  git(repo, ["worktree", "lock", "--reason", "active agent run", lockedWorktree])

  const parsed = parseWorktreePorcelain(git(repo, ["worktree", "list", "--porcelain"]))
  const locked = new Map(parsed.map((entry) => [entry.path, entry])).get(lockedWorktree)

  assert.ok(locked)
  assert.equal(locked.branch, "feature/locked")
  assert.equal(locked.detached, false)
  assert.equal(locked.locked, true)
  assert.equal(locked.lockReason, "active agent run")
})
