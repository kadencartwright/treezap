#!/usr/bin/env node

import { Args, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect } from "effect"

import { removeOldWorktrees } from "./bulkRemove"
import { collectCandidates } from "./candidates"
import { evaluateDeletion } from "./deletable"
import {
  isDurationParseError,
  parseMinAgeDays,
  type DurationParseError
} from "./duration"
import { evaluateRemove } from "./remove"
import { collectScanRoot } from "./scan"
import { inspectPath } from "./status"

const agentHelp = Options.boolean("agent-help").pipe(
  Options.withDescription("Print the concise command flow intended for agent harnesses.")
)

const minAge = Options.text("min-age").pipe(
  Options.withDefault("30d"),
  Options.withDescription("Minimum age threshold for deletion eligibility. Supports days only, e.g. 30d.")
)

const rootArg = Args.text({ name: "root" }).pipe(
  Args.withDescription("Root directory that contains primary project checkouts.")
)

const pathArg = Args.text({ name: "path" }).pipe(
  Args.withDescription("Repository or worktree path.")
)

const parseMinimumAgeDays = (input: string): Effect.Effect<number, DurationParseError> => {
  const minimumAgeDays = parseMinAgeDays(input)

  if (isDurationParseError(minimumAgeDays)) {
    return Effect.fail(minimumAgeDays)
  }

  return Effect.succeed(minimumAgeDays)
}

const scan = Command.make(
  "scan",
  { root: rootArg },
  ({ root }) =>
    Effect.gen(function* () {
      const result = yield* collectScanRoot(root)
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Discover Git repositories under a root and list their worktrees.")
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
  Command.withDescription("Report deletion safety facts for one repository or worktree.")
)

const candidates = Command.make(
  "candidates",
  {
    root: rootArg,
    minAge
  },
  ({ minAge, root }) =>
    Effect.gen(function* () {
      const minimumAgeDays = yield* parseMinimumAgeDays(minAge)
      const result = yield* collectCandidates(root, { minimumAgeDays })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Report safe worktrees older than the minimum age without deleting them.")
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
      const result = yield* evaluateRemove(path, { minimumAgeDays })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Delete one stale repository or worktree after safety checks.")
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
      const result = yield* removeOldWorktrees(root, { minimumAgeDays })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Bulk delete stale repositories or worktrees discovered under a root.")
)

const agentHelpBanner = [
  "worktree-sentinel exposes raw primitives only.",
  "",
  "Suggested flow:",
  "  sentinel scan <root>",
  "  sentinel stat <path>",
  "  sentinel candidates <root> [--min-age 30d]",
  "  sentinel rm <path> [--min-age 30d]",
  "  sentinel rm-old <root> [--min-age 30d]",
  "",
  "Deletion commands will own all safety checks when implemented.",
  "For now, commands only parse inputs and return not_implemented JSON."
].join("\n")

const command = Command.make("sentinel", { agentHelp }, ({ agentHelp }) =>
  agentHelp
    ? Console.log(agentHelpBanner)
    : Console.log("Run `sentinel --help` for commands or `sentinel --agent-help` for the raw command flow.")
).pipe(
  Command.withDescription("Raw CLI primitives for discovering and deleting stale Git worktrees."),
  Command.withSubcommands([scan, stat, candidates, rm, rmOld])
)

const cli = Command.run(command, {
  name: "worktree-sentinel",
  version: "0.1.0"
})

NodeRuntime.runMain(cli(process.argv).pipe(Effect.provide(NodeContext.layer)))
