import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
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

test("candidates command prints safe worktrees older than the minimum age", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-candidates-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const youngDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
  const remote = join(root, "remote.git")
  const repo = join(root, "repo")
  const oldWorktree = join(root, "old-worktree")

  git(root, ["init", "--quiet", "--bare", remote])
  git(root, ["clone", "--quiet", remote, repo])
  git(repo, ["switch", "--quiet", "-c", "main"])
  git(repo, ["config", "user.email", "treezap-test@example.test"])
  git(repo, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(repo, "README.md"), "# test repo\n")
  git(repo, ["add", "README.md"])
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate })
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"])

  git(repo, ["branch", "feature/old"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/old"])
  git(repo, ["worktree", "add", "--quiet", oldWorktree, "feature/old"])

  writeFileSync(join(repo, "young.txt"), "young\n")
  git(repo, ["add", "young.txt"])
  git(repo, ["commit", "--quiet", "-m", "young commit"], { date: youngDate })
  git(repo, ["push", "--quiet"])

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "candidates", root, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const parsed = JSON.parse(output)

  assert.equal(parsed.root, root)
  assert.equal(parsed.minimumAgeDays, 30)
  assert.deepEqual(
    parsed.candidates.map((candidate: { path: string }) => candidate.path),
    [oldWorktree]
  )
  assert.equal(parsed.candidates[0].decision.deletable, true)
})
