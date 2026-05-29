import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "")

test("help shows the raw command surface", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "src/main.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
  const help = stripAnsi(output)

  assert.match(help, /scan <root>\s+List repos and worktrees\./)
  assert.match(help, /stat <path>\s+Inspect one path\./)
  assert.match(help, /candidates \[--min-age duration\] <root>\s+List deletable worktrees\./)
  assert.match(help, /rm \[--min-age duration\] <path>\s+Delete one eligible worktree\./)
  assert.match(help, /rm-old \[--min-age duration\] <root>\s+Delete eligible linked worktrees\./)
  assert.doesNotMatch(help, /agent-help/)
  assert.doesNotMatch(help, /not_implemented/)
})

test("command help documents min-age duration examples", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm-old", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const help = stripAnsi(output)

  assert.match(help, /\[--min-age duration\]/)
  assert.match(help, /Minimum age\. Examples: 30d, 2w, 1m, 1y\./)
})
