## Description

Remove five first-class preset harnesses (Gemini CLI, Mistral Vibe, OpenCode, Kiro, Hermes Agent) so the fork only ships Claude Code, Codex, Cursor, and Antigravity. Set **Cursor** as the default agent for new installs and fallbacks. Drop the Gemini in-chat deprecation banner and related harness code.

On load, orphan `presetAgents` keys from removed harnesses are dropped and invalid/missing defaults resolve to **Cursor** (with `data.json` rewrite when cleanup runs). Cloud sandbox fixtures live under `scripts/cloud-e2e/fixtures/` + `apply-vault-fixtures.sh`.

README and docs now point at this repo (`adrianghnguyen/obsidian-agent-client`) and in-tree guides under `docs/` (plus `docs/README.md` as the GitHub index). Removed preset setup pages and cloud-e2e secret bindings for dropped presets.

## Video verification (Cloud VM E2E)

Obsidian **1.13.7**, vault `plugin-sandbox-Obsidian`, branch build deployed. Settings → Agent Client → **Agents** → **Preset agents**: only Claude Code, Codex, Cursor, and Antigravity (all enabled). Removed harnesses do not appear.

https://github.com/adrianghnguyen/obsidian-agent-client/assets/e2e/pr40-preset-agents-verification.mp4

<video src="https://github.com/adrianghnguyen/obsidian-agent-client/raw/chore/deprecate-harnesses-ui/docs/assets/e2e/pr40-preset-agents-verification.mp4" controls width="100%"></video>

![Preset agents — four harnesses only](https://github.com/adrianghnguyen/obsidian-agent-client/raw/chore/deprecate-harnesses-ui/docs/assets/e2e/pr40-video-frame.png)

CDP: `getAvailableAgents()` → `claude-code-acp`, `codex-acp`, `cursor`, `antigravity`. Default agent: **Cursor** (fixture + load cleanup).

## Related issue

<!-- e.g., Closes #123 -->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [x] Documentation
- [x] Refactor
- [ ] Other

## Checklist

- [x] `npm run lint` passes ("Use sentence case for UI text" errors are acceptable for brand names)
- [x] `npm run build` passes
- [x] Tested in Obsidian (Cloud VM — see video above)
- [x] Existing functionality still works (four presets + custom agents path)
- [x] Documentation updated if needed

## Testing environment

- Agent: Cursor (default), Claude Code / Codex / Antigravity presets
- OS: Linux (Cursor Cloud VM, synthetic sandbox vault)

## Screenshots

See frame above under **Video verification**.
