# plugin.ts leftovers (Gate 3)

After Gate 1 handover extracts and Gate 2 peels (settings types, plugin-update-checker), `src/plugin.ts` remains the Obsidian composition root (~1480 lines).

## Keep on AgentClientPlugin (intentional)

- `extends Plugin`, `onload` / `onunload`
- `loadData` / `saveData` / `loadSettings` / `saveSettings` / `saveSettingsAndNotify`
- `migrateLegacyApiKey` (secretStorage side effects)
- `ensureDefaultAgentId` / `ensureAtLeastOneEnabled`
- One-line facades: ACP pool, pending prompts, `checkForUpdates`, `findNearestEmbeddedChat`
- `runPromptInChat` orchestration (view routing + deliver)

## Still inlined (candidates for a later peel)

- Workspace leaf helpers: `activateView`, `createNewChatLeaf`, `openNewChatViewWithAgent`, focus helpers
- Floating host: open/toggle/close/tabs/layout flush
- Command registration + broadcast
- Agent markdown blocks: `renderAgentBlock`, `ensureEmbedId`, `generateEmbedId`

These stay for now: high Obsidian `app.workspace` / vault coupling, public facades already stable, suite green. Further peels should be separate commits when needed.
