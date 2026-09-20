#!/usr/bin/env bash
# Bootstrap sibling plugin repos for Cloud environment *builds*.
# Builds only checkout the primary repo to /workspace; install must populate /agent/repos
# before calling obsidian-plugin-development env-install.sh.
set -euo pipefail

ROOT="${CLOUD_E2E_REPOS:-$HOME/repos}"
mkdir -p "$ROOT"
export CLOUD_E2E_REPOS="$ROOT"

clone_if_missing() {
  local name=$1
  if [ -d "$ROOT/$name/.git" ]; then
    return 0
  fi
  echo "bootstrap: cloning $name into $ROOT"
  git clone --depth 1 "https://github.com/adrianghnguyen/${name}.git" "$ROOT/$name"
}

for repo in obsidian-plugin-development obsidian-seek whisper-obsidian-plugin; do
  clone_if_missing "$repo"
done

# Prefer the revision Cursor checked out for this environment build.
if [ -d /workspace/.git ]; then
  primary="$(basename "$(git -C /workspace rev-parse --show-toplevel)")"
  ln -sfn /workspace "$ROOT/$primary"
else
  clone_if_missing obsidian-agent-client
fi

# env-install resolves siblings via ../ when cwd is the orchestrator repo.
cd "$ROOT/obsidian-plugin-development"
exec bash scripts/cloud-e2e/env-install.sh
