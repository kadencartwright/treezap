import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { Effect } from "effect"

import { inspectPath } from "../src/status"

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

test("inspects a clean repository with no upstream", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-status-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])

  const status = await Effect.runPromise(inspectPath(repo))

  assert.equal(status.path, repo)
  assert.equal(status.exists, true)
  assert.equal(status.isGitWorktree, true)
  assert.deepEqual(status.status, { kind: "branch", branch: "main" })
  assert.match(status.head, /^[0-9a-f]{40}$/)
  assert.equal(status.lastCommitAt, "2026-01-01T12:00:00Z")
  assert.equal(status.upstream, undefined)
  assert.equal(status.dirty, false)
  assert.equal(status.untracked, false)
  assert.equal(status.ahead, 0)
  assert.equal(status.behind, 0)
})

test("inspects tracked and untracked working tree changes", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-status-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])

  writeFileSync(join(repo, "README.md"), "# changed repo\n")
  writeFileSync(join(repo, "scratch.txt"), "scratch\n")

  const status = await Effect.runPromise(inspectPath(repo))

  assert.equal(status.dirty, true)
  assert.equal(status.untracked, true)
})

test("inspects upstream and ahead count", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-status-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const remote = join(root, "remote.git")
  const repo = join(root, "repo")

  git(root, ["init", "--quiet", "--bare", remote])
  git(root, ["clone", "--quiet", remote, repo])
  git(repo, ["switch", "--quiet", "-c", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"])

  writeFileSync(join(repo, "local.txt"), "local\n")
  git(repo, ["add", "local.txt"])
  git(repo, ["commit", "--quiet", "-m", "local commit"])

  const status = await Effect.runPromise(inspectPath(repo))

  assert.equal(status.upstream, "origin/main")
  assert.equal(status.ahead, 1)
  assert.equal(status.behind, 0)
})

test("inspects a detached repository", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-status-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])
  git(repo, ["switch", "--quiet", "--detach", "HEAD"])

  const status = await Effect.runPromise(inspectPath(repo))

  assert.deepEqual(status.status, { kind: "detached" })
})
