# plugin.ts leftovers (Gate 3)

After Gate 1 handover extracts and Gate 2 peels (settings types, plugin-update-checker, session-scoped commands), `src/plugin.ts` remains the Obsidian composition root.

## Keep on AgentClientPlugin (intentional)

- `extends Plugin`, `onload` / `onunload`
- `loadData` / `saveData` / `loadSettings` / `saveSettings` / `saveSettingsAndNotify`
- `migrateLegacyApiKey` (secretStorage side effects)
- `ensureDefaultAgentId` / `ensureAtLeastOneEnabled`
- One-line facades: ACP pool, pending prompts, `checkForUpdates`, `findNearestEmbeddedChat`
- `runPromptInChat` orchestration (view routing + deliver)
- Core onload command wiring (open chat, floating toggle, etc.) that calls host methods

## Still inlined (next peels)

- Workspace leaf helpers: `activateView`, `createNewChatLeaf`, `openNewChatViewWithAgent`, focus helpers → `src/services/chat-leaf.ts`
- Floating host: open/toggle/close/tabs/layout flush → `src/services/floating-chat-host.ts`
- Agent markdown blocks: `renderAgentBlock`, `ensureEmbedId`, `generateEmbedId` → `src/services/agent-block-processor.ts`

## Already peeled

- pending-prompts, acp-client-pool, chat-panel-delegate, embedded-chat-lookup
- types/settings + default-settings
- plugin-update-checker
- commands/register-plugin-commands (agent/permission/mode/broadcast)
