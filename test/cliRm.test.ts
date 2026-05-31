import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

const createSubmoduleRemote = (root: string): string => {
  const remote = join(root, "submodule.git");
  const checkout = join(root, "submodule-source");

  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, checkout]);
  git(checkout, ["switch", "--quiet", "-c", "main"]);
  git(checkout, ["config", "user.email", "treezap-test@example.test"]);
  git(checkout, ["config", "user.name", "Sentinel Test"]);
  writeFileSync(join(checkout, "README.md"), "# test submodule\n");
  git(checkout, ["add", "README.md"]);
  git(checkout, ["commit", "--quiet", "-m", "initial submodule commit"]);
  git(checkout, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  git(root, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);

  return remote;
};

const createLinkedWorktreeWithSubmodule = (
  root: string,
  oldDate: Date,
  branchName: string,
  linkedWorktree: string,
): string => {
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const submoduleRemote = createSubmoduleRemote(root);

  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, repo]);
  git(repo, ["switch", "--quiet", "-c", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate });
  git(repo, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "add",
    "--quiet",
    submoduleRemote,
    "deps/submodule",
  ]);
  git(repo, ["commit", "--quiet", "-am", "add submodule"], { date: oldDate });
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  setDefaultRemoteBranch(root, remote, repo);
  git(repo, ["branch", branchName]);
  git(repo, ["push", "--quiet", "--set-upstream", "origin", branchName]);
  git(repo, ["worktree", "add", "--quiet", linkedWorktree, branchName]);
  git(linkedWorktree, [
    "-c",
    "protocol.file.allow=always",
    "submodule",
    "update",
    "--init",
    "--quiet",
  ]);

  return repo;
};

test("rm command deletes an eligible linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const linkedWorktree = join(root, "linked-worktree");

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
  git(repo, [
    "worktree",
    "add",
    "--quiet",
    linkedWorktree,
    "feature/delete-me",
  ]);

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "rm",
      linkedWorktree,
      "--min-age",
      "30d",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.path, linkedWorktree);
  assert.equal(parsed.minimumAgeDays, 30);
  assert.equal(parsed.deleted, true);
  assert.equal(parsed.eligible, true);
  assert.equal(parsed.ageDays >= 44, true);
  assert.deepEqual(parsed.decision, {
    deletable: true,
    reasons: [],
  });
  assert.equal(parsed.status.path, linkedWorktree);
  assert.equal(existsSync(linkedWorktree), false);
  assert.equal(existsSync(repo), true);
});

test("rm command deletes an eligible linked worktree with an initialized submodule", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const linkedWorktree = join(root, "linked-worktree");
  const repo = createLinkedWorktreeWithSubmodule(
    root,
    oldDate,
    "feature/delete-submodule-worktree",
    linkedWorktree,
  );

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "rm",
      linkedWorktree,
      "--min-age",
      "30d",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.deleted, true);
  assert.deepEqual(parsed.decision, {
    deletable: true,
    reasons: [],
  });
  assert.equal(existsSync(linkedWorktree), false);
  assert.equal(existsSync(repo), true);
});

test("rm command does not delete an unsafe linked worktree", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const linkedWorktree = join(root, "linked-worktree");

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
  git(repo, ["branch", "feature/keep-me"]);
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "feature/keep-me"]);
  git(repo, ["worktree", "add", "--quiet", linkedWorktree, "feature/keep-me"]);

  writeFileSync(join(linkedWorktree, "README.md"), "# changed repo\n");

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "rm",
      linkedWorktree,
      "--min-age",
      "30d",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.path, linkedWorktree);
  assert.equal(parsed.deleted, false);
  assert.equal(parsed.eligible, false);
  assert.deepEqual(parsed.decision.reasons, ["dirty"]);
  assert.equal(existsSync(linkedWorktree), true);
});

test("rm command does not delete a linked worktree with dirty submodule work", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const linkedWorktree = join(root, "linked-worktree");
  createLinkedWorktreeWithSubmodule(
    root,
    oldDate,
    "feature/keep-dirty-submodule-worktree",
    linkedWorktree,
  );

  writeFileSync(
    join(linkedWorktree, "deps", "submodule", "scratch.txt"),
    "scratch\n",
  );

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "rm",
      linkedWorktree,
      "--min-age",
      "30d",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.deleted, false);
  assert.equal(parsed.eligible, false);
  assert.deepEqual(parsed.decision.reasons, ["dirty"]);
  assert.equal(existsSync(linkedWorktree), true);
});

test("rm command deletes a clean no-upstream worktree with no unique patches", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const linkedWorktree = join(root, "linked-worktree");

  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, repo]);
  git(repo, ["switch", "--quiet", "-c", "main"]);
  git(repo, ["config", "user.email", "treezap-test@example.test"]);
  git(repo, ["config", "user.name", "Sentinel Test"]);

  writeFileSync(join(repo, "README.md"), "# test repo\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "old commit"], { date: oldDate });
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"]);

  git(repo, ["switch", "--quiet", "-c", "feature/equivalent"]);
  writeFileSync(join(repo, "equivalent.txt"), "same patch\n");
  git(repo, ["add", "equivalent.txt"]);
  git(repo, ["commit", "--quiet", "-m", "feature equivalent commit"], {
    date: oldDate,
  });

  git(repo, ["switch", "--quiet", "main"]);
  writeFileSync(join(repo, "equivalent.txt"), "same patch\n");
  git(repo, ["add", "equivalent.txt"]);
  git(repo, ["commit", "--quiet", "-m", "main equivalent commit"], {
    date: oldDate,
  });
  git(repo, ["push", "--quiet"]);
  setDefaultRemoteBranch(root, remote, repo);

  git(repo, [
    "worktree",
    "add",
    "--quiet",
    linkedWorktree,
    "feature/equivalent",
  ]);

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "rm",
      linkedWorktree,
      "--min-age",
      "30d",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.deleted, true);
  assert.deepEqual(parsed.decision, {
    deletable: true,
    reasons: [],
  });
  assert.equal(parsed.status.upstream, undefined);
  assert.equal(parsed.status.committedWork.uniquePatchCount, 0);
  assert.equal(parsed.status.committedWork.equivalentPatchCount, 1);
  assert.equal(existsSync(linkedWorktree), false);
});

test("rm command refuses a clean no-upstream worktree with unique patches", (t) => {
  const root = mkdtempSync(join(tmpdir(), "treezap-cli-rm-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));

  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");
  const linkedWorktree = join(root, "linked-worktree");

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

  git(repo, ["switch", "--quiet", "-c", "feature/unique"]);
  writeFileSync(join(repo, "unique.txt"), "unique patch\n");
  git(repo, ["add", "unique.txt"]);
  git(repo, ["commit", "--quiet", "-m", "feature unique commit"], {
    date: oldDate,
  });
  git(repo, ["switch", "--quiet", "main"]);
  git(repo, ["worktree", "add", "--quiet", linkedWorktree, "feature/unique"]);

  const output = execFileSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/main.ts",
      "rm",
      linkedWorktree,
      "--min-age",
      "30d",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const parsed = JSON.parse(output);

  assert.equal(parsed.deleted, false);
  assert.deepEqual(parsed.decision.reasons, ["unique_patches"]);
  assert.equal(parsed.status.upstream, undefined);
  assert.equal(parsed.status.committedWork.uniquePatchCount, 1);
  assert.equal(existsSync(linkedWorktree), true);
});
