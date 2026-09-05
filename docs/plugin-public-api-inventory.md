# Plugin public API + lifecycle inventory (Gate 1 close)

Frozen after handover coverage. Re-check after every Gate 2 peel.

## Public facades (must remain on AgentClientPlugin)

### ACP
- getOrCreateAcpClient
- acquireAcpClient
- releaseAcpClient
- removeAcpClient
- updateAllAutoAllow

### Prompts
- registerPendingPromptHandler
- runPromptInChat

### Views / floating
- activateView
- activateSessionManager
- openNewChatViewWithAgent
- closeView
- openNewFloatingChat
- closeFloatingChat
- toggleFloatingChat
- expandFloatingChat
- getFloatingChatInstances
- isFloatingChatEnabled
- clearFloatingTabbedShell
- flushFloatingWindowLayouts
- findNearestEmbeddedChat

### Settings
- settings
- settingsService
- saveSettings
- saveSettingsAndNotify
- ensureDefaultAgentId
- ensureAtLeastOneEnabled
- getAvailableAgents
- loadSettings

### Other
- viewRegistry
- voiceInput
- checkForUpdates
- setLastActiveChatViewId
- lastActiveChatViewId

## onload must still

- loadSettings → initializeLogger → createSettingsService
- detachLeavesOfType + registerView for chat and session manager
- ribbon icon → activateView
- core commands: open chat, focus next/prev, open new chat, session manager
- floating toggle/new/minimize/close (checkCallback + isFloatingChatEnabled)
- registerAgentCommands / registerPermissionCommands / registerSessionModeCommands / registerBroadcastCommands
- addSettingTab
- markdown processors for agent-client and agent
- mount floating button + status bar; bootstrap floating chat if enabled
- workspace quit (flush layouts + disconnect ACP clients)
- active-leaf-change focus sync
- voice module construct + registerCommands when enabled

## onunload must still

- flush floating layouts
- unmount FAB, status bar, tabbed shell, floating containers, embedded containers
- viewRegistry.clear()
- acpClientPool clear / disconnect; pendingPrompts.clear()
- dispose voice module

## Gate 1 modules covered

- view-registry (tests)
- pending-prompts (extract + tests)
- acp-client-pool (extract + tests)
- chat-panel-delegate (extract + tests)
- embedded-chat-lookup (extract + tests)
