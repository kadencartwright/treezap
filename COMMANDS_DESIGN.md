# Remaining Command Design

`scan` now discovers primary repositories and lists their registered worktrees. The remaining CLI surface should build on that inventory without adding model-driven behavior.

## Commands

### `sentinel stat <path>`

Purpose: report deletion safety facts for one repository or worktree.

Output JSON should include:

- `path`
- `exists`
- `isGitWorktree`
- `status`: branch, detached, or bare
- `head`
- `upstream`
- `dirty`: tracked changes present
- `untracked`: untracked files present
- `ahead`
- `behind`
- `lastCommitAt`
- `ageDays`
- `deletable`
- `reasons`

Rules:

- No mutation.
- Treat untracked files as unsafe by default.
- Treat missing upstream or unpushed commits as unsafe by default.

### `sentinel rm <path> [--min-age 30d]`

Purpose: delete one stale repository or worktree after safety checks.

Flow:

1. Run the same inspection as `stat`.
2. Require clean working tree.
3. Require no untracked files.
4. Require no unpushed commits.
5. Require `ageDays >= minAgeDays`.
6. Re-read state immediately before deletion.
7. Delete only if the second read still passes.

Rules:

- Refuse by default when safety facts are unknown.
- Delete linked worktrees through `git worktree remove` when possible.
- Delete standalone primary repos with filesystem removal only after the same safety gates pass.
- Print JSON with `deleted`, `path`, and `reasons`.

### `sentinel rm-old <root> [--min-age 30d]`

Purpose: bulk delete stale worktrees discovered from primary repos under a root.

Flow:

1. Run `scanRoot(root)`.
2. Evaluate each discovered worktree with the same inspection as `stat`.
3. Skip main checkouts unless we explicitly decide primary repo deletion is in scope.
4. Delete only entries passing the same gates as `rm`.
5. Continue on normal skips.
6. Return a JSON summary.

Output JSON should include:

- `root`
- `minAgeDays`
- `deleted`
- `skipped`
- `failed`

Rules:

- Skips are not command failures.
- Operational errors are command failures only when they prevent the bulk operation from continuing.
- Each deletion should revalidate state independently.

## Modules

### `src/duration.ts`

Parse CLI duration strings.

- `parseMinAge(input: string): Either<DurationParseError, MinAge>`
- Support `d` only for now, such as `30d`.
- Reject zero or negative values unless we intentionally support `0d`.

### `src/git.ts`

Small Git command boundary.

- Run Git commands.
- Preserve `cwd`, `stdout`, `stderr`, and exit status.
- Convert process failures into typed errors.
- Keep command construction centralized.

### `src/status.ts`

Inspect one path.

- `inspectPath(path): Effect<WorktreeStatus, StatusError>`
- Owns `git status --porcelain`, branch/upstream checks, ahead/behind, and last commit date.
- Should not delete anything.

### `src/deletable.ts`

Pure policy module.

- `evaluateDeletion(status, minAge): DeletionDecision`
- No filesystem or Git calls.
- Converts status facts into `deletable` plus reason codes.

### `src/remove.ts`

Single-target deletion executor.

- `removePath(path, options): Effect<RemoveResult, RemoveError>`
- Calls `inspectPath`.
- Calls `evaluateDeletion`.
- Revalidates immediately before deletion.
- Dispatches to Git worktree removal or filesystem removal.

### `src/bulkRemove.ts`

Bulk deletion executor.

- `removeOld(root, options): Effect<BulkRemoveResult, BulkRemoveError>`
- Calls `scanRoot`.
- Calls `removePath` or shared lower-level deletion logic per candidate.
- Aggregates deleted, skipped, and failed entries.

### `src/scan.ts`

Current scan composition.

- Keep repository discovery and worktree listing here.
- `rm-old` should reuse this instead of rediscovering worktrees separately.

### `src/main.ts`

CLI wiring only.

- Parse args and options.
- Invoke module functions.
- Print JSON.
- Avoid embedding policy or Git command logic.

## Testing Plan

- Unit test pure parsers and policy in isolation.
- Use temp Git repos for `status`, `remove`, and `bulkRemove` tests.
- Use the Docker fixture for end-to-end messy topology checks.
- Keep red-green loops at module boundaries before wiring each command.
