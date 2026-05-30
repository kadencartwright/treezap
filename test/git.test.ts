import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { Effect } from "effect"

import {
  GitCommandError,
  classifyRemoveWorktreeError,
  parseDivergence,
  parseWorkingTreeChanges,
  runGit
} from "../src/git"

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

test("parses working tree porcelain into dirty and untracked facts", () => {
  assert.deepEqual(parseWorkingTreeChanges(""), {
    dirty: false,
    untracked: false,
    porcelain: ""
  })

  assert.deepEqual(parseWorkingTreeChanges(" M README.md\n?? scratch.txt\n"), {
    dirty: true,
    untracked: true,
    porcelain: " M README.md\n?? scratch.txt\n"
  })

  assert.deepEqual(parseWorkingTreeChanges("?? scratch.txt\n"), {
    dirty: false,
    untracked: true,
    porcelain: "?? scratch.txt\n"
  })
})

test("parses upstream divergence counts", () => {
  assert.deepEqual(parseDivergence("3\t2\n"), {
    ahead: 3,
    behind: 2
  })
})

test("classifies expected worktree removal failures", () => {
  const commandError = (stderr: string): GitCommandError =>
    new GitCommandError({
      cwd: "/repo",
      args: ["worktree", "remove", "/worktree"],
      stdout: "",
      stderr,
      exitCode: 128,
      cause: {}
    })

  assert.equal(
    classifyRemoveWorktreeError(
      "/worktree",
      commandError("fatal: working trees containing submodules cannot be moved or removed\n")
    )?.reason,
    "contains_submodules"
  )
  assert.equal(
    classifyRemoveWorktreeError(
      "/worktree",
      commandError("fatal: cannot remove a locked working tree;\n")
    )?.reason,
    "locked_worktree"
  )
  assert.equal(
    classifyRemoveWorktreeError(
      "/worktree",
      commandError("fatal: '/worktree' contains modified or untracked files, use --force\n")
    )?.reason,
    "dirty_worktree"
  )
  assert.equal(classifyRemoveWorktreeError("/worktree", commandError("fatal: unknown\n")), undefined)
})
