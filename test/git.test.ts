import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { Effect } from "effect"

import { runGit } from "../src/git"

test("runGit returns stdout and command metadata for successful git commands", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "treezap-git-"))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))

  const result = await Effect.runPromise(runGit(cwd, ["--version"]))

  assert.equal(result.cwd, cwd)
  assert.deepEqual(result.args, ["--version"])
  assert.match(result.stdout, /^git version /)
  assert.equal(result.stderr, "")
  assert.equal(result.exitCode, 0)
})

test("runGit returns typed command errors with stderr and exit code", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "treezap-git-"))
  t.after(() => rmSync(cwd, { recursive: true, force: true }))

  const error = await Effect.runPromise(
    Effect.flip(runGit(cwd, ["rev-parse", "--show-toplevel"]))
  )

  assert.equal(error._tag, "GitCommandError")
  assert.equal(error.cwd, cwd)
  assert.deepEqual(error.args, ["rev-parse", "--show-toplevel"])
  assert.equal(error.stdout, "")
  assert.match(error.stderr, /not a git repository/)
  assert.equal(error.exitCode, 128)
})
