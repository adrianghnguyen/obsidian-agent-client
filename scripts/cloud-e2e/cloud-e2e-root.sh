#!/usr/bin/env bash
# Resolve sibling-repo root for cloud-e2e (build pods cannot write /agent).
set -euo pipefail

if [ -d /agent/repos/obsidian-plugin-development ]; then
  printf '%s\n' /agent/repos
elif [ -d "${HOME}/repos/obsidian-plugin-development" ]; then
  printf '%s\n' "${HOME}/repos"
else
  printf '%s\n' "${HOME}/repos"
fi
