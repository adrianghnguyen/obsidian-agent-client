# plugin.ts leftovers (Gate 3)

`src/plugin.ts` is the Obsidian composition root (~840 lines after Gate 1–2 peels).

## Keep on AgentClientPlugin (intentional)

- `extends Plugin`, `onload` / `onunload`
- `loadData` / `saveData` / `loadSettings` / `saveSettings` / `saveSettingsAndNotify`
- `migrateLegacyApiKey` (secretStorage side effects)
- `ensureDefaultAgentId` / `ensureAtLeastOneEnabled` / `getAvailableAgents`
- Hosts: `acpClientPool`, `pendingPrompts`, `agentBlocks`, `floatingChatHost`, `chatLeaf`
- One-line public facades for ACP / floating / leaf / prompts / updates
- `runPromptInChat` orchestration (view routing + `pendingPrompts.deliver`)
- FAB / status-bar mount lifecycle
- Core onload command wiring that calls host methods

## Peeled modules

| Module | Path |
|--------|------|
| View registry tests | `test/view-registry.test.ts` |
| Pending prompts | `src/services/pending-prompts.ts` |
| ACP client pool | `src/services/acp-client-pool.ts` |
| Chat panel delegate | `src/ui/chat-panel-delegate.ts` |
| Embedded chat lookup | `src/services/embedded-chat-lookup.ts` |
| Settings types / defaults | `src/types/settings.ts`, `src/services/default-settings.ts` |
| Plugin GitHub updates | `src/services/plugin-update-checker.ts` |
| Session-scoped commands | `src/commands/register-plugin-commands.ts` |
| Agent markdown blocks | `src/services/agent-block-processor.ts`, `src/utils/embed-id.ts` |
| Floating chat host | `src/services/floating-chat-host.ts` |
| Chat leaf / workspace | `src/services/chat-leaf.ts` |

No further peels planned unless loadSettings / migrateLegacyApiKey is worth extracting later.
