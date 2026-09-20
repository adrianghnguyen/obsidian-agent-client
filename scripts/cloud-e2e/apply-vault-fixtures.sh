#!/usr/bin/env bash
# Overlay agent-client (and sibling) cloud E2E fixtures onto the synthetic vault.
# Run after obsidian-plugin-development materialize-vault.sh, or on an existing vault.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURES="$SCRIPT_DIR/fixtures/vault"

# shellcheck source=/dev/null
if [ -f "${CLOUD_E2E_PATHS:-}" ]; then
  source "$CLOUD_E2E_PATHS"
elif [ -f "$HOME/repos/obsidian-plugin-development/scripts/cloud-e2e/paths.env" ]; then
  # shellcheck source=paths.env
  source "$HOME/repos/obsidian-plugin-development/scripts/cloud-e2e/paths.env"
elif [ -f /tmp/obsidian-plugin-development/scripts/cloud-e2e/paths.env ]; then
  # shellcheck source=paths.env
  source /tmp/obsidian-plugin-development/scripts/cloud-e2e/paths.env
else
  CLOUD_E2E_VAULT="${CLOUD_E2E_VAULT:-$HOME/plugin-sandbox-Obsidian}"
fi

VAULT="${CLOUD_E2E_VAULT:-$HOME/plugin-sandbox-Obsidian}"

if [ ! -d "$FIXTURES" ]; then
  echo "Missing fixtures at $FIXTURES" >&2
  exit 1
fi

mkdir -p "$VAULT/.obsidian/plugins"
cp -a "$FIXTURES/." "$VAULT/"
echo "Applied cloud E2E fixtures from $REPO_ROOT to $VAULT"
