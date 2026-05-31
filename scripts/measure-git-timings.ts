import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { Effect } from "effect";

import { collectCandidates } from "../src/candidates";
import { resetGitCommandTimings, summarizeGitCommandTimings } from "../src/git";

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
    stdio: ["ignore", "pipe", "ignore"],
  });

const setDefaultRemoteBranch = (
  root: string,
  remote: string,
  repo: string,
): void => {
  git(root, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);
  git(repo, ["remote", "set-head", "origin", "-a"]);
};

const createFixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "treezap-timing-"));
  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const remote = join(root, "remote.git");
  const repo = join(root, "repo");

  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, repo]);
  git(repo, ["switch", "--quiet", "-c", "main"]);
  git(repo, ["config", "user.email", "treezap-timing@example.test"]);
  git(repo, ["config", "user.name", "Treezap Timing"]);
  writeFileSync(join(repo, "README.md"), "# timing\n");
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"], { date: oldDate });
  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  setDefaultRemoteBranch(root, remote, repo);

  for (let index = 0; index < 8; index += 1) {
    const branch = `feature/old-clean-${index}`;
    git(repo, ["branch", branch]);
    git(repo, ["push", "--quiet", "--set-upstream", "origin", branch]);
    git(repo, [
      "worktree",
      "add",
      "--quiet",
      join(root, `old-clean-${index}`),
      branch,
    ]);
  }

  for (let index = 0; index < 6; index += 1) {
    const branch = `feature/recent-${index}`;
    git(repo, ["switch", "--quiet", "main"]);
    git(repo, ["switch", "--quiet", "-c", branch]);
    mkdirSync(join(repo, "recent"), { recursive: true });
    writeFileSync(join(repo, "recent", `${index}.txt`), `recent ${index}\n`);
    git(repo, ["add", join("recent", `${index}.txt`)]);
    git(repo, ["commit", "--quiet", "-m", `recent ${index}`], {
      date: recentDate,
    });
    git(repo, ["push", "--quiet", "--set-upstream", "origin", branch]);
    git(repo, ["switch", "--quiet", "main"]);
    git(repo, [
      "worktree",
      "add",
      "--quiet",
      join(root, `recent-${index}`),
      branch,
    ]);
  }

  for (let index = 0; index < 6; index += 1) {
    const branch = `feature/dirty-${index}`;
    git(repo, ["branch", branch]);
    git(repo, ["push", "--quiet", "--set-upstream", "origin", branch]);
    const worktree = join(root, `dirty-${index}`);
    git(repo, ["worktree", "add", "--quiet", worktree, branch]);
    writeFileSync(join(worktree, "README.md"), `# dirty ${index}\n`);
  }

  for (let index = 0; index < 4; index += 1) {
    const branch = `feature/unique-${index}`;
    git(repo, ["switch", "--quiet", "main"]);
    git(repo, ["switch", "--quiet", "-c", branch]);
    mkdirSync(join(repo, "unique"), { recursive: true });
    writeFileSync(join(repo, "unique", `${index}.txt`), `unique ${index}\n`);
    git(repo, ["add", join("unique", `${index}.txt`)]);
    git(repo, ["commit", "--quiet", "-m", `unique ${index}`], {
      date: oldDate,
    });
    git(repo, ["switch", "--quiet", "main"]);
    git(repo, [
      "worktree",
      "add",
      "--quiet",
      join(root, `unique-${index}`),
      branch,
    ]);
  }

  return root;
};

const root = createFixture();

try {
  resetGitCommandTimings();
  const startedAt = performance.now();
  const result = await Effect.runPromise(
    collectCandidates(root, {
      minimumAgeDays: 30,
      inspectConcurrency: 1,
    }),
  );
  const wallDurationMs = performance.now() - startedAt;
  const summary = summarizeGitCommandTimings();

  console.log(
    JSON.stringify(
      {
        worktrees: result.candidates.length + result.blockedCandidates.length,
        candidates: result.candidates.length,
        blockedCandidates: result.blockedCandidates.length,
        wallDurationMs,
        ...summary,
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(root, { recursive: true, force: true });
}
