import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

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

test("stat command prints JSON safety facts for a clean repository", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-stat-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])

  const output = execFileSync(process.execPath, ["--import", "tsx", "src/main.ts", "stat", repo], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
  const parsed = JSON.parse(output)

  assert.equal(parsed.path, repo)
  assert.equal(parsed.exists, true)
  assert.equal(parsed.isGitWorktree, true)
  assert.deepEqual(parsed.status, { kind: "branch", branch: "main" })
  assert.match(parsed.head, /^[0-9a-f]{40}$/)
  assert.equal(parsed.dirty, false)
  assert.equal(parsed.untracked, false)
  assert.equal(parsed.ahead, 0)
  assert.equal(parsed.behind, 0)
  assert.equal(parsed.deletable, false)
  assert.deepEqual(parsed.reasons, ["missing_upstream"])
})
