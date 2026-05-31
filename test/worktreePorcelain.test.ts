import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { parseWorktreePorcelain } from "../src/worktreePorcelain";

const git = (cwd: string, args: ReadonlyArray<string>): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-01-01T12:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T12:00:00Z",
    },
  });

test("parses real git porcelain for a repo with one linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-porcelain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const repo = join(root, "repo");
  const linkedWorktree = join(root, "linked-worktree");

  mkdirSync(repo);
  git(repo, ["init", "--quiet", "--initial-branch", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"]);
  git(repo, [
    "worktree",
    "add",
    "--quiet",
    "-b",
    "feature/linked",
    linkedWorktree,
    "HEAD",
  ]);

  const parsed = parseWorktreePorcelain(
    git(repo, ["worktree", "list", "--porcelain"]),
  );
  const byPath = new Map(parsed.map((entry) => [entry.path, entry]));

  assert.equal(parsed.length, 2);

  const main = byPath.get(repo);
  assert.ok(main);
  assert.match(main.head ?? "", /^[0-9a-f]{40}$/);
  assert.deepEqual(main.status, { kind: "branch", branch: "main" });

  const linked = byPath.get(linkedWorktree);
  assert.ok(linked);
  assert.match(linked.head ?? "", /^[0-9a-f]{40}$/);
  assert.deepEqual(linked.status, { kind: "branch", branch: "feature/linked" });
});

test("parses real git porcelain for a detached linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-porcelain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const repo = join(root, "repo");
  const detachedWorktree = join(root, "detached-worktree");

  mkdirSync(repo);
  git(repo, ["init", "--quiet", "--initial-branch", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"]);
  git(repo, [
    "worktree",
    "add",
    "--quiet",
    "--detach",
    detachedWorktree,
    "HEAD",
  ]);

  const parsed = parseWorktreePorcelain(
    git(repo, ["worktree", "list", "--porcelain"]),
  );
  const detached = new Map(parsed.map((entry) => [entry.path, entry])).get(
    detachedWorktree,
  );

  assert.ok(detached);
  assert.match(detached.head ?? "", /^[0-9a-f]{40}$/);
  assert.deepEqual(detached.status, { kind: "detached" });
});

test("parses real git porcelain for a locked linked worktree with a spaced path", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-porcelain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const repo = join(root, "repo");
  const lockedWorktree = join(root, "locked worktree");

  mkdirSync(repo);
  git(repo, ["init", "--quiet", "--initial-branch", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"]);
  git(repo, [
    "worktree",
    "add",
    "--quiet",
    "-b",
    "feature/locked",
    lockedWorktree,
    "HEAD",
  ]);
  git(repo, [
    "worktree",
    "lock",
    "--reason",
    "active agent run",
    lockedWorktree,
  ]);

  const parsed = parseWorktreePorcelain(
    git(repo, ["worktree", "list", "--porcelain"]),
  );
  const locked = new Map(parsed.map((entry) => [entry.path, entry])).get(
    lockedWorktree,
  );

  assert.ok(locked);
  assert.deepEqual(locked.status, { kind: "branch", branch: "feature/locked" });
  assert.deepEqual(locked.annotations, [
    { kind: "locked", reason: "active agent run" },
  ]);
});

test("parses real git porcelain for a prunable missing linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-porcelain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const repo = join(root, "repo");
  const missingWorktree = join(root, "missing-worktree");

  mkdirSync(repo);
  git(repo, ["init", "--quiet", "--initial-branch", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"]);
  git(repo, [
    "worktree",
    "add",
    "--quiet",
    "-b",
    "feature/missing",
    missingWorktree,
    "HEAD",
  ]);
  rmSync(missingWorktree, { recursive: true, force: true });

  const parsed = parseWorktreePorcelain(
    git(repo, ["worktree", "list", "--porcelain"]),
  );
  const missing = new Map(parsed.map((entry) => [entry.path, entry])).get(
    missingWorktree,
  );

  assert.ok(missing);
  assert.deepEqual(missing.status, {
    kind: "branch",
    branch: "feature/missing",
  });
  assert.deepEqual(missing.annotations, [
    { kind: "prunable", reason: "gitdir file points to non-existent location" },
  ]);
});

test("parses real git porcelain for a bare repository", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-porcelain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const repo = join(root, "bare.git");

  git(root, ["init", "--quiet", "--bare", repo]);

  const parsed = parseWorktreePorcelain(
    git(repo, ["worktree", "list", "--porcelain"]),
  );

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.path, repo);
  assert.deepEqual(parsed[0]?.status, { kind: "bare" });
  assert.deepEqual(parsed[0]?.annotations, []);
});

test("parses real git porcelain without a trailing blank line", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-porcelain-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const repo = join(root, "repo");

  mkdirSync(repo);
  git(repo, ["init", "--quiet", "--initial-branch", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"]);

  const porcelain = git(repo, ["worktree", "list", "--porcelain"]).trimEnd();
  const parsed = parseWorktreePorcelain(porcelain);

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.path, repo);
  assert.deepEqual(parsed[0]?.status, { kind: "branch", branch: "main" });
});

test("parses NUL-terminated porcelain records", () => {
  const parsed = parseWorktreePorcelain(
    [
      "worktree /repo",
      "HEAD aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "branch refs/heads/main",
      "",
      "worktree /repo/linked",
      "HEAD bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "detached",
      "locked active run",
      "",
    ].join("\0"),
  );

  assert.deepEqual(parsed, [
    {
      path: "/repo",
      head: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      status: {
        kind: "branch",
        branch: "main",
      },
      annotations: [],
    },
    {
      path: "/repo/linked",
      head: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      status: {
        kind: "detached",
      },
      annotations: [
        {
          kind: "locked",
          reason: "active run",
        },
      ],
    },
  ]);
});
