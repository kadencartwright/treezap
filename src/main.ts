#!/usr/bin/env node

import { Args, CliConfig, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect } from "effect"

import { removeOldWorktrees } from "./bulkRemove"
import { collectCandidates, type CandidateCounts } from "./candidates"
import { evaluateDeletion } from "./deletable"
import {
  isDurationParseError,
  parseMinAgeDays,
  type DurationParseError
} from "./duration"
import { removePath } from "./remove"
import { collectScanRoot } from "./scan"
import { inspectPath } from "./status"

const minAge = Options.text("min-age").pipe(
  Options.withPseudoName("duration"),
  Options.withDefault("30d"),
  Options.withDescription("Minimum age. Examples: 30d, 2w, 1m, 1y.")
)

const countOnly = Options.boolean("count").pipe(
  Options.withDescription("Print only the count summary.")
)

const rootArg = Args.text({ name: "root" }).pipe(
  Args.withDescription("Project root.")
)

const pathArg = Args.text({ name: "path" }).pipe(
  Args.withDescription("Repo or worktree path.")
)

const parseMinimumAgeDays = (input: string): Effect.Effect<number, DurationParseError> => {
  const minimumAgeDays = parseMinAgeDays(input)

  if (isDurationParseError(minimumAgeDays)) {
    return Effect.fail(minimumAgeDays)
  }

  return Effect.succeed(minimumAgeDays)
}

const formatCandidateCounts = (counts: CandidateCounts): string =>
  [
    `deletable: ${counts.deletable}`,
    `old_enough_blocked: ${counts.oldEnoughBlocked.total}`,
    `blocked_dirty: ${counts.oldEnoughBlocked.reasons.dirty}`,
    `blocked_untracked: ${counts.oldEnoughBlocked.reasons.untracked}`,
    `blocked_missing_default_branch: ${counts.oldEnoughBlocked.reasons.missing_default_branch}`,
    `blocked_unique_patches: ${counts.oldEnoughBlocked.reasons.unique_patches}`
  ].join("\n")

const scan = Command.make(
  "scan",
  { root: rootArg },
  ({ root }) =>
    Effect.gen(function* () {
      const result = yield* collectScanRoot(root, { progress: true })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("List repos and worktrees.")
)

const stat = Command.make(
  "stat",
  { path: pathArg },
  ({ path }) =>
    Effect.gen(function* () {
      const status = yield* inspectPath(path)
      const decision = evaluateDeletion(status)
      yield* Console.log(JSON.stringify({ ...status, ...decision }, null, 2))
    })
).pipe(
  Command.withDescription("Inspect one path.")
)

const candidates = Command.make(
  "candidates",
  {
    root: rootArg,
    minAge,
    countOnly
  },
  ({ countOnly, minAge, root }) =>
    Effect.gen(function* () {
      const minimumAgeDays = yield* parseMinimumAgeDays(minAge)
      const result = yield* collectCandidates(root, { minimumAgeDays, progress: true })

      if (countOnly) {
        yield* Console.log(formatCandidateCounts(result.counts))
        return
      }

      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("List aged worktrees with deletion safety facts.")
)

const rm = Command.make(
  "rm",
  {
    path: pathArg,
    minAge
  },
  ({ minAge, path }) =>
    Effect.gen(function* () {
      const minimumAgeDays = yield* parseMinimumAgeDays(minAge)
      const result = yield* removePath(path, { minimumAgeDays })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Delete one eligible worktree.")
)

const rmOld = Command.make(
  "rm-old",
  {
    root: rootArg,
    minAge
  },
  ({ minAge, root }) =>
    Effect.gen(function* () {
      const minimumAgeDays = yield* parseMinimumAgeDays(minAge)
      const result = yield* removeOldWorktrees(root, { minimumAgeDays, progress: true })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Delete eligible linked worktrees.")
)

const commandHelp = {
  scan: [
    "treezap scan",
    "List repos and worktrees.",
    "",
    "Usage:",
    "  treezap scan <root>",
    "",
    "Options:",
    "  -h, --help  Show help."
  ].join("\n"),
  stat: [
    "treezap stat",
    "Inspect one path.",
    "",
    "Usage:",
    "  treezap stat <path>",
    "",
    "Options:",
    "  -h, --help  Show help."
  ].join("\n"),
  candidates: [
    "treezap candidates",
    "List aged worktrees with deletion safety facts.",
    "",
    "Usage:",
    "  treezap candidates <root> [--min-age duration] [--count]",
    "",
    "Options:",
    "  --min-age duration  Minimum age. Examples: 30d, 2w, 1m, 1y. Default: 30d.",
    "  --count             Print only the count summary.",
    "  -h, --help          Show help."
  ].join("\n"),
  rm: [
    "treezap rm",
    "Delete one eligible worktree.",
    "",
    "Usage:",
    "  treezap rm <path> [--min-age duration]",
    "",
    "Options:",
    "  --min-age duration  Minimum age. Examples: 30d, 2w, 1m, 1y. Default: 30d.",
    "  -h, --help          Show help."
  ].join("\n"),
  "rm-old": [
    "treezap rm-old",
    "Delete eligible linked worktrees.",
    "",
    "Usage:",
    "  treezap rm-old <root> [--min-age duration]",
    "",
    "Options:",
    "  --min-age duration  Minimum age. Examples: 30d, 2w, 1m, 1y. Default: 30d.",
    "  -h, --help          Show help."
  ].join("\n")
} as const

const rootHelp = [
  "treezap 0.1.1",
  "Git worktree cleanup primitives.",
  "",
  "Usage:",
  "  treezap <command> [options]",
  "",
  "Commands:",
  "  scan <root>                             List repos and worktrees.",
  "  stat <path>                             Inspect one path.",
  "  candidates <root> [--min-age duration] [--count]  List aged worktrees with deletion safety facts.",
  "  rm <path> [--min-age duration]          Delete one eligible worktree.",
  "  rm-old <root> [--min-age duration]      Delete eligible linked worktrees.",
  "",
  "Options:",
  "  -h, --help  Show help.",
  "",
  "Examples:",
  "  treezap candidates ~/code --min-age 30d",
  "  treezap rm-old ~/code --min-age 30d"
].join("\n")

const printHelpIfRequested = (args: ReadonlyArray<string>): boolean => {
  if (args.length === 0) {
    console.log(rootHelp)
    return true
  }

  if (!args.includes("--help") && !args.includes("-h")) {
    return false
  }

  const command = args.find((arg): arg is keyof typeof commandHelp => arg in commandHelp)
  console.log(command === undefined ? rootHelp : commandHelp[command])
  return true
}

const command = Command.make("treezap", {}, () => Console.log(rootHelp)).pipe(
  Command.withDescription("Git worktree cleanup primitives."),
  Command.withSubcommands([scan, stat, candidates, rm, rmOld])
)

const cli = Command.run(command, {
  name: "treezap",
  version: "0.1.1"
})

if (!printHelpIfRequested(process.argv.slice(2))) {
  NodeRuntime.runMain(
    cli(process.argv).pipe(
      Effect.provide(CliConfig.layer({ showBuiltIns: false })),
      Effect.provide(NodeContext.layer)
    )
  )
}
