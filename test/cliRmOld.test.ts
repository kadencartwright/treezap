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

test("rm-old deletes eligible linked worktrees and skips unsafe linked worktrees", (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-cli-rm-old-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const remote = join(root, "remote.git")
  const repo = join(root, "repo")
  const deleteMe = join(root, "delete-me")
  const keepMe = join(root, "keep-me")

  git(root, ["init", "--quiet", "--bare", remote])
  git(root, ["clone", "--quiet", remote, repo])
  git(repo, ["switch", "--quiet", "-c", "main"])
  git(repo, ["config", "user.email", "sentinel-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate })
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"])

  git(repo, ["branch", "feature/delete-me"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/delete-me"])
  git(repo, ["worktree", "add", "--quiet", deleteMe, "feature/delete-me"])

  git(repo, ["branch", "feature/keep-me"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/keep-me"])
  git(repo, ["worktree", "add", "--quiet", keepMe, "feature/keep-me"])
  writeFileSync(join(keepMe, "README.md"), "# changed repo\n")

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm-old", root, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const parsed = JSON.parse(output)

  assert.equal(parsed.root, root)
  assert.equal(parsed.minimumAgeDays, 30)
  assert.deepEqual(
    parsed.deleted.map((result: { path: string }) => result.path),
    [deleteMe]
  )
  assert.deepEqual(
    parsed.skipped.map((result: { path: string }) => result.path),
    [keepMe]
  )
  assert.deepEqual(parsed.failed, [])
  assert.equal(existsSync(deleteMe), false)
  assert.equal(existsSync(keepMe), true)
  assert.equal(existsSync(repo), true)
})
