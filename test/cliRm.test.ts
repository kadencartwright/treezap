import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

const git = (
  cwd: string,
  args: ReadonlyArray<string>,
  options: { readonly date?: Date } = {}
): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: options.date?.toISOString(),
      GIT_COMMITTER_DATE: options.date?.toISOString()
    }
  })

test("rm command deletes an eligible linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const remote = join(root, "remote.git")
  const repo = join(root, "repo")
  const linkedWorktree = join(root, "linked-worktree")

  git(root, ["init", "--quiet", "--bare", remote])
  git(root, ["clone", "--quiet", remote, repo])
  git(repo, ["switch", "--quiet", "-c", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate })
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"])
  git(repo, ["branch", "feature/delete-me"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/delete-me"])
  git(repo, ["worktree", "add", "--quiet", linkedWorktree, "feature/delete-me"])

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm", linkedWorktree, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const parsed = JSON.parse(output)

  assert.equal(parsed.path, linkedWorktree)
  assert.equal(parsed.minimumAgeDays, 30)
  assert.equal(parsed.deleted, true)
  assert.equal(parsed.eligible, true)
  assert.equal(parsed.ageDays >= 44, true)
  assert.deepEqual(parsed.decision, {
    deletable: true,
    reasons: []
  })
  assert.equal(parsed.status.path, linkedWorktree)
  assert.equal(existsSync(linkedWorktree), false)
  assert.equal(existsSync(repo), true)
})

test("rm command does not delete an unsafe linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const remote = join(root, "remote.git")
  const repo = join(root, "repo")
  const linkedWorktree = join(root, "linked-worktree")

  git(root, ["init", "--quiet", "--bare", remote])
  git(root, ["clone", "--quiet", remote, repo])
  git(repo, ["switch", "--quiet", "-c", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate })
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"])
  git(repo, ["branch", "feature/keep-me"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/keep-me"])
  git(repo, ["worktree", "add", "--quiet", linkedWorktree, "feature/keep-me"])

  writeFileSync(join(linkedWorktree, "README.md"), "# changed repo\n")

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm", linkedWorktree, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const parsed = JSON.parse(output)

  assert.equal(parsed.path, linkedWorktree)
  assert.equal(parsed.deleted, false)
  assert.equal(parsed.eligible, false)
  assert.deepEqual(parsed.decision.reasons, ["dirty"])
  assert.equal(existsSync(linkedWorktree), true)
})
