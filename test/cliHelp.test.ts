import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import test from "node:test"

const stripAnsi = (text: string): string => text.replace(/\u001b\[[0-9;]*m/g, "")

test("running without a subcommand shows help", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "src/main.ts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
  const help = stripAnsi(output)

  assert.match(help, /treezap 0\.1\.4/)
  assert.match(help, /Usage:\n  treezap <command> \[options\]/)
  assert.match(help, /candidates <root> \[--min-age duration\] \[--count\]/)
  assert.doesNotMatch(help, /Run `treezap --help`\./)
})

test("help shows the raw command surface", () => {
  const output = execFileSync(process.execPath, ["--import", "tsx", "src/main.ts", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8"
  })
  const help = stripAnsi(output)

  assert.match(help, /scan <root>\s+List repos and worktrees\./)
  assert.match(help, /stat <path>\s+Inspect one path\./)
  assert.match(help, /candidates <root> \[--min-age duration\] \[--count\]\s+List aged worktrees with deletion safety facts\./)
  assert.match(help, /rm <path> \[--min-age duration\]\s+Delete one eligible worktree\./)
  assert.match(help, /rm-old <root> \[--min-age duration\]\s+Delete eligible linked worktrees\./)
  assert.doesNotMatch(help, /\n\n\n/)
  assert.doesNotMatch(help, /--wizard/)
  assert.doesNotMatch(help, /--completions/)
  assert.doesNotMatch(help, /--log-level/)
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
  assert.doesNotMatch(help, /\n\n\n/)
})

test("candidates help documents count output", () => {
  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "candidates", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  )
  const help = stripAnsi(output)

  assert.match(help, /\[--count\]/)
  assert.match(help, /--count\s+Print only the count summary\./)
})
