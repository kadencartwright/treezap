# Treezap

Clean up stale Git worktrees without guessing where your tools put them.

Treezap is a small CLI that starts from the directory where your main checkouts live, asks Git where each repository's registered worktrees are, and removes only linked worktrees that pass conservative safety checks.

![Treezap demo](https://raw.githubusercontent.com/kadencartwright/treezap/master/assets/demo.gif)

## Why

Agent and editor workflows create worktrees in many different places. The main checkout is usually easy to find; the worktrees are not. Treezap uses Git's own worktree registry to discover them, then applies deterministic checks before deleting anything.

## Usage

Run it directly with `npx`:

```sh
npx treezap candidates ~/code --min-age 30d
```

## Quick Start

Scan the directory that contains your normal project checkouts:

```sh
npx treezap scan ~/code
```

Evaluate linked worktrees older than the minimum age:

```sh
npx treezap candidates ~/code --min-age 30d
```

The JSON includes `candidates` for worktrees that pass every safety check and
`blockedCandidates` for old worktrees that need review before deletion.

Print a compact count summary:

```sh
npx treezap candidates ~/code --min-age 30d --count
```

```text
deletable: 15
old_enough_blocked: 116
blocked_dirty: 31
blocked_untracked: 16
blocked_missing_upstream: 106
blocked_unpushed: 1
```

Delete eligible linked worktrees:

```sh
npx treezap rm-old ~/code --min-age 30d
```

Inspect one path:

```sh
npx treezap stat /path/to/worktree
```

Delete one eligible linked worktree:

```sh
npx treezap rm /path/to/worktree --min-age 30d
```

## Safety Rules

A worktree is not deleted unless it is:

- older than the minimum age
- clean, with no tracked changes
- free of untracked files
- connected to an upstream branch
- not ahead of its upstream

Bulk deletion skips primary repository checkouts. It only deletes linked worktrees discovered through `git worktree list`.

`--min-age` accepts case-insensitive durations:

- `30d` days
- `2w` weeks
- `1m` months, treated as 30 days
- `1y` years, treated as 365 days

The default is `30d`.

## Commands

```text
treezap scan <root>
treezap stat <path>
treezap candidates <root> [--min-age duration] [--count]
treezap rm <path> [--min-age duration]
treezap rm-old <root> [--min-age duration]
```

Command output is JSON except `--help` and `candidates --count`, so the CLI is straightforward to drive from scripts or agents.

## Development

```sh
npm test
npm run check
npm run build
```

The Docker fixture creates repositories and worktrees across several locations:

```sh
npm run fixture:build
npm run fixture:check
npm run fixture:shell
```
