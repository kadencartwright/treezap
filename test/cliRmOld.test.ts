import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const git = (
  cwd: string,
  args: ReadonlyArray<string>,
  options: { readonly date?: Date } = {},
): string =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: options.date?.toISOString(),
      GIT_COMMITTER_DATE: options.date?.toISOString(),
    },
  });

const setDefaultRemoteBranch = (
  root: string,
  remote: string,
  repo: string,
): void => {
  git(root, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  git(repo, ["remote", "set-head", "origin", "-a"]);
};

const seedRmOldFixture = (
  t: test.TestContext,
  options: { readonly skippedWorktrees?: number } = {},
): {
  readonly deleteMe: string;
  readonly keepMe: string;
  readonly repo: string;
  readonly root: string;
  readonly skippedPaths: ReadonlyArray<string>;
} => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-old-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const deleteMe = join(root, "delete-me");
  const keepMe = join(root, "keep-me");
  const missingWorktree = join(root, "missing-worktree");
  const skippedWorktreeCount = options.skippedWorktrees ?? 1;
  const skippedPaths = [keepMe];

  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, repo]);
  git(repo, ["switch", "--quiet", "-c", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate });
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  setDefaultRemoteBranch(root, remote, repo);

  git(repo, ["branch", "feature/delete-me"]);
  git(repo, [
    "push",
    "--quiet",
    "--set-upstream",
    "origin",
    "feature/delete-me",
  ]);
  git(repo, ["worktree", "add", "--quiet", deleteMe, "feature/delete-me"]);

  git(repo, ["branch", "feature/keep-me"]);
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/keep-me"]);
  git(repo, ["worktree", "add", "--quiet", keepMe, "feature/keep-me"]);
  writeFileSync(join(keepMe, "README.md"), "# changed repo\n");

  for (let index = 2; index <= skippedWorktreeCount; index += 1) {
    const skippedPath = join(root, `keep-me-${index}`);
    skippedPaths.push(skippedPath);
    git(repo, ["branch", `feature/keep-me-${index}`]);
    git(repo, [
      "push",
      "--quiet",
      "--set-upstream",
      "origin",
      `feature/keep-me-${index}`,
    ]);
    git(repo, [
      "worktree",
      "add",
      "--quiet",
      skippedPath,
      `feature/keep-me-${index}`,
    ]);
    writeFileSync(join(skippedPath, "README.md"), "# changed repo\n");
  }

  git(repo, ["branch", "feature/missing"]);
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/missing"]);
  git(repo, ["worktree", "add", "--quiet", missingWorktree, "feature/missing"]);
  rmSync(missingWorktree, { recursive: true, force: true });

  return {
    deleteMe,
    keepMe,
    repo,
    root,
    skippedPaths,
  };
};

test("rm-old deletes eligible linked worktrees and skips unsafe linked worktrees", (t) => {
  const { deleteMe, keepMe, repo, root } = seedRmOldFixture(t);

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm-old", root, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.match(output, /^deleted: 1$/m);
  assert.match(output, /^skipped: 1$/m);
  assert.match(output, /^failed: 0$/m);
  assert.match(output, new RegExp(`^  ${deleteMe}$`, "m"));
  assert.match(output, new RegExp(`^  ${keepMe} \\(dirty\\)$`, "m"));
  assert.doesNotMatch(output, /"status"/);
  assert.doesNotMatch(output, /"committedWork"/);
  assert.equal(existsSync(deleteMe), false);
  assert.equal(existsSync(keepMe), true);
  assert.equal(existsSync(repo), true);
});

test("rm-old prints deletion progress to stderr", (t) => {
  const { root } = seedRmOldFixture(t);

  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm-old", root, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TREEZAP_PROGRESS: "1",
      },
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^deleted: 1$/m);
  assert.match(result.stdout, /^skipped: 1$/m);
  assert.match(result.stdout, /^failed: 0$/m);
  assert.match(result.stderr, /treezap: checking repos \[/);
  assert.match(result.stderr, /treezap: deleting worktrees \[/);
  assert.match(result.stderr, /2\/2 1 deleted, 1 skipped, 0 failed/);
});

test("rm-old truncates skipped path output after five paths", (t) => {
  const { root, skippedPaths } = seedRmOldFixture(t, { skippedWorktrees: 6 });

  const output = execFileSync(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm-old", root, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.match(output, /^deleted: 1$/m);
  assert.match(output, /^skipped: 6$/m);
  assert.match(output, /^failed: 0$/m);

  for (const skippedPath of skippedPaths.slice(0, 5)) {
    assert.match(output, new RegExp(`^  ${skippedPath} \\(dirty\\)$`, "m"));
  }

  assert.doesNotMatch(
    output,
    new RegExp(`^  ${skippedPaths[5]} \\(dirty\\)$`, "m"),
  );
  assert.match(output, /^ {2}6 total\.\.\.$/m);
});

test("rm-old exits on SIGINT", async (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-old-sigint-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  for (let index = 0; index < 200; index += 1) {
    mkdirSync(join(root, `directory-${index}`));
  }

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "src/main.ts", "rm-old", root, "--min-age", "30d"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        TREEZAP_PROGRESS: "1",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  const exited = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) => {
    child.on("exit", (code, signal) => resolve({ code, signal }));
  });
  const progressStarted = new Promise<void>((resolve) => {
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.includes("treezap: scanning repos")) {
        resolve();
      }
    });
  });

  await progressStarted;
  child.kill("SIGINT");

  const result = await exited;

  assert.equal(result.code, 130);
  assert.equal(result.signal, null);
  assert.match(stderr, /treezap: interrupted/);
});
