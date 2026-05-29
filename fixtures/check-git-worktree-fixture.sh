#!/usr/bin/env bash
set -euo pipefail

fail() {
  echo "fixture check failed: $*" >&2
  exit 1
}

assert_dir() {
  local path=$1
  [[ -d "$path" ]] || fail "missing directory: $path"
}

assert_contains() {
  local haystack=$1
  local needle=$2
  [[ "$haystack" == *"$needle"* ]] || fail "expected output to contain: $needle"
}

assert_no_upstream() {
  local repo=$1
  if git -C "$repo" rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
    fail "expected no upstream for $repo"
  fi
}

assert_dir /workspace/projects/alpha
assert_dir /workspace/projects/beta
assert_dir /workspace/worktrees/alpha-old-clean
assert_dir /workspace/worktrees/alpha-recent-clean
assert_dir /tmp/tool-worktrees/alpha-old-dirty
assert_dir /workspace/other-tool/worktrees/alpha-old-untracked
assert_dir /workspace/worktrees/alpha-old-unpushed
assert_dir /tmp/tool-worktrees/beta-stale-clean
assert_dir /workspace/worktrees/beta-threshold-edge

alpha_worktrees=$(git -C /workspace/projects/alpha worktree list --porcelain)
beta_worktrees=$(git -C /workspace/projects/beta worktree list --porcelain)

assert_contains "$alpha_worktrees" "worktree /tmp/tool-worktrees/alpha-old-dirty"
assert_contains "$alpha_worktrees" "worktree /workspace/other-tool/worktrees/alpha-old-untracked"
assert_contains "$alpha_worktrees" "worktree /workspace/worktrees/alpha-old-clean"
assert_contains "$alpha_worktrees" "worktree /workspace/worktrees/alpha-old-unpushed"
assert_contains "$alpha_worktrees" "worktree /workspace/worktrees/alpha-recent-clean"
assert_contains "$beta_worktrees" "worktree /tmp/tool-worktrees/beta-stale-clean"
assert_contains "$beta_worktrees" "worktree /workspace/worktrees/beta-threshold-edge"

dirty_status=$(git -C /tmp/tool-worktrees/alpha-old-dirty status --porcelain)
untracked_status=$(git -C /workspace/other-tool/worktrees/alpha-old-untracked status --porcelain)

assert_contains "$dirty_status" " M fixtures/old-dirty.txt"
assert_contains "$untracked_status" "?? untracked.txt"
assert_no_upstream /workspace/worktrees/alpha-old-unpushed

treezap --help >/dev/null
candidate_counts=$(treezap candidates /workspace/projects --min-age 30d --count)
assert_contains "$candidate_counts" "deletable: 2"
assert_contains "$candidate_counts" "old_enough_blocked:"
assert_contains "$candidate_counts" "blocked_unique_patches:"

equivalent_status=$(treezap stat /workspace/worktrees/alpha-old-clean)
assert_contains "$equivalent_status" '"uniquePatchCount": 0'
assert_contains "$equivalent_status" '"equivalentPatchCount": 1'

unique_status=$(treezap stat /workspace/worktrees/alpha-old-unpushed)
assert_contains "$unique_status" '"uniquePatchCount": 1'
assert_contains "$unique_status" '"unique_patches"'

cat <<'EOF'
Fixture check passed.

Seed root:
  /workspace/projects

Known deletion candidates with --min-age 30d:
  /workspace/worktrees/alpha-old-clean
  /tmp/tool-worktrees/beta-stale-clean

Known refusal cases:
  /tmp/tool-worktrees/alpha-old-dirty
  /workspace/other-tool/worktrees/alpha-old-untracked
  /workspace/worktrees/alpha-old-unpushed

Boundary/recent cases:
  /workspace/worktrees/alpha-recent-clean
  /workspace/worktrees/beta-threshold-edge
EOF
