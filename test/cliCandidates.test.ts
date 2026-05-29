import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
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

const seedCandidateFixture = (t: test.TestContext): {
  readonly root: string
  readonly oldWorktree: string
} => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-candidates-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000)
  const remote = join(root, "remote.git")
  const repo = join(root, "repo")
  const oldWorktree = join(root, "old-worktree")
  const dirtyWorktree = join(root, "dirty-worktree")
  const missingWorktree = join(root, "missing-worktree")

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

  git(repo, ["branch", "feature/dirty"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/dirty"])
  git(repo, ["worktree", "add", "--quiet", dirtyWorktree, "feature/dirty"])
  writeFileSync(join(dirtyWorktree, "README.md"), "# dirty repo\n")

  git(repo, ["branch", "feature/missing"])
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/missing"])
  git(repo, ["worktree", "add", "--quiet", missingWorktree, "feature/missing"])
  rmSync(missingWorktree, { recursive: true, force: true })

  return {
    root,
    oldWorktree
  }
}

test("candidates command prints safe worktrees older than the minimum age", (t) => {
  const { oldWorktree, root } = seedCandidateFixture(t)

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

test("candidates command can print only the count summary", (t) => {
  const { root } = seedCandidateFixture(t)

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "candidates", root, "--min-age", "30d", "--count"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )

  assert.equal(
    output,
    [
      "deletable: 1",
      "old_enough_blocked: 1",
      "blocked_dirty: 1",
      "blocked_untracked: 0",
      "blocked_missing_upstream: 0",
      "blocked_unpushed: 0",
      ""
    ].join("\n")
  )
})

test("candidates command prints repo and worktree progress to stderr", (t) => {
  const { root } = seedCandidateFixture(t)

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "candidates", root, "--min-age", "30d", "--count"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TREEZAP_PROGRESS: "1"
      },
      encoding: "utf8"
    }
  )

  assert.equal(result.status, 0)
  assert.match(result.stdout, /deletable: 1/)
  assert.match(result.stderr, /treezap: checking repos \[/)
  assert.match(result.stderr, /treezap: inspecting worktrees \[/)
  assert.match(result.stderr, /2\/2 worktrees/)
})
