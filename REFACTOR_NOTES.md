# Refactor Notes

## Reduce `stat` Git subprocesses

`inspectPath` currently composes several small Git commands to gather status facts. The `yield*` sequencing is not the efficiency issue; the subprocess count is.

Later, refactor `inspectPath` around a richer Git primitive:

- Prefer `git status --porcelain=v2 --branch` as the main status command.
- Parse branch, upstream, ahead/behind, dirty, and untracked facts from that output.
- Keep `git log -1 --format=%cI` only if commit age remains required for deletion policy.
- Avoid `git rev-list --left-right --count` when porcelain v2 already provides ahead/behind.
- Avoid `git rev-parse --is-inside-work-tree` for paths already discovered as worktrees; keep validation only for direct user-provided paths if needed.

Goal: preserve the same `WorktreeStatus` output while reducing per-worktree Git subprocesses.
