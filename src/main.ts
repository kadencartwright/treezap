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
import { removePath } from "./remove"
import { collectScanRoot } from "./scan"
import { inspectPath } from "./status"

const minAge = Options.text("min-age").pipe(
  Options.withPseudoName("duration"),
  Options.withDefault("30d"),
  Options.withDescription("Minimum age. Examples: 30d, 2w, 1m, 1y.")
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

const scan = Command.make(
  "scan",
  { root: rootArg },
  ({ root }) =>
    Effect.gen(function* () {
      const result = yield* collectScanRoot(root)
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
    minAge
  },
  ({ minAge, root }) =>
    Effect.gen(function* () {
      const minimumAgeDays = yield* parseMinimumAgeDays(minAge)
      const result = yield* collectCandidates(root, { minimumAgeDays })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("List deletable worktrees.")
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
      const result = yield* removeOldWorktrees(root, { minimumAgeDays })
      yield* Console.log(JSON.stringify(result, null, 2))
    })
).pipe(
  Command.withDescription("Delete eligible linked worktrees.")
)

const command = Command.make("treezap", {}, () => Console.log("Run `treezap --help`.")).pipe(
  Command.withDescription("Git worktree cleanup primitives."),
  Command.withSubcommands([scan, stat, candidates, rm, rmOld])
)

const cli = Command.run(command, {
  name: "treezap",
  version: "0.1.0"
})

NodeRuntime.runMain(cli(process.argv).pipe(Effect.provide(NodeContext.layer)))
