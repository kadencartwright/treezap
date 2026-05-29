import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
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

test("scan command prints JSON inventory for repositories under a root", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-scan-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")
  const linkedWorktree = join(root, "linked-worktree")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])
  git(repo, ["worktree", "add", "--quiet", "-b", "feature/linked", linkedWorktree, "HEAD"])

  const output = execFileSync(process.execPath, ["--import", "tsx", "src/main.ts", "scan", root], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
  const parsed = JSON.parse(output)

  assert.equal(parsed.root, root)
  assert.deepEqual(
    parsed.repositories.map((repository: { path: string }) => repository.path),
    [repo]
  )
  assert.deepEqual(
    parsed.repositories[0].worktrees.map((worktree: { path: string; status: unknown }) => [
      worktree.path,
      worktree.status
    ]),
    [
      [repo, { kind: "branch", branch: "main" }],
      [linkedWorktree, { kind: "branch", branch: "feature/linked" }]
    ]
  )
})

test("scan command prints repository check progress to stderr", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-scan-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const repo = join(root, "repo")

  mkdirSync(repo)
  git(repo, ["init", "--quiet", "--initial-branch", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "initial commit"])

  const result = spawnSync(process.execPath, ["--import", "tsx", "src/main.ts", "scan", root], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      TREEZAP_PROGRESS: "1"
    },
    encoding: "utf8"
  })

  assert.equal(result.status, 0)
  assert.doesNotThrow(() => JSON.parse(result.stdout))
  assert.match(result.stderr, /treezap: scanning repos/)
  assert.match(result.stderr, /treezap: checking repos \[/)
  assert.match(result.stderr, /1\/1 repo/)
  assert.match(result.stderr, /1 worktree/)
  assert.doesNotMatch(result.stderr, /discovered 1 repo\n/)
})
