# Fork notes (adrianghnguyen)

This working copy is the **fork**, not the parent. Day-to-day push/PR targets `origin` (`adrianghnguyen/obsidian-agent-client`). `upstream` is `RAIT-09/obsidian-agent-client` (permanent). Parent default branch is `master`.

`gh` may resolve to upstream. Pass `--repo adrianghnguyen/obsidian-agent-client` for fork PRs/API. Do not open routine feature PRs against RAIT-09 unless asked.

What the plugin must do, and which tests lock it: [Expected behavior & test baseline](#expected-behavior--test-baseline).

**Deploy (default = sandbox):** When the user says **deploy**, copy the build to the **sandbox** vault unless they explicitly ask for production/main (`Obsidian` vault).

- **Sandbox (default):** `C:\plugin-sandbox-Obsidian\.obsidian\plugins\agent-client\` → `obsidian plugin:reload id=agent-client vault=plugin-sandbox-Obsidian`
- **Production (explicit only):** `C:\Obsidian\.obsidian\plugins\agent-client\` → `obsidian plugin:reload id=agent-client vault=Obsidian`

Plugin id: `agent-client`. Finish bar: `.cursor/rules/deploy-and-verify.mdc`. Copy `main.js`, `manifest.json`, and `styles.css`. Do not touch vault `data.json` or `sessions/`. Community Update overwrites the fork build.

**Debug mode:** the plugin has a `debugMode` setting (Settings → Agent Client → Advanced → **Debug mode**). Turn it on when diagnosing ACP spawn/init, floating chat, or session issues — Logger output (`[AcpClient]`, `[AcpHandler]`, etc.) only appears with DevTools open while this flag is enabled. Prefer enabling it over guessing from opaque UI errors.

**Deploy flow:** after copy + reload, **enable Debug Mode** for verification, then **turn it off before finishing** the task (leave the user’s vault without debug logging left on). Stale CSS/layout escalation: see `obsidian-multi-vault-cli` global skill. `manifest.json` changes take effect on `plugin:reload` or `app:reload` — no full restart needed.

Upstream sync: merge on `sync/upstream-<version>` (not rebase) from `upstream/master`, then ff-merge to `master`, push origin, deploy, delete temp branch. Prefer upstream for ACP/session/adapter core; prefer fork for local UX once it exists; ask on ambiguous overlaps.

Vault catalog: `Notes/obsidian plugin tweaks.md`. Fork/deploy workflow: plugin skill `obsidian-plugin-tweaks` (Obsidian Plugin Development).

### Versioning and changelog

User-facing changes: log under `CHANGELOG.md` `[Unreleased]` when ready; version bump on `main` only — see plugin skill `obsidian-plugin-dev` (Obsidian Plugin Development) — Release notes and semantic versioning. This repo also syncs `package.json` and `versions.json` at release (or via `npm version` / release script).

### Cursor Cloud environment

Setup is owned by `obsidian-plugin-development`. This repo ships the shared pointer plus its own secret-id map. **Do not copy script bodies here.**

- Pointer: `.cursor/environment.json` (same `install` / `start` on all four `main`s)
- Scripts (plugin-development only): `scripts/cloud-e2e/env-install.sh`, `env-start.sh`, `install-acp-agents.sh`, `paths.env`
- Walkthrough: `scripts/cloud-e2e/README.md`, `GETTING-STARTED.md`
- Secret **ids**: this repo’s `.cloud-e2e/secret-bindings.json`; fallbacks `obsidian-plugin-development/scripts/cloud-e2e/bindings/*.json` via `load-bindings.mjs`
- Identity gate: `env-start.sh` CDP eval + `paths.env` (no separate id file)

Project doc: `/cursor/stores/bc-a8a2e9ee-3f2b-4d31-ae8c-85b3734c071e/docs/cursor-environment-docs.md`

#### Cloud Agent UI demos (Obsidian)

Use this playbook when a task changes chat UI (composer, floating chat, queue strip, toolbar) and you need walkthrough evidence in Cursor Cloud—not for configuring the built-in `computerUse` subagent (that model is fixed; the parent agent follows this doc instead).

1. **Boot** — Environment builds run `obsidian-plugin-development/scripts/cloud-e2e/env-install.sh` (see `.cursor/environment.json`). On a live pod with only one checkout, from this repo: `bash scripts/cloud-e2e/bootstrap-and-install.sh`, then `bash scripts/cloud-e2e/bootstrap-and-start.sh` (Obsidian + vault). Default vault: `plugin-sandbox-Obsidian` (`~/plugin-sandbox-Obsidian` on Linux cloud). Do not point `environment.json` at `/workspace/…` — multi-repo builds clone into `/agent/repos/` and `/workspace` is absent.
2. **Build and deploy** — `npm test` (relevant suites), `npm run build`, copy `main.js`, `manifest.json`, and `styles.css` into the vault’s `.obsidian/plugins/agent-client/`, then `obsidian plugin:reload id=agent-client vault=plugin-sandbox-Obsidian`. Do not overwrite vault `data.json` or `sessions/`.
3. **Exercise the UI** — Prefer the **floating chat** entry (`floatingChatEntry` / ribbon) when the feature is view-agnostic. Keep the **entire** chat window in frame (composer, chip strip, send/queue icon). Move a corner floating window to the center if needed; start/stop the clip around the interaction (not minutes of idle). Unique chip text and X must be readable. Use **`computerUse`** for GUI steps; use **RecordScreen** (or the walkthrough-artifacts skill) for MP4/WebP under `/opt/cursor/artifacts/`.

   **Floating chat behavior clips** (context, composer, per-session state):

   - Run the demo **inside the floating chat**, with **more than one session** open (tabs in one window, or separate windows).
   - The recording must **switch between those sessions** on camera. A still of one tab, or a clip that only toggles an icon, is not enough.
   - Use **real vault notes**. Open them, send in each session, and show whether that file is actually attached (the `@Note` chip on the user message, or its absence). Icon state alone does not count.
4. **Verify** — Enable **Debug Mode** only while checking spawn/logs, then turn it off before finishing. Tell the user to close and reopen affected chat views if CSS/layout looks stale (`app:reload` before a full restart).
5. **PRs** — Embed artifacts with `<video>` / `<img>` tags (absolute paths under `/opt/cursor/artifacts/`). Under each clip, add a **short bullet list of expected on-screen behavior** so reviewers know what to look for.
6. **Optional** — Run the **`videoReview`** subagent on demo MP4s for subtle UI regressions. Invoke the repo custom subagent **`ui-demo-verifier`** (`.cursor/agents/ui-demo-verifier.md`) to score a recording against the composer-buffer checklist. Treat cropped or unreadable controls as a fail, especially on short clips.

---

# Agent Client Plugin - LLM Developer Guide

## Overview
Obsidian plugin for AI agent interaction (Claude Code, Codex, Gemini CLI, Mistral Vibe, OpenCode, Kiro, Hermes Agent, Cursor, Antigravity, custom agents) via ACP.

**Tech**: React 19, TypeScript, Obsidian API, Agent Client Protocol (ACP)

## Expected behavior & test baseline

Each chat owns one ACP client, keyed by view id (`AcpClientPool`). `ChatViewRegistry` tracks which chats are open and which one is focused. Docked and floating chats must behave the same; only the window chrome differs.

Functional tests live in `test/functional/*.test.ts`. They wire real services (pool, registry, session storage, permission manager, ACP handler, harness open plan) under Vitest and the Obsidian stub. They do not boot Obsidian or spawn an ACP agent. Unit tests still cover one helper at a time. CI job `lint-test-build` runs `npm run lint`, `npm test`, and `npm run build`.

Moving a chat between floating and docked views is part of the baseline below. The harness and `ChatPlacementHost` suites both run against the real pool and registry; production moves go through `src/services/chat-placement-host.ts`.

```bash
npm test -- test/functional
```

### Tiers

| Tier | Where | What it covers |
| --- | --- | --- |
| Functional | `test/functional/*.test.ts` | Cross-module outcomes, including placement harness and `ChatPlacementHost wired to the real pool and registry`. |
| Unit | `test/**/*.test.ts` outside `functional/` (e.g. `test/chat-placement.test.ts`, `test/session-history-pin.test.ts`) | One class or pure helper. Placement unit tests mock the host ports and cover drop targets. |
| Manual Obsidian | Sandbox vault `plugin-sandbox-Obsidian` | Drag onto the sidebar or editor, header buttons, Notice popups, tab chrome, leaf ids, keychain UI, a live ACP process. |
| Optional smoke | `npm run smoke:voice` | Gemini Live transcript. Not part of `npm test`. |

### Critical-path matrix

| Path | Invariant | Test | Tier |
| --- | --- | --- | --- |
| Dock a connected floating chat | Same ACP client, session id, in-flight turn, transcript, and draft. View id reused. Client stays up after the teardown grace. | `test/functional/chat-placement-continuity.test.ts` `keeps the ACP client and transcript when a connected chat docks` | Functional (harness and host) |
| Float a docked chat mid-turn | Same client, view becomes floating, still sending. | same file, `keeps the same client when a busy docked chat floats` | Functional |
| Move a chat that has not connected | Draft, files, and queued send move. New view id and new uninitialized client. Old session and transcript are not copied. Source disconnects. | same file, `copies the composer onto a new client when the chat is not connected` | Functional |
| Tabbed floating window | Only the moved tab changes place. The sibling keeps its client, session, and draft. | Sibling checks in the two dock tests above | Functional |
| Still connecting or authenticating | Move refused. Client stays up, even if it is already marked initialized. | `refuses to move a chat that is still connecting`; `refuses to move a chat that is still authenticating` | Functional |
| Destination cannot open | Source stays. Client stays connected. | `leaves the source in place when the destination cannot open` | Functional |
| Floating chat turned off | Float refused. Docked chat unchanged. | `does not float when floating chat is disabled` | Functional |
| Already docked | Dock is a no-op and does not disconnect. | `ignores a dock request for a chat that is already docked` | Functional |
| Same view id, source closes after the destination registered | `unregisterInstance` keeps the replacement. `unregister` by id deletes it. | `registry handoff` in the same file | Functional |
| New chat / switch harness | Enabled default agent. A disabled stored default falls back. A disabled agent still resolves for an open session. The next chat starts disconnected with no session id. | `test/functional/session-lifecycle.test.ts` | Functional |
| API key at spawn | Secret id attaches `ANTHROPIC_API_KEY` intent. Empty id or blank secret does not export the var. | same file | Functional |
| Saved mode and model | Restored on the client before the session is treated as ready. Unknown values are not sent. | same file | Functional |
| Send after connect | One auth method retries once. Two methods ask the user. An empty response is success. | same file | Functional |
| Two open chats | Each view id has its own client. Focusing one does not disconnect the other. Grace teardown disconnects only the closed id. Remount inside the grace window keeps the client. | `test/functional/multi-view-isolation.test.ts` | Functional |
| Pending prompt bus | A prompt drains only into the view that registered that id. `clear()` drops anything not yet delivered. | same file | Functional |
| Unread, busy, broadcast | Focusing a chat clears only that chat's unread flag. Busy count and `toType` follow each view. | same file | Functional |
| Composer queue | FIFO while connecting, mid-turn, or restoring. Error blocks flush. A chip cancelled after take is not sent. | `test/functional/composer-send-pipeline.test.ts` | Functional |
| Composer vs permission | An active permission on the transcript blocks flush. Clearing it sends the queued text. | same file | Functional |
| History restore | A different harness restarts, then loads that session's transcript. The same harness only restores. | `test/functional/session-history-restore.test.ts` | Functional |
| History list | Local rows from another harness appear. Titles prefer local metadata. The next activity write heals `agentId`. | same file | Functional |
| Index cap vs clear | LRU eviction drops the index row and keeps the transcript file. History clear deletes the index row and the file. | same file | Functional |
| Embedded block | Newest `embedId` wins across agents. Renaming does not change `updatedAt` or which session is newest. | same file | Functional |
| Streaming transcript | User, thought, and answer chunks merge. Tool updates do not duplicate the call. Nested text stays on the parent tool. Another session id and `usage_update` do not change the transcript. The file reloads the same tool status. Saved title wins. | `test/functional/message-stream-persist.test.ts` | Functional |
| Permission queue | First request is the banner. Responding activates the next and keeps the composer blocked until the queue is empty. | `test/functional/permission-queue.test.ts` | Functional |
| Auto-allow and cancel | Auto-allow resolves with no banner. Cancel resolves every pending request and clears the banner. | same file | Functional |
| Permission for another session | The tool call is not shown on this transcript, so the composer is not blocked. Cancel still settles the hidden request. | same file | Functional |
| Harness spawn plan | A missing Cursor absolute path becomes `agent`. `CURSOR_API_KEY` is injected from the secret id. | `test/functional/harness-spawn-plan.test.ts` | Functional |
| Cursor session open | A key skips authenticate. An auth failure after that defers to `HarnessAuthRequiredError` and does not authenticate again. No key and no trusted login authenticates, then opens. | same file | Functional |
| Claude session open | No authenticate step. | same file | Functional |
| Custom agent and spawn failure | Custom command and env pass through with no API-key intent. `openHarnessSession` rejects an unknown id. A missing Cursor CLI is retitled `Cursor CLI Not Found`. | same file | Functional |
| Drag highlight, **Dock this chat**, **Float this chat** | Floating tab or dock button dropped on the left sidebar, right sidebar, or editor docks that chat. Float button on a floating window floats a docked chat. Header buttons, More menu, and commands **Dock floating chat** / **Float chat view** match the same rules. | Drop targets: `test/chat-placement.test.ts`. Host move: `ChatPlacementHost wired to the real pool and registry`. Notice pixels and drag outline. | Unit, functional, and manual |
| Pin persistence | `savedSessions.pinned`, skip LRU, skip history clear, cold restore. | `test/session-history-pin.test.ts`, `test/session-storage.test.ts` | Unit; hold-to-close tab UX is manual |
| Live ACP process | Real spawn, stdin/stdout, agent transcript. | — | Manual |
| Frame batching and React unmount | Merge result and pool grace are functional. Per-frame RAF timing and a real chat unmount are not. | — | Manual |
| Leaf id, tab chrome, chips, settings toggles | Workspace leaf vs `viewId`, glyphs, chip pixels, settings controls. | — | Manual |
| Keychain UI and voice | Secret picker. `npm run smoke:voice` for Gemini Live. | — | Manual |

## Architecture

```
src/
├── types/                       # Type definitions (no logic, no dependencies)
│   ├── chat.ts                  # ChatMessage, MessageContent, PromptContent, AttachedFile, ActivePermission
│   ├── session.ts               # ChatSession, SessionUpdate (12-type union), SessionInfo, Capabilities
│   ├── agent.ts                 # BaseAgentSettings, PresetAgentUserSettings, CustomAgentSettings
│   └── errors.ts                # AcpError, ProcessError, ErrorInfo
├── acp/                         # ACP protocol (SDK dependency confined here)
│   ├── acp-client.ts            # Process lifecycle, UI-facing API (AcpClient class)
│   ├── acp-handler.ts           # SDK event handler + sessionId filter + listener broadcast
│   ├── type-converter.ts        # ACP SDK ↔ internal type conversion
│   ├── permission-handler.ts    # Permission queue, auto-approve, Promise resolution
│   └── terminal-handler.ts      # Terminal process create/output/kill
├── services/                    # Business logic (non-React, no React imports)
│   ├── vault-service.ts         # Vault access + fuzzy search + CM6 selection tracking
│   ├── settings-service.ts      # Reactive settings store (observer pattern only)
│   ├── session-storage.ts       # Session metadata + message file I/O (sessions/*.json)
│   ├── preset-agents.ts         # Static registry of preset (built-in) agents (PRESET_AGENTS)
│   ├── settings-normalizer.ts   # Settings validation helpers + presetAgents normalization/migration
│   ├── session-helpers.ts       # Agent enumeration/resolution, API key injection (pure functions)
│   ├── session-state.ts         # Session state updates (legacy mode/model, config restore)
│   ├── message-state.ts         # Message array transforms (upsert, merge, streaming apply)
│   ├── message-sender.ts        # Prompt preparation + sending (pure functions)
│   ├── chat-exporter.ts         # Markdown export with frontmatter
│   ├── view-registry.ts         # Multi-view management, focus, broadcast
│   └── update-checker.ts        # Agent/plugin version checking
├── hooks/                       # React custom hooks (state + logic)
│   ├── useAgent.ts              # Facade: composes useAgentSession + useAgentMessages
│   ├── useAgentSession.ts       # Session lifecycle, config options, optimistic updates
│   ├── useAgentMessages.ts      # Message state, streaming (RAF batch), permissions
│   ├── useSuggestions.ts        # @[[note]] mentions + /command suggestions (unified)
│   ├── useSessionHistory.ts     # Session list/load/resume/fork
│   ├── useChatActions.ts        # Business callbacks (send, newChat, export, restart, etc.)
│   ├── useHistoryModal.ts       # Session history modal lifecycle
│   └── useSettings.ts           # Settings subscription (useSyncExternalStore)
├── ui/                          # React components
│   ├── ChatContext.ts           # React Context (plugin, acpClient, vaultService, settingsService)
│   ├── ChatPanel.tsx            # Orchestrator: calls hooks, workspace events, rendering
│   ├── ChatView.tsx             # Sidebar view (ItemView wrapper)
│   ├── FloatingChatView.tsx     # Floating window (position/drag/resize)
│   ├── ChatHeader.tsx           # Header (sidebar + floating variants)
│   ├── MessageList.tsx          # Virtualized message list (@tanstack/react-virtual)
│   ├── MessageBubble.tsx        # Single message rendering (content dispatch, copy button)
│   ├── ToolCallBlock.tsx        # Tool call + diff display (word-level highlighting)
│   ├── TerminalBlock.tsx        # Terminal output polling
│   ├── InputArea.tsx            # Textarea, attachments, mentions, history
│   ├── InputToolbar.tsx         # Config/mode/model selectors, usage, send button
│   ├── SuggestionPopup.tsx      # Mention/command dropdown
│   ├── PermissionBanner.tsx     # Permission request buttons
│   ├── ErrorBanner.tsx          # Error/notification overlay
│   ├── SessionHistoryModal.tsx  # Session history modal (list + confirm delete)
│   ├── FloatingButton.tsx       # Draggable launch button
│   ├── SettingsTab.ts           # Plugin settings UI
│   ├── view-host.ts             # IChatViewHost interface
│   └── shared/
│       ├── IconButton.tsx       # Icon button + Lucide icon wrapper
│       ├── MarkdownRenderer.tsx # Obsidian markdown rendering
│       └── AttachmentStrip.tsx  # Attachment preview strip
├── utils/                       # Shared utilities (pure functions)
│   ├── platform.ts              # Shell, WSL, Windows env, command building
│   ├── paths.ts                 # Path resolution, file:// URI
│   ├── error-utils.ts           # ACP error conversion
│   ├── mention-parser.ts        # @[[note]] detection/extraction
│   └── logger.ts                # Debug-mode logger
├── plugin.ts                    # Obsidian plugin lifecycle, settings persistence
└── main.ts                      # Entry point
```

## Data Flow

### ACP Event Flow (single path)
```
Agent Process → ACP SDK → AcpHandler (sessionId filter) → listeners broadcast
  → useAgentSession (session-level: commands, mode, config, usage, error)
  → useAgentMessages (message-level: text chunks, tool calls, plan)
  → useAgent (facade, 1 onSessionUpdate subscription)
```

All events flow through a single `onSessionUpdate` channel. No special paths for permissions or errors.

### Permission Flow
```
Agent requestPermission → PermissionManager.request() → onSessionUpdate (tool_call)
User clicks approve/reject → PermissionManager.respond() → onSessionUpdate (tool_call_update)
```

## Key Components

### ChatPanel (`ui/ChatPanel.tsx`)
Central orchestrator component.
- **Hook Composition**: Calls useAgent, useSuggestions, useSessionHistory, useChatActions, useHistoryModal, useSettings
- **Workspace Events**: Handles hotkeys via ref pattern (stable event registration)
- **Callback Registration**: IChatViewContainer callbacks via refs
- **Rendering**: Renders ChatHeader, MessageList, InputArea directly

ChatPanel does NOT route session updates — that's handled internally by useAgent.

### ChatView / FloatingChatView (`ui/ChatView.tsx`, `ui/FloatingChatView.tsx`)
Thin wrappers that:
- Create services (AcpClient, VaultService) in lifecycle methods
- Provide ChatContext (plugin, acpClient, vaultService, settingsService)
- Render `<ChatPanel variant="sidebar" | "floating" />`
- Implement IChatViewContainer for broadcast commands

FloatingChatView uses `onRegisterExpanded` callback (not CustomEvent) for expand/collapse.

**UX parity:** Sidebar chat view and floating chat view must behave the same for user experience (scroll, composer, context chips, permissions, message actions, jump controls, etc.). Layout chrome may differ (header, window chrome, density); interaction and feature behavior must not. Implement shared behavior in `ChatPanel` / shared children (`MessageList`, `InputArea`, …), not as floating-only or sidebar-only forks, unless the difference is unavoidable chrome.

### Hooks (`hooks/`)

**useAgent** (facade): Comp훈oses useAgentSession + useAgentMessages
- Single `onSessionUpdate` subscription
- Unified `handleSessionUpdate` dispatches to both sub-hooks
- Return is `useMemo`-wrapped for referential stability

**useAgentSession**: Session lifecycle + config
- `createSession()`: Build config, inject API keys, initialize + newSession
- `setConfigOption()`: Optimistic update + rollback on error
- `setMode()` / `setModel()`: Legacy API (deprecated, still used by many agents)
- Session-level update handler (commands, mode, config, usage, process_error)
- Uses `sessionRef` pattern to stabilize callback deps

**useAgentMessages**: Messaging + streaming + permissions
- `sendMessage()`: Prepare (auto-mention, path conversion) → send via AcpClient
- RAF batching: streaming updates accumulated per-frame via `requestAnimationFrame`
- Tool call index: `Map<string, number>` for O(1) upsert
- `ignoreUpdatesRef`: suppresses history replay during session/load
- Permission: `activePermission` (useMemo derivation), approve/reject callbacks

**useSuggestions**: @mention + /command (unified)
- Mention detection, note searching, dropdown interaction
- Slash command filtering and selection
- Auto-mention toggle coordination (slash commands disable auto-mention)
- Return is `useMemo`-wrapped (mentions + commands objects)

**useChatActions**: Business callbacks
- handleSendMessage, handleNewChat, handleExportChat, handleRestartAgent, etc.
- Uses individual method deps (not whole agent object) for stability
- Owns restoredMessage and agentUpdateNotification state

**useSessionHistory**: Session persistence
- `restoreSession()`: Load/resume with local message fallback
- `forkSession()`: Create new branch from existing session
- 5-minute cache with invalidation
- Return is `useMemo`-wrapped

**useHistoryModal**: Modal lifecycle
- Lazy modal creation, props synchronization
- Session operation callbacks (restore, fork, delete)

### ACP Client (`acp/acp-client.ts`) + ACP Handler (`acp/acp-handler.ts`)

**AcpClient** — UI-facing API and process lifecycle:
- spawn() with login shell, JSON-RPC via ndJsonStream
- initialize() → newSession() → sendPrompt() → cancel() → disconnect()
- Session management: listSessions, loadSession, resumeSession, forkSession
- Owns PermissionManager, TerminalManager, AcpHandler
- `currentSessionId` set before `await` in loadSession/resumeSession to prevent replay filtering
- Single exit point: `onSessionUpdate` (multiple listeners via Set)

**AcpHandler** — SDK event receiver:
- sessionUpdate: converts ACP types → domain types → broadcast to listeners
- sessionId filter: only emits updates matching `currentSessionId`
- requestPermission → PermissionManager
- Terminal operations → TerminalManager

### Services (`services/`)

**VaultService**: Vault access + file index + fuzzy search + CM6 selection tracking
**SettingsService**: Reactive settings store (observer pattern for useSyncExternalStore). Session storage delegated to SessionStorage.
**SessionStorage**: Session metadata CRUD (in plugin settings) + message file I/O (sessions/*.json)
**preset-agents**: Static registry (`PRESET_AGENTS`) of preset agent definitions — identity, spawn defaults, legacy data.json migration keys, API-key wiring, install hints, settings-UI copy. User overrides live in `settings.presetAgents[presetId]`
**settings-normalizer**: Validation helpers (str, bool, num, enumVal, obj, strRecord, xyPoint) + toAgentConfig + parseChatFontSize + normalizePresetAgents (legacy data.json migration; secret-storage side effects injected via ApiKeyMigrator)
**session-helpers**: Pure functions — buildAgentConfigWithApiKey, findAgentSettings, getAvailableAgentsFromSettings (single enumeration implementation; plugin.getAvailableAgents delegates here)
**session-state**: Pure functions — applyLegacyValue, tryRestoreConfigOption, restoreLegacyConfig
**message-state**: Pure functions — applySingleUpdate, applyUpsertToolCall, mergeToolCallContent, findActivePermission, selectOption
**message-sender**: Pure functions — preparePrompt (embedded context vs XML text, shared helpers), sendPreparedPrompt (auth retry)

## Types

### SessionUpdate (`types/session.ts`)
Union type for all session update events from the agent:

```typescript
type SessionUpdate =
  | AgentMessageChunk        // Text chunk from agent's response
  | AgentThoughtChunk        // Text chunk from agent's reasoning
  | UserMessageChunk         // Text chunk from user message (session/load)
  | ToolCall                 // New tool call event
  | ToolCallUpdate           // Update to existing tool call
  | Plan                     // Agent's task plan
  | AvailableCommandsUpdate  // Slash commands changed
  | CurrentModeUpdate        // Mode changed
  | SessionInfoUpdate        // Session metadata changed
  | UsageUpdate              // Context window usage
  | ConfigOptionUpdate       // Config options changed
  | ProcessErrorUpdate;      // Process-level error (spawn failure, command not found)
```

### Key Interfaces

```typescript
// services/vault-service.ts
interface IVaultAccess {
  readNote(path: string): Promise<string>;
  searchNotes(query: string): Promise<NoteMetadata[]>;
  getActiveNote(): Promise<NoteMetadata | null>;
  listNotes(): Promise<NoteMetadata[]>;
}

// services/settings-service.ts
interface ISettingsAccess {
  getSnapshot(): AgentClientPluginSettings;
  updateSettings(updates: Partial<AgentClientPluginSettings>): Promise<void>;
  subscribe(listener: () => void): () => void;
  // Session storage methods (delegated to SessionStorage internally)
  saveSession(info: SavedSessionInfo): Promise<void>;
  getSavedSessions(agentId?: string, cwd?: string): SavedSessionInfo[];
  deleteSession(sessionId: string): Promise<void>;
  saveSessionMessages(sessionId: string, agentId: string, messages: ChatMessage[]): Promise<void>;
  loadSessionMessages(sessionId: string): Promise<ChatMessage[] | null>;
  deleteSessionMessages(sessionId: string): Promise<void>;
}
```

## Development Rules

### Architecture
1. **useAgent as facade**: Composes useAgentSession + useAgentMessages. ChatPanel calls useAgent, not sub-hooks directly.
2. **Services have zero React imports**: Pure functions and classes in `services/`. No useState, useCallback, React.Dispatch, etc.
3. **ACP isolation**: All `@agentclientprotocol/sdk` imports confined to `acp/`. AcpClient is UI-facing, AcpHandler is SDK-facing.
4. **Types have zero deps**: No `obsidian`, no SDK, no React in `types/`
5. **Single event channel**: All agent events (messages, session updates, permissions, errors) flow through `onSessionUpdate`. No special callback paths.
6. **Context for services**: plugin, acpClient, vaultService, settingsService via ChatContext
7. **Sidebar ↔ floating UX parity**: Chat view and floating chat view must offer the same user-facing behaviors. Prefer shared components/hooks; do not ship a feature or control in only one variant.

### Performance Patterns
1. **useMemo for return stability**: useAgent, useSuggestions, useSessionHistory wrap return objects in useMemo to prevent cascading re-renders
2. **sessionRef pattern**: useAgentSession stores session in useRef for callback access without adding session to deps
3. **Individual method deps**: useChatActions uses `agent.sendMessage` not `agent` as deps — prevents callback recreation when unrelated state changes
4. **Workspace event refs**: ChatPanel stores event handler callbacks in refs, keeping useEffect deps minimal
5. **RAF batching**: useAgentMessages batches streaming updates per animation frame (~60fps) instead of per-chunk
6. **React.memo**: MessageBubble, ToolCallBlock, TerminalBlock wrapped for skip-render optimization
7. **Virtual scroll**: MessageList uses @tanstack/react-virtual for large conversations
8. **O(1) tool call index**: Map<string, number> for tool call upsert without linear scan

### Obsidian Plugin Review (CRITICAL)
1. No innerHTML/outerHTML - use createEl/createDiv/createSpan
2. NO detach leaves in onunload (antipattern)
3. Styles in CSS only - no JS style manipulation
4. Use Platform interface - not process.platform
5. Minimize `any` - use proper types

### Naming Conventions
- Types: `kebab-case.ts` in `types/`
- ACP: `kebab-case.ts` in `acp/`
- Services: `kebab-case.ts` in `services/`
- Hooks: `use*.ts` in `hooks/`
- Components: `PascalCase.tsx` in `ui/`
- Utils: `kebab-case.ts` in `utils/`

### Code Patterns
1. React hooks for state management
2. useCallback/useMemo for performance (see Performance Patterns above)
3. useRef for cleanup function access and stale closure prevention
4. Error handling: try-catch async ops
5. Logging: Logger class (respects debugMode). Avoid excessive per-keystroke logging.
6. **Upsert pattern**: Use `setMessages` functional updates to avoid race conditions with tool_call updates
7. **Ref pattern for callbacks**: IChatViewContainer and workspace event handlers use refs for latest values
8. **Context value stability**: ChatContext value created once (service instances), wrapped in useMemo
9. **Stable empty arrays**: Use module-level constants (e.g., `EMPTY_COMMANDS`) instead of inline `[]` in hook args

## Common Tasks

### Add New Feature Hook
1. Create `hooks/use[Feature].ts`
2. Define state with useState/useReducer
3. Export functions and state
4. Call the hook in `ui/ChatPanel.tsx`
5. Pass state/callbacks to child components as props
6. Wrap return object in `useMemo` if passed as dependency to other hooks

### Add Preset Agent
1. Add one harness module under `src/harnesses/<id>/` (preset row plus required
   `sessionAuthPolicy` — `{ kind: "none" }` or conditional with `credentialsReady` —
   and optional `healthCheck` / `mapConnectionError` / `docs` slots) and register
   it in `src/harnesses/index.ts`. `PRESET_AGENTS` is derived from the registry.
   Registry contract tests in `test/harnesses/session-auth-contract.test.ts` iterate
   every harness automatically.
   Settings storage, enumeration, API key injection, and the settings UI are all
   registry-driven — no per-agent code elsewhere.
2. Add docs — the full file list (do not shorten it; every past addition that
   skipped one needed a follow-up commit):
   `docs/agent-setup/<agent>.md` (new page), `docs/.vitepress/config.mts` (sidebar),
   `docs/index.md`, `docs/agent-setup/index.md`, `docs/getting-started/index.md`,
   `docs/getting-started/quick-start.md`, `docs/help/faq.md`,
   `docs/help/troubleshooting.md`, `docs/reference/acp-support.md`,
   `docs/usage/context-files.md`, `README.md`, `README.ja.md`,
   and the Agents list at the bottom of this file

### Modify Message Types
1. Update `ChatMessage`/`MessageContent` in `types/chat.ts`
2. If adding new session update type:
   - Add to `SessionUpdate` union in `types/session.ts`
   - Handle in `hooks/useAgentMessages.ts` (for message-level) or `hooks/useAgentSession.ts` (for session-level)
3. Update `acp/acp-handler.ts` `sessionUpdate()` to emit the new type
4. Update `ui/MessageBubble.tsx` `ContentBlock` to render new type

### Add New Session Update Type
1. Define interface in `types/session.ts`
2. Add to `SessionUpdate` union type
3. Handle in `hooks/useAgentSession.ts` `handleSessionUpdate()` (for session-level)
4. Or handle via `applySingleUpdate()` in `services/message-state.ts` (for message-level)
5. No routing needed in ChatPanel — useAgent handles dispatch internally

### Debug
1. Settings → Agent Client → Advanced → **Debug mode** ON (`debugMode` in settings / `data.json`)
2. Open DevTools (Cmd+Option+I / Ctrl+Shift+I)
3. Filter logs: `[AcpClient]`, `[AcpHandler]`, `[PermissionManager]`, `[VaultService]`
4. After deploy verification (or when diagnosis is done), turn **Debug Mode OFF** — do not leave it enabled in the vault.

Use this when ACP connection or spawn fails — console lines like `[AcpClient] Prepared spawn command:` and `[AcpClient] Initialization Error:` are gated on debug mode.

**Voice live smoke (optional, not CI):** `GEMINI_API_KEY=... npm run smoke:voice` feeds `test/voice-input/fixtures/sample-speech.wav` into Gemini Live and asserts a final transcript.

Secret **ids** for Keychain inject: see [Cursor Cloud environment](#cursor-cloud-environment). Preset spawn only exports a key if `presetAgents[id].apiKeySecretId` is set. Voice falls back to `agent-client-gemini-live-api-key` when `voiceInput.geminiApiKeySecretId` is empty.

## ACP Protocol

**Communication**: JSON-RPC 2.0 over stdin/stdout

**Methods**: initialize, newSession, authenticate, prompt, cancel, setSessionConfigOption
**Notifications**: session/update (agent_message_chunk, agent_thought_chunk, user_message_chunk, tool_call, tool_call_update, plan, available_commands_update, current_mode_update, session_info_update, usage_update, config_option_update)
**Requests**: requestPermission
**Session Management** (unstable): session/list, session/load, session/resume, session/fork

**Agents**:
- Claude Code: `@agentclientprotocol/claude-agent-acp` (ANTHROPIC_API_KEY)
- Codex: `@agentclientprotocol/codex-acp` (OPENAI_API_KEY)
- Cursor: `agent acp` via Cursor CLI (`curl https://cursor.com/install -fsS | bash`; auth via `agent login` or `CURSOR_API_KEY`)
- Antigravity: ACP bridge (`agy_acp_server.par` / `.exe` on Windows); OAuth via `~/.gemini/antigravity-acp/` or Gemini API key mode
- Custom: Any ACP-compatible agent (including former presets such as Gemini CLI, Mistral Vibe, OpenCode, Kiro, Hermes Agent)

---

**Last Updated**: April 2026 | **Architecture**: useAgent facade + sub-hooks | **Version**: 0.13.0
