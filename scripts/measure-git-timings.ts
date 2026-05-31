import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { Effect } from "effect";

import { removeOldWorktrees } from "../src/bulkRemove";
import { collectCandidates } from "../src/candidates";
import { resetGitCommandTimings, summarizeGitCommandTimings } from "../src/git";

const minimumAgeDays = 30;
const repositoryCount = Number.parseInt(
  process.env.TREEZAP_TIMING_REPOSITORIES ?? "16",
  10,
);
const repoConcurrency = Number.parseInt(
  process.env.TREEZAP_TIMING_REPO_CONCURRENCY ?? "16",
  10,
);
const inspectConcurrency = Number.parseInt(
  process.env.TREEZAP_TIMING_INSPECT_CONCURRENCY ?? "2",
  10,
);

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

const createSubmoduleRemote = (root: string): string => {
  const remote = join(root, "submodule.git");
  const checkout = join(root, ".cache", "submodule-source");

  mkdirSync(join(root, ".cache"), { recursive: true });
  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, checkout]);
  git(checkout, ["switch", "--quiet", "-c", "main"]);
  git(checkout, ["config", "user.email", "treezap-timing@example.test"]);
  git(checkout, ["config", "user.name", "Treezap Timing"]);
  writeFileSync(join(checkout, "README.md"), "# timing submodule\n");
  git(checkout, ["add", "README.md"]);
  git(checkout, ["commit", "--quiet", "-m", "initial submodule commit"]);
  git(checkout, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  git(root, ["--git-dir", remote, "symbolic-ref", "HEAD", "refs/heads/main"]);

  return remote;
};

const pushBranch = (repo: string, branch: string): void => {
  git(repo, ["push", "--quiet", "--set-upstream", "origin", branch]);
};

const addWorktree = (repo: string, worktree: string, branch: string): void => {
  git(repo, ["worktree", "add", "--quiet", worktree, branch]);
};

const createRepositoryFixture = (
  root: string,
  index: number,
  options: { readonly submoduleRemote?: string },
): void => {
  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const recentDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const remote = join(root, `remote-${index}.git`);
  const repo = join(root, `repo-${index}`);

  git(root, ["init", "--quiet", "--bare", remote]);
  git(root, ["clone", "--quiet", remote, repo]);
  git(repo, ["switch", "--quiet", "-c", "main"]);
  git(repo, ["config", "user.email", "treezap-timing@example.test"]);
  git(repo, ["config", "user.name", "Treezap Timing"]);
  writeFileSync(join(repo, "README.md"), `# timing ${index}\n`);
  git(repo, ["add", "README.md"]);
  git(repo, ["commit", "--quiet", "-m", "initial commit"], { date: oldDate });

  if (options.submoduleRemote !== undefined) {
    git(repo, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "add",
      "--quiet",
      options.submoduleRemote,
      "deps/submodule",
    ]);
    git(repo, ["commit", "--quiet", "-am", "add submodule"], {
      date: oldDate,
    });
  }

  git(repo, ["push", "--quiet", "--set-upstream", "origin", "main"]);
  setDefaultRemoteBranch(root, remote, repo);

  const oldCleanBranch = `feature/old-clean-${index}`;
  git(repo, ["branch", oldCleanBranch]);
  pushBranch(repo, oldCleanBranch);
  const oldCleanWorktree = join(root, `old-clean-${index}`);
  addWorktree(repo, oldCleanWorktree, oldCleanBranch);

  if (options.submoduleRemote !== undefined) {
    git(oldCleanWorktree, [
      "-c",
      "protocol.file.allow=always",
      "submodule",
      "update",
      "--init",
      "--quiet",
    ]);
  }

  const recentBranch = `feature/recent-${index}`;
  git(repo, ["switch", "--quiet", "main"]);
  git(repo, ["switch", "--quiet", "-c", recentBranch]);
  mkdirSync(join(repo, "recent"), { recursive: true });
  writeFileSync(join(repo, "recent", `${index}.txt`), `recent ${index}\n`);
  git(repo, ["add", join("recent", `${index}.txt`)]);
  git(repo, ["commit", "--quiet", "-m", `recent ${index}`], {
    date: recentDate,
  });
  pushBranch(repo, recentBranch);
  git(repo, ["switch", "--quiet", "main"]);
  addWorktree(repo, join(root, `recent-${index}`), recentBranch);

  const dirtyBranch = `feature/dirty-${index}`;
  git(repo, ["branch", dirtyBranch]);
  pushBranch(repo, dirtyBranch);
  const dirtyWorktree = join(root, `dirty-${index}`);
  addWorktree(repo, dirtyWorktree, dirtyBranch);
  writeFileSync(join(dirtyWorktree, "README.md"), `# dirty ${index}\n`);

  const untrackedBranch = `feature/untracked-${index}`;
  git(repo, ["branch", untrackedBranch]);
  pushBranch(repo, untrackedBranch);
  const untrackedWorktree = join(root, `untracked-${index}`);
  addWorktree(repo, untrackedWorktree, untrackedBranch);
  writeFileSync(join(untrackedWorktree, "scratch.txt"), `scratch ${index}\n`);

  const uniqueBranch = `feature/unique-${index}`;
  git(repo, ["switch", "--quiet", "main"]);
  git(repo, ["switch", "--quiet", "-c", uniqueBranch]);
  mkdirSync(join(repo, "unique"), { recursive: true });
  writeFileSync(join(repo, "unique", `${index}.txt`), `unique ${index}\n`);
  git(repo, ["add", join("unique", `${index}.txt`)]);
  git(repo, ["commit", "--quiet", "-m", `unique ${index}`], {
    date: oldDate,
  });
  git(repo, ["switch", "--quiet", "main"]);
  addWorktree(repo, join(root, `unique-${index}`), uniqueBranch);

  const missingBranch = `feature/missing-${index}`;
  git(repo, ["branch", missingBranch]);
  pushBranch(repo, missingBranch);
  const missingWorktree = join(root, `missing-${index}`);
  addWorktree(repo, missingWorktree, missingBranch);
  rmSync(missingWorktree, { recursive: true, force: true });
};

