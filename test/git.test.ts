import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Effect } from "effect";

import {
  classifyRemoveWorktreeError,
  GitCommandError,
  parseCommitDates,
  parseDivergence,
  parseStatusV2BranchInspection,
  parseWorkingTreeChanges,
  resetGitCommandTimings,
  runGit,
  summarizeGitCommandTimings,
} from "../src/git";

test("runGit returns stdout and command metadata for successful git commands", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "treezap-git-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const result = await Effect.runPromise(runGit(cwd, ["--version"]));

  assert.equal(result.cwd, cwd);
  assert.deepEqual(result.args, ["--version"]);
  assert.match(result.stdout, /^git version /);
  assert.equal(result.stderr, "");
  assert.equal(result.exitCode, 0);
});

test("runGit returns typed command errors with stderr and exit code", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "treezap-git-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  const error = await Effect.runPromise(
    Effect.flip(runGit(cwd, ["rev-parse", "--show-toplevel"])),
  );

  assert.equal(error._tag, "GitCommandError");
  assert.equal(error.cwd, cwd);
  assert.deepEqual(error.args, ["rev-parse", "--show-toplevel"]);
  assert.equal(error.stdout, "");
  assert.match(error.stderr, /not a git repository/);
  assert.equal(error.exitCode, 128);
});

test("records git command timings", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "treezap-git-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  resetGitCommandTimings();
  await Effect.runPromise(runGit(cwd, ["--version"]));
  const summary = summarizeGitCommandTimings();

  assert.equal(summary.totalCommands, 1);
  assert.equal(summary.byCommand[0]?.command, "--version");
  assert.equal(summary.byCommand[0]?.count, 1);
  assert.equal(summary.totalDurationMs >= 0, true);
});

test("caps concurrent git subprocesses", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "treezap-git-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));

  resetGitCommandTimings();
  await Effect.runPromise(
    Effect.forEach(
      Array.from({ length: 24 }),
      () => runGit(cwd, ["-c", "alias.pause=!sleep 0.05", "pause"]),
      { concurrency: 24, discard: true },
    ),
  );
  const summary = summarizeGitCommandTimings();

  assert.equal(summary.totalCommands, 24);
  assert.equal(summary.maxGitSubprocesses, 32);
  assert.equal(summary.maxConcurrentCommands > 1, true);
  assert.equal(
    summary.maxConcurrentCommands <= summary.maxGitSubprocesses,
    true,
  );
});

test("parses working tree porcelain into dirty and untracked facts", () => {
  assert.deepEqual(parseWorkingTreeChanges(""), {
    dirty: false,
    untracked: false,
    porcelain: "",
  });

  assert.deepEqual(parseWorkingTreeChanges(" M README.md\n?? scratch.txt\n"), {
    dirty: true,
    untracked: true,
    porcelain: " M README.md\n?? scratch.txt\n",
  });

  assert.deepEqual(parseWorkingTreeChanges("?? scratch.txt\n"), {
    dirty: false,
    untracked: true,
    porcelain: "?? scratch.txt\n",
  });
});

test("parses upstream divergence counts", () => {
  assert.deepEqual(parseDivergence("3\t2\n"), {
    ahead: 3,
    behind: 2,
  });
});

test("parses batched commit dates", () => {
  assert.deepEqual(
    Array.from(
      parseCommitDates(
        [
          [
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            "2026-01-01T12:00:00Z",
            "",
          ].join("\0"),
          [
            "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
            "2026-01-02T12:00:00Z",
            "",
          ].join("\0"),
          "",
        ].join("\n"),
      ),
    ),
    [
      ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "2026-01-01T12:00:00Z"],
      ["bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "2026-01-02T12:00:00Z"],
    ],
  );
});

test("parses status v2 branch porcelain into head, upstream, and changes", () => {
  const parsed = parseStatusV2BranchInspection(
    [
      "# branch.oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "# branch.head feature/test",
      "# branch.upstream origin/feature/test",
      "# branch.ab +2 -1",
      "1 .M N... 100644 100644 100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb README.md",
      "? scratch.txt",
      "",
    ].join("\0"),
  );

  assert.deepEqual(parsed, {
    head: {
      kind: "branch",
      branch: "feature/test",
      commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    },
    changes: {
      dirty: true,
      untracked: true,
      porcelain: [
        "# branch.oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "# branch.head feature/test",
        "# branch.upstream origin/feature/test",
        "# branch.ab +2 -1",
        "1 .M N... 100644 100644 100644 bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb README.md",
        "? scratch.txt",
        "",
      ].join("\0"),
    },
    upstream: {
      upstream: "origin/feature/test",
      ahead: 2,
      behind: 1,
    },
  });
});

test("parses status v2 detached head with no upstream as clean", () => {
  assert.deepEqual(
    parseStatusV2BranchInspection(
      [
        "# branch.oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "# branch.head (detached)",
        "",
      ].join("\0"),
    ),
    {
      head: {
        kind: "detached",
        commit: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
      changes: {
        dirty: false,
        untracked: false,
        porcelain: [
          "# branch.oid aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "# branch.head (detached)",
          "",
        ].join("\0"),
      },
      upstream: {
        upstream: undefined,
        ahead: 0,
        behind: 0,
      },
    },
  );
});

test("classifies expected worktree removal failures", () => {
  const commandError = (stderr: string): GitCommandError =>
    new GitCommandError({
      cwd: "/repo",
      args: ["worktree", "remove", "/worktree"],
      stdout: "",
      stderr,
      exitCode: 128,
      cause: {},
    });

  assert.equal(
    classifyRemoveWorktreeError(
      "/worktree",
      commandError(
        "fatal: working trees containing submodules cannot be moved or removed\n",
      ),
    )?.reason,
    "contains_submodules",
  );
  assert.equal(
    classifyRemoveWorktreeError(
      "/worktree",
      commandError("fatal: cannot remove a locked working tree;\n"),
    )?.reason,
    "locked_worktree",
  );
  assert.equal(
    classifyRemoveWorktreeError(
      "/worktree",
      commandError(
        "fatal: '/worktree' contains modified or untracked files, use --force\n",
      ),
    )?.reason,
    "dirty_worktree",
  );
  assert.equal(
    classifyRemoveWorktreeError("/worktree", commandError("fatal: unknown\n")),
    undefined,
  );
});
