import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { Effect } from "effect"

import { scanRoot } from "../src/scan"

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

const createRepo = (path: string) => {
  mkdirSync(path, { recursive: true })
  git(path, ["init", "--quiet", "--initial-branch", "main"])
  git(path, ["config", "user.email", "sentinel-test@example.test"])
  git(path, ["config", "user.name", "Sentinel Test"])

  writeFileSync(join(path, "README.md"), "# test repo\n")
  git(path, ["add", "README.md"])
  git(path, ["commit", "--quiet", "-m", "initial commit"])
}

test("scans repositories under a root and includes their worktrees", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-scan-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const alpha = join(root, "alpha")
  const beta = join(root, "nested", "beta")
  const alphaLinkedWorktree = join(root, "alpha-linked")

  createRepo(alpha)
  createRepo(beta)
  git(alpha, ["worktree", "add", "--quiet", "-b", "feature/linked", alphaLinkedWorktree, "HEAD"])

  const result = await Effect.runPromise(scanRoot(root))

  assert.equal(result.root, root)
  assert.deepEqual(
    result.repositories.map((repository) => repository.path),
    [alpha, beta]
  )

  const alphaResult = result.repositories.find((repository) => repository.path === alpha)
  assert.ok(alphaResult)
  assert.deepEqual(
    alphaResult.worktrees.map((worktree) => [worktree.path, worktree.status]),
    [
      [alpha, { kind: "branch", branch: "main" }],
      [alphaLinkedWorktree, { kind: "branch", branch: "feature/linked" }]
    ]
  )

  const betaResult = result.repositories.find((repository) => repository.path === beta)
  assert.ok(betaResult)
  assert.deepEqual(betaResult.worktrees.map((worktree) => worktree.path), [beta])
})