const createFixture = (): string => {
  const root = mkdtempSync(join(tmpdir(), "treezap-timing-"));
  const submoduleRemote = createSubmoduleRemote(root);

  for (let index = 0; index < repositoryCount; index += 1) {
    createRepositoryFixture(root, index, {
      submoduleRemote: index === 0 ? submoduleRemote : undefined,
    });
  }

  return root;
};

const measure = async <T>(
  label: string,
  run: () => Promise<T>,
): Promise<{
  readonly label: string;
  readonly result: T;
  readonly timings: unknown;
}> => {
  resetGitCommandTimings();
  const startedAt = performance.now();
  const result = await run();
  const wallDurationMs = performance.now() - startedAt;

  return {
    label,
    result,
    timings: {
      wallDurationMs,
      ...summarizeGitCommandTimings(),
    },
  };
};

const candidateRoot = createFixture();
const removeRoot = createFixture();

try {
  const candidates = await measure("candidates", async () => {
    const result = await Effect.runPromise(
      collectCandidates(candidateRoot, {
        minimumAgeDays,
        concurrency: repoConcurrency,
        inspectConcurrency,
      }),
    );

    return {
      candidates: result.candidates.length,
      blockedCandidates: result.blockedCandidates.length,
      blockedReasons: result.counts.oldEnoughBlocked.reasons,
    };
  });

  const removeOld = await measure("rm-old", async () => {
    const result = await Effect.runPromise(
      removeOldWorktrees(removeRoot, {
        minimumAgeDays,
        concurrency: repoConcurrency,
      }),
    );

    return {
      deleted: result.deleted.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
    };
  });

  console.log(
    JSON.stringify(
      {
        fixture: {
          repositories: repositoryCount,
          inspectableLinkedWorktrees: repositoryCount * 5,
          missingLinkedWorktrees: repositoryCount,
          includesInitializedSubmoduleRemovalPath: true,
          repoConcurrency,
          inspectConcurrencyPerRepo: inspectConcurrency,
          deleteConcurrencyPerRepo: 1,
        },
        measurements: [candidates, removeOld],
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(candidateRoot, { recursive: true, force: true });
  rmSync(removeRoot, { recursive: true, force: true });
}
