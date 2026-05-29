import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { Effect } from "effect"

import { discoverRepos } from "../src/repos"

const git = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8"
  })

test("discovers git repositories under a root", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "worktree-sentinel-repos-"))
  t.after(() => rmSync(root, { recursive: true, force: true }))

  const alpha = join(root, "alpha")
  const beta = join(root, "nested", "beta")

  mkdirSync(alpha, { recursive: true })
  mkdirSync(beta, { recursive: true })
  mkdirSync(join(root, "not-a-repo"), { recursive: true })
  mkdirSync(join(root, "node_modules", "ignored-repo"), { recursive: true })

  git(alpha, ["init", "--quiet", "--initial-branch", "main"])
  git(beta, ["init", "--quiet", "--initial-branch", "main"])
  git(join(root, "node_modules", "ignored-repo"), ["init", "--quiet", "--initial-branch", "main"])

  const repos = await Effect.runPromise(discoverRepos(root))

  assert.deepEqual(repos, [alpha, beta])
})
