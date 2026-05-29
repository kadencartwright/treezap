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

test("rm command reports deletion eligibility without deleting", (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-cli-rm-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const remote = join(root, "remote.git")
  const repo = join(root, "repo")

  git(root, ["init", "--quiet", "--bare", remote])
  git(root, ["clone", "--quiet", remote, repo])
  git(repo, ["switch", "--quiet", "-c", "main"])
  git(repo, ["config", "user.email", "sentinel-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate })
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"])

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm", repo, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const parsed = JSON.parse(output)

  assert.equal(parsed.path, repo)
  assert.equal(parsed.minimumAgeDays, 30)
  assert.equal(parsed.deleted, false)
  assert.equal(parsed.eligible, true)
  assert.equal(parsed.ageDays >= 44, true)
  assert.deepEqual(parsed.decision, {
    deletable: true,
    reasons: []
  })
  assert.equal(parsed.status.path, repo)
  assert.equal(existsSync(repo), true)
})
