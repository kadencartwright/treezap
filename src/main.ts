#!/usr/bin/env node

import { Args, Command, Options } from "@effect/cli"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Console, Effect } from "effect"

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

const scan = Command.make(
  "scan",
  { root: rootArg },
  ({ root }) =>
    Console.log(
      JSON.stringify(
        {
          command: "scan",
          root,
          status: "not_implemented"
        },
        null,
        2
      )
    )
).pipe(
  Command.withDescription("Discover Git repositories under a root and list their worktrees.")
)

const stat = Command.make(
  "stat",
  { path: pathArg },
  ({ path }) =>
    Console.log(
      JSON.stringify(
        {
          command: "stat",
          path,
          status: "not_implemented"
        },
        null,
        2
      )
    )
).pipe(
  Command.withDescription("Report deletion safety facts for one repository or worktree.")
)

const rm = Command.make(
  "rm",
  {
    path: pathArg,
    minAge
  },
  ({ minAge, path }) =>
    Console.log(
      JSON.stringify(
        {
          command: "rm",
          path,
          minAge,
          status: "not_implemented"
        },
        null,
        2
      )
    )
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
    Console.log(
      JSON.stringify(
        {
          command: "rm-old",
          root,
          minAge,
          status: "not_implemented"
        },
        null,
        2
      )
    )
).pipe(
  Command.withDescription("Bulk delete stale repositories or worktrees discovered under a root.")
)

const agentHelpBanner = [
  "worktree-sentinel exposes raw primitives only.",
  "",
  "Suggested flow:",
  "  sentinel scan <root>",
  "  sentinel stat <path>",
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
  Command.withSubcommands([scan, stat, rm, rmOld])
)

const cli = Command.run(command, {
  name: "worktree-sentinel",
  version: "0.1.0"
})

NodeRuntime.runMain(cli(process.argv).pipe(Effect.provide(NodeContext.layer)))
