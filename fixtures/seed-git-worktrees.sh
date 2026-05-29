#!/usr/bin/env bash
set -euo pipefail

ROOT=/workspace
PROJECTS="$ROOT/projects"
REMOTE_ROOT="$ROOT/remotes"
WORKTREES="$ROOT/worktrees"
TOOL_WORKTREES=/tmp/tool-worktrees
OTHER_WORKTREES="$ROOT/other-tool/worktrees"

rm -rf "$PROJECTS" "$REMOTE_ROOT" "$WORKTREES" "$TOOL_WORKTREES" "$OTHER_WORKTREES" "$ROOT/.seeded" "$ROOT/FIXTURE.md"
mkdir -p "$PROJECTS" "$REMOTE_ROOT" "$WORKTREES" "$TOOL_WORKTREES" "$OTHER_WORKTREES"

git config --global user.email "sentinel-fixture@example.test"
git config --global user.name "Sentinel Fixture"
git config --global init.defaultBranch main

date_days_ago() {
  date -u -d "$1 days ago" +"%Y-%m-%dT12:00:00Z"
}

commit_all() {
  local repo=$1
  local message=$2
  local days_ago=$3
  local commit_date
  commit_date=$(date_days_ago "$days_ago")

  git -C "$repo" add -A
  GIT_AUTHOR_DATE="$commit_date" GIT_COMMITTER_DATE="$commit_date" git -C "$repo" commit -m "$message" >/dev/null
}

push_branch() {
  local repo=$1
  local branch=$2
  git -C "$repo" push -u origin "$branch" >/dev/null 2>&1
}

create_remote_repo() {
  local name=$1
  local repo="$PROJECTS/$name"
  local remote="$REMOTE_ROOT/$name.git"

  git init --bare "$remote" >/dev/null 2>&1
  git clone "$remote" "$repo" >/dev/null 2>&1

  echo "# $name" > "$repo/README.md"
  commit_all "$repo" "initial commit" 120
  push_branch "$repo" main
}

create_worktree() {
  local repo=$1
  local branch=$2
  local path=$3
  local days_ago=$4
  local pushed=${5:-yes}

  git -C "$repo" switch main >/dev/null 2>&1
  git -C "$repo" switch -c "$branch" >/dev/null 2>&1
  mkdir -p "$repo/fixtures"
  echo "$branch seeded $days_ago days ago" > "$repo/fixtures/$branch.txt"
  commit_all "$repo" "$branch fixture commit" "$days_ago"

  if [[ "$pushed" == "yes" ]]; then
    push_branch "$repo" "$branch"
  fi

  git -C "$repo" switch main >/dev/null 2>&1
  git -C "$repo" worktree add "$path" "$branch" >/dev/null 2>&1
}

create_remote_repo alpha
create_worktree "$PROJECTS/alpha" old-clean "$WORKTREES/alpha-old-clean" 45 yes
create_worktree "$PROJECTS/alpha" recent-clean "$WORKTREES/alpha-recent-clean" 5 yes
create_worktree "$PROJECTS/alpha" old-dirty "$TOOL_WORKTREES/alpha-old-dirty" 60 yes
echo "unstaged local edit" >> "$TOOL_WORKTREES/alpha-old-dirty/fixtures/old-dirty.txt"
create_worktree "$PROJECTS/alpha" old-untracked "$OTHER_WORKTREES/alpha-old-untracked" 75 yes
echo "untracked local file" > "$OTHER_WORKTREES/alpha-old-untracked/untracked.txt"
create_worktree "$PROJECTS/alpha" old-unpushed "$WORKTREES/alpha-old-unpushed" 50 no

create_remote_repo beta
create_worktree "$PROJECTS/beta" stale-clean "$TOOL_WORKTREES/beta-stale-clean" 90 yes
create_worktree "$PROJECTS/beta" threshold-edge "$WORKTREES/beta-threshold-edge" 30 yes

cat > "$ROOT/FIXTURE.md" <<EOF
# Worktree Sentinel Fixture

Main checkout root:

- $PROJECTS

Worktree locations intentionally vary:

- $WORKTREES
- $TOOL_WORKTREES
- $OTHER_WORKTREES

Seeded cases:

- alpha old-clean: clean, pushed, 45 days old, should be eligible with --min-age 30d.
- alpha recent-clean: clean, pushed, 5 days old, should be skipped with --min-age 30d.
- alpha old-dirty: pushed and old, but has unstaged changes, should be refused.
- alpha old-untracked: pushed and old, but has an untracked file, should be refused.
- alpha old-unpushed: old with local commits not pushed, should be refused.
- beta stale-clean: clean, pushed, 90 days old, should be eligible with --min-age 30d.
- beta threshold-edge: clean, pushed, exactly 30 days old, useful for boundary behavior.

Useful commands:

  sentinel scan $PROJECTS
  sentinel stat $WORKTREES/alpha-old-clean
  sentinel rm-old $PROJECTS --min-age 30d
EOF

touch "$ROOT/.seeded"

echo "Seeded Worktree Sentinel fixture in $ROOT"
echo "Read $ROOT/FIXTURE.md for cases."
