#!/usr/bin/env bash
set -euo pipefail

if [[ ! -f /workspace/.seeded ]]; then
  seed-git-worktrees
fi

exec "$@"
