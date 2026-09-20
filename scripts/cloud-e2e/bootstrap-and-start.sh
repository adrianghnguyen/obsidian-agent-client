#!/usr/bin/env bash
set -euo pipefail
ROOT="$(bash "/workspace/scripts/cloud-e2e/cloud-e2e-root.sh")"
START="$ROOT/obsidian-plugin-development/scripts/cloud-e2e/env-start.sh"
if [ ! -x "$START" ]; then
  echo "cloud-e2e start script missing at $START" >&2
  exit 1
fi
# env-start.sh resolves sibling repos from cwd (/agent/repos, $PWD, or ../).
# Cloud builds invoke this from /workspace, so move to the sibling root first.
cd "$ROOT"
export CLOUD_E2E_REPOS="$ROOT"
exec bash "$START"
