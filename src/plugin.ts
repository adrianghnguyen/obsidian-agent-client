import {
	Plugin,
	Notice,
} from "obsidian";
import { ChatView, VIEW_TYPE_CHAT } from "./ui/ChatView";
import { EmbeddedChatViewContainer } from "./ui/CodeBlockChatView";
import {
	SessionManagerView,
	VIEW_TYPE_SESSION_MANAGER,
} from "./ui/SessionManagerView";
import {
	FloatingTabbedShell,
} from "./ui/FloatingChatView";
import { FloatingButtonContainer } from "./ui/FloatingButton";
import { FloatingChatStatusBar } from "./ui/FloatingChatStatusBar";
import {
	ChatViewRegistry,
	type IChatViewContainer,
} from "./services/view-registry";
import { PendingPrompts } from "./services/pending-prompts";
import { AcpClientPool } from "./services/acp-client-pool";
import { findNearestEmbeddedChat as lookupNearestEmbeddedChat } from "./services/embedded-chat-lookup";
import {
	createSettingsService,
	type SettingsService,
} from "./services/settings-service";
import { AgentClientSettingTab } from "./ui/SettingsTab";
import { AcpClient } from "./acp/acp-client";
import {
	absorbCustomAgents,
	normalizeCustomAgent,
	ensureUniqueCustomAgentIds,
	normalizePresetAgents,
	resolveDefaultAgentId,
	type ApiKeyMigrator,
	parseChatFontSize,
	str,
	bool,
	num,
	enumVal,
	obj,
	strRecord,
	nestedStrRecord,
	xyPoint,
	resolveFloatingChatEntry,
	needsFloatingChatEntryMigration,
	migrateFloatingWindowLayoutFields,
	needsFloatingWindowLayoutMigration,
	parseFloatingIdleTimeoutMs,
	resolveFloatingIdleOpacityPercent,
	needsFloatingIdleOpacityMigration,
} from "./services/settings-normalizer";
import { PRESET_AGENTS } from "./services/preset-agents";
import { VoiceInputModule } from "./voice-input/VoiceInputModule";
import type { VoiceInputSettings } from "./voice-input/VoiceInputSettings";
import { normalizeVoiceInputSettings } from "./voice-input/VoiceInputSettings";
import {
	getAvailableAgentsFromSettings,
	firstEnabledAgentId,
	repairNoEnabledAgents,
} from "./services/session-helpers";
import {
	AgentEnvVar,
	PresetAgentUserSettings,
	CustomAgentSettings,
} from "./types/agent";
import type {
	AgentClientPluginSettings,
	SendMessageShortcut,
	ChatViewLocation,
	FloatingChatEntry,
} from "./types/settings";
import { DEFAULT_SETTINGS } from "./services/default-settings";
import { checkPluginForUpdates } from "./services/plugin-update-checker";
import { AgentBlockProcessor } from "./services/agent-block-processor";
import { FloatingChatHost } from "./services/floating-chat-host";
import { ChatLeafHost } from "./services/chat-leaf";
import { registerSessionScopedCommands } from "./commands/register-plugin-commands";
import type { SavedSessionInfo } from "./types/session";
import { initializeLogger, getLogger } from "./utils/logger";

// Re-export for backward compatibility
export type {
	AgentEnvVar,
	PresetAgentUserSettings,
	CustomAgentSettings,
	AgentClientPluginSettings,
	SendMessageShortcut,
	ChatViewLocation,
	FloatingChatEntry,
};

export default class AgentClientPlugin extends Plugin {
	settings: AgentClientPluginSettings;
	settingsService!: SettingsService;

	/** Registry for all chat view containers (sidebar + floating) */
	viewRegistry = new ChatViewRegistry();

	/** Per-view AcpClient pool with embedded remount grace teardown */
	private acpClientPool = new AcpClientPool<AcpClient>({
		create: () => new AcpClient(this),
		onDisconnectError: (viewId, error) => {
			getLogger().warn(
				`[AgentClient] Failed to disconnect client for view ${viewId}:`,
				error,
			);
		},
	});
	/**
	 * Pending-prompt handshake (ChatPanel register ↔ runPromptInChat deliver).
	 */
	private pendingPrompts = new PendingPrompts();
	/** Markdown agent / agent-client code block renderer */
	private agentBlocks = new AgentBlockProcessor(this);
	/** Floating chat window / tab orchestration */
	private floatingChatHost = new FloatingChatHost(this);
	/** Workspace leaf / ChatView activation helpers */
	private chatLeaf = new ChatLeafHost(this);
	/** Floating button container (independent from chat view instances) */
	private floatingButton: FloatingButtonContainer | null = null;
	/** Status-bar entry for floating chat (Session Manager hover popover) */
	private floatingChatStatusBar: FloatingChatStatusBar | null = null;
	/** Voice Input module (Gemini Live). */
	voiceInput: VoiceInputModule | null = null;

	async onload() {
		await this.loadSettings();

		initializeLogger(this.settings);

		// Initialize settings store
		this.settingsService = createSettingsService(this.settings, this);

		// Detach stale leaves from a previous plugin instance to prevent
		// "Attempting to register an existing view type" when Obsidian's
		// hot-reload races onunload/onload (e.g. rapid toggle or npm run dev).
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_CHAT);

		this.registerView(VIEW_TYPE_CHAT, (leaf) => new ChatView(leaf, this));

		this.app.workspace.detachLeavesOfType(VIEW_TYPE_SESSION_MANAGER);
		this.registerView(
			VIEW_TYPE_SESSION_MANAGER,
			(leaf) => new SessionManagerView(leaf, this),
		);

		const ribbonIconEl = this.addRibbonIcon(
			"bot-message-square",
			"Open agent client",
			(_evt: MouseEvent) => {
				void this.activateView();
			},
		);
		ribbonIconEl.addClass("agent-client-ribbon-icon");

		this.addCommand({
			id: "open-chat-view",
			name: "Open chat view",
			callback: () => {
				void this.activateView();
			},
		});

		this.addCommand({
			id: "focus-next-chat-view",
			name: "Focus next chat view",
			callback: () => {
				this.chatLeaf.focusChatView("next");
			},
		});

		this.addCommand({
			id: "focus-previous-chat-view",
			name: "Focus previous chat view",
			callback: () => {
				this.chatLeaf.focusChatView("previous");
			},
		});

		this.addCommand({
			id: "open-new-chat-view",
			name: "Open new chat view",
			callback: () => {
				void this.openNewChatViewWithAgent(
					this.settings.defaultAgentId,
				);
			},
		});

		this.addCommand({
			id: "open-session-manager",
			name: "Open session manager",
			callback: () => {
				void this.activateSessionManager();
			},
		});

		// Register agent-specific commands
		registerSessionScopedCommands(this);

		// Floating chat window commands
		this.addCommand({
			id: "open-floating-chat-view",
			name: "Toggle floating chat view",
			checkCallback: (checking) => {
				if (!this.isFloatingChatEnabled()) return false;
				if (checking) return true;
				this.toggleFloatingChat();
			},
		});

		this.addCommand({
			id: "open-new-floating-chat-view",
			name: "Open new floating chat view",
			checkCallback: (checking) => {
				if (!this.isFloatingChatEnabled()) return false;
				if (checking) return true;
				this.openNewFloatingChat(true);
			},
		});

		this.addCommand({
			id: "minimize-floating-chat-view",
			name: "Minimize floating chat view",
			checkCallback: (checking) => {
				if (!this.isFloatingChatEnabled()) return false;
				const focused = this.viewRegistry.getFocused();
				if (!(focused && focused.viewType === "floating")) return false;
				if (checking) return true;
				focused.collapse();
			},
		});

		this.addCommand({
			id: "close-floating-chat-view",
			name: "Close floating chat view",
			checkCallback: (checking) => {
				if (!this.isFloatingChatEnabled()) return false;
				const focused = this.viewRegistry.getFocused();
				if (!(focused && focused.viewType === "floating")) return false;
				if (checking) return true;
				this.closeFloatingChat(focused.viewId);
			},
		});

		this.addSettingTab(new AgentClientSettingTab(this.app, this));

		this.registerMarkdownCodeBlockProcessor(
			"agent-client",
			(source, el, ctx) => this.agentBlocks.render(source, el, ctx),
		);
		this.registerMarkdownCodeBlockProcessor("agent", (source, el, ctx) =>
			this.agentBlocks.render(source, el, ctx),
		);

		// Mount floating button (always present; visibility controlled by settings inside component)
		this.floatingButton = new FloatingButtonContainer(this);
		this.floatingButton.mount();

		// Status-bar entry (visibility controlled by floatingChatEntry)
		this.floatingChatStatusBar = new FloatingChatStatusBar(this);
		this.floatingChatStatusBar.mount();

		// Mount initial floating chat instance only if enabled
		if (this.isFloatingChatEnabled()) {
			this.openNewFloatingChat();
		}

		// Clean up all ACP sessions when Obsidian quits
		// Note: We don't wait for disconnect to complete to avoid blocking quit
		this.registerEvent(
			this.app.workspace.on("quit", () => {
				// Persist floating layout before disconnect so a recent
				// drag/resize is not lost if the debounce timer was pending.
				this.flushFloatingWindowLayouts();

				// Fire and forget - don't block Obsidian from quitting
				this.acpClientPool.disconnectAllFireAndForget();
			}),
		);

		// Keep the focused chat view in sync when the active leaf changes
		// (e.g. clicking a chat tab in the tab bar). ChatPanel's DOM
		// focus/click listeners only fire on interaction inside the view, so a
		// tab-bar switch would otherwise leave the Session Manager highlight on
		// the previous view until the user clicks into the new one.
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (leaf?.view instanceof ChatView) {
					this.setLastActiveChatViewId(leaf.view.viewId);
				}
			}),
		);

		// Voice Input module
		if (this.settings.voiceInput.enabled) {
			this.voiceInput = new VoiceInputModule(this, this.settings.voiceInput);
			this.voiceInput.registerCommands();
		}
	}

	onunload() {
		// Flush layout before tearing down React roots
		this.flushFloatingWindowLayouts();

		// Unmount floating button
		this.floatingButton?.unmount();
		this.floatingButton = null;

		// Voice Input cleanup
		this.voiceInput?.dispose();
		this.voiceInput = null;

		this.floatingChatStatusBar?.unmount();
		this.floatingChatStatusBar = null;

		this.floatingChatHost.unmountAll();

		// Unmount all embedded chat instances via registry. Their host
		// MarkdownRenderChild is owned by the workspace (not the plugin), so the
		// React roots are not torn down by plugin unload unless we do it here.
		for (const container of this.viewRegistry.getByType("embedded")) {
			if (container instanceof EmbeddedChatViewContainer) {
				container.unmount();
			}
		}

		// Clear registry (sidebar views are managed by Obsidian workspace)
		this.viewRegistry.clear();

		// Disconnect all ACP clients (kill agent processes)
		void this.acpClientPool.clear();

		this.pendingPrompts.clear();
	}

	/**
	 * Get or create an AcpClient for a specific view.
	 * Each ChatView has its own AcpClient for independent sessions.
	 */
	getOrCreateAcpClient(viewId: string): AcpClient {
		return this.acpClientPool.getOrCreate(viewId);
	}

	/**
	 * Update auto-allow permission setting on all live AcpClient instances.
	 * Called when the setting changes at runtime.
	 */
	updateAllAutoAllow(autoAllow: boolean): void {
		this.acpClientPool.updateAllAutoAllow(autoAllow);
	}

	/**
	 * Remove and disconnect the AcpClient for a specific view.
	 * Called when a ChatView is closed.
	 */
	async removeAcpClient(viewId: string): Promise<void> {
		await this.acpClientPool.remove(viewId);
	}

	/** Cancel a pending graceful teardown for a viewId (called on (re)mount). */
	acquireAcpClient(viewId: string): void {
		this.acpClientPool.acquire(viewId);
	}

	/**
	 * Schedule a graceful teardown of a viewId's AcpClient. A re-acquire within
	 * the grace window cancels it, so a rapid unmount/remount (re-processing)
	 * keeps one client; only genuine removal disconnects the agent process.
	 */
	releaseAcpClient(viewId: string): void {
		this.acpClientPool.release(viewId);
	}

	/**
	 * Get the last active ChatView ID for keybind targeting.
	 */
	get lastActiveChatViewId(): string | null {
		return this.viewRegistry.getFocusedId();
	}

	/**
	 * Set the last active ChatView ID.
	 * Called when a ChatView receives focus or interaction.
	 */
	setLastActiveChatViewId(viewId: string | null): void {
		if (viewId) {
			this.viewRegistry.setFocused(viewId);
		}
	}

	async activateView(): Promise<void> {
		return this.chatLeaf.activateView();
	}

	async activateSessionManager(): Promise<void> {
		return this.chatLeaf.activateSessionManager();
	}

	/**
	 * Close a specific chat view (sidebar or floating).
	 * Dispatch is via IChatViewContainer.closeContainer(); plugin does not
	 * need to know the concrete container class.
	 */
	closeView(viewId: string): void {
		this.chatLeaf.closeView(viewId);
	}

	/**
	 * Open a new chat view with a specific agent.
	 * Always creates a new view (doesn't reuse existing).
	 */
	async openNewChatViewWithAgent(
		agentId: string,
		locationOverride?: "right-pane",
	): Promise<string | null> {
		return this.chatLeaf.openNewChatViewWithAgent(agentId, locationOverride);
	}

	/** Open a new floating chat window (or tab when tabs mode is enabled). */
	openNewFloatingChat(
		initialExpanded = false,
		initialPosition?: { x: number; y: number },
		initialAgentId?: string,
	): IChatViewContainer | null {
		return this.floatingChatHost.openNewFloatingChat(
			initialExpanded,
			initialPosition,
			initialAgentId,
		);
	}

	/** Called by FloatingTabbedShell when its last tab closes. */
	clearFloatingTabbedShell(shell: FloatingTabbedShell): void {
		this.floatingChatHost.clearFloatingTabbedShell(shell);
	}

	/** Flush pending floating-window size/position to settings immediately. */
	flushFloatingWindowLayouts(): void {
		this.floatingChatHost.flushFloatingWindowLayouts();
	}

	findNearestEmbeddedChat(
		sourcePath: string,
		lineStart: number,
	): string | null {
		const embeds = this.viewRegistry
			.getByType("embedded")
			.filter(
				(container): container is EmbeddedChatViewContainer =>
					container instanceof EmbeddedChatViewContainer,
			)
			.map((container) => ({
				viewId: container.viewId,
				sourcePath: container.sourcePath,
				lineStart: container.lineStart,
			}));
		return lookupNearestEmbeddedChat(embeds, sourcePath, lineStart);
	}

	/** Close a specific floating chat window or tab. */
	closeFloatingChat(viewId: string): void {
		this.floatingChatHost.closeFloatingChat(viewId);
	}

	/** Whether floating chat windows/commands are available. */
	isFloatingChatEnabled(): boolean {
		return this.floatingChatHost.isFloatingChatEnabled();
	}

	/** Open/expand a floating chat, or minimize when one-key toggle applies. */
	toggleFloatingChat(): void {
		this.floatingChatHost.toggleFloatingChat();
	}

	/** Get all floating chat instance viewIds. */
	getFloatingChatInstances(): string[] {
		return this.floatingChatHost.getFloatingChatInstances();
	}

	/** Expand a specific floating chat window. */
	expandFloatingChat(viewId: string): void {
		this.floatingChatHost.expandFloatingChat(viewId);
	}

	/**
	 * Open a chat view and inject a prompt into it. Used by quick-action
	 * buttons (embedded code blocks, command palette entries, etc.).
	 *
	 * Delivers the prompt to the target ChatPanel via the pending-prompt
	 * registry (see registerPendingPromptHandler): synchronous if the panel is
	 * already mounted, otherwise queued and drained on its next mount.
	 */
	async runPromptInChat(options: {
		agentId: string;
		prompt: string;
		autoSend: boolean;
		viewType: "right-pane" | "floating" | "editor-tab" | "embedded";
		sourcePath?: string;
		lineStart?: number;
	}): Promise<void> {
		const { agentId, prompt, autoSend, viewType, sourcePath, lineStart } =
			options;
		let targetViewId: string | null = null;

		if (viewType === "embedded") {
			targetViewId =
				sourcePath && typeof lineStart === "number"
					? this.findNearestEmbeddedChat(sourcePath, lineStart)
					: null;
			if (!targetViewId) {
				new Notice(
					"[Agent Client] No embedded chat block found in this note.",
				);
				return;
			}
			this.viewRegistry.get(targetViewId)?.focus();
		} else if (viewType === "floating") {
			const container = this.openNewFloatingChat(
				true,
				undefined,
				agentId,
			);
			targetViewId = container?.viewId ?? null;
		} else if (viewType === "editor-tab") {
			const leaf = this.app.workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_CHAT,
				active: true,
				state: { initialAgentId: agentId },
			});
			await this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as ChatView;
			targetViewId = view?.viewId ?? null;
		} else {
			// viewType === "right-pane": honor it literally, independent of the
			// user's chatViewLocation default (floating/editor-tab handled above).
			targetViewId = await this.openNewChatViewWithAgent(
				agentId,
				"right-pane",
			);
		}

		if (!targetViewId) return;

		// Deterministic handshake: deliver now if the target ChatPanel has
		// registered its handler, otherwise queue until it mounts. Replaces a
		// 100ms setTimeout + workspace broadcast that could drop the prompt if
		// the React root mounted late.
		this.pendingPrompts.deliver(targetViewId, prompt, autoSend);
	}

	/**
	 * Register a ChatPanel's pending-prompt handler (called on mount). If a
	 * prompt was queued before the panel mounted (runPromptInChat ran first),
	 * it is delivered synchronously here. Returns an unregister function.
	 */
	registerPendingPromptHandler(
		viewId: string,
		handler: (prompt: string, autoSend: boolean) => void,
	): () => void {
		return this.pendingPrompts.register(viewId, handler);
	}

	/**
	 * Get all available agents (preset + custom). Delegates to the single
	 * enumeration implementation in session-helpers.
	 */
	getAvailableAgents(): Array<{ id: string; displayName: string }> {
		return getAvailableAgentsFromSettings(this.settings);
	}

	async loadSettings() {
		const raw = ((await this.loadData()) ?? {}) as Record<string, unknown>;
		const D = DEFAULT_SETTINGS;
		let migratedSecrets = false;

		// Docs-advised custom agents (e.g. the OpenCode recipe our docs
		// carried before the preset existed) migrate into their new preset
		// entries. Must run before ensureUniqueCustomAgentIds renames the
		// colliding custom to "{id}-2".
		const absorption = absorbCustomAgents(raw, PRESET_AGENTS);
		raw.customAgents = absorption.customAgents;
		raw.presetAgents = absorption.presetAgents;
		for (const entry of absorption.absorbed) {
			new Notice(
				`[Agent Client] ${entry.displayName} is now a preset agent — your custom agent settings were migrated.`,
			);
		}

		// Extract settings sub-objects
		const re = obj(raw.exportSettings) ?? {};
		const rd = obj(raw.displaySettings) ?? {};

		// Normalize custom agents. Preset ids are reserved: a custom that
		// collides with one has always been dead weight (preset-first
		// resolution), so suffix-renaming it changes no session behavior.
		const customAgents = Array.isArray(raw.customAgents)
			? ensureUniqueCustomAgentIds(
					raw.customAgents.map((a: unknown) =>
						normalizeCustomAgent(obj(a) ?? {}),
					),
					PRESET_AGENTS.map((def) => def.presetId),
				)
			: [];

		// Migration: defaultAgentId ← activeAgentId (old name)
		const availableAgentIds = [
			...PRESET_AGENTS.map((def) => def.presetId),
			...customAgents.map((a) => a.id),
		];
		const defaultAgentId =
			resolveDefaultAgentId(raw, availableAgentIds) ||
			PRESET_AGENTS[0].presetId;

		// Secret-storage side effects (writes + Notices) are injected into the
		// pure normalizer; called only for presets with apiKey.legacy wiring.
		const migrateApiKey: ApiKeyMigrator = ({
			def,
			current,
			legacyPlain,
		}) => {
			const legacy = def.apiKey?.legacy;
			if (!legacy) {
				return current;
			}
			return this.migrateLegacyApiKey(
				legacy.defaultSecretId,
				legacy.fallbackSecretId,
				current,
				legacyPlain,
				legacy.noticeLabel,
				() => {
					migratedSecrets = true;
				},
			);
		};

		this.settings = {
			presetAgents: normalizePresetAgents(
				raw,
				PRESET_AGENTS,
				migrateApiKey,
			),
			customAgents,
			defaultAgentId,
			autoAllowPermissions: bool(
				raw.autoAllowPermissions,
				D.autoAllowPermissions,
			),
			autoMentionActiveNote: bool(
				raw.autoMentionActiveNote,
				D.autoMentionActiveNote,
			),
			expandWikilinkContext: bool(
				raw.expandWikilinkContext,
				D.expandWikilinkContext,
			),
			enableSystemNotifications: bool(
				raw.enableSystemNotifications,
				D.enableSystemNotifications,
			),
			promptInjection: (() => {
				const rp = obj(raw.promptInjection) ?? {};
				return {
					enabled: bool(rp.enabled, D.promptInjection.enabled),
					latex: bool(rp.latex, D.promptInjection.latex),
					wikiLinks: bool(rp.wikiLinks, D.promptInjection.wikiLinks),
					tables: bool(rp.tables, D.promptInjection.tables),
				};
			})(),
			debugMode: bool(raw.debugMode, D.debugMode),
			hideUnusedAgents: bool(raw.hideUnusedAgents, D.hideUnusedAgents),
			nodePath: str(raw.nodePath, D.nodePath),
			exportSettings: {
				defaultFolder: str(
					re.defaultFolder,
					D.exportSettings.defaultFolder,
				),
				filenameTemplate: str(
					re.filenameTemplate,
					D.exportSettings.filenameTemplate,
				),
				autoExportOnNewChat: bool(
					re.autoExportOnNewChat,
					D.exportSettings.autoExportOnNewChat,
				),
				autoExportOnCloseChat: bool(
					re.autoExportOnCloseChat,
					D.exportSettings.autoExportOnCloseChat,
				),
				openFileAfterExport: bool(
					re.openFileAfterExport,
					D.exportSettings.openFileAfterExport,
				),
				includeImages: bool(
					re.includeImages,
					D.exportSettings.includeImages,
				),
				imageLocation: enumVal(
					re.imageLocation,
					["obsidian", "custom", "base64"],
					D.exportSettings.imageLocation,
				),
				imageCustomFolder: str(
					re.imageCustomFolder,
					D.exportSettings.imageCustomFolder,
				),
				frontmatterTag: str(
					re.frontmatterTag,
					D.exportSettings.frontmatterTag,
				),
			},
			windowsWslMode: bool(raw.windowsWslMode, D.windowsWslMode),
			windowsWslDistribution: str(
				raw.windowsWslDistribution,
				D.windowsWslDistribution as string,
			),
			sendMessageShortcut: enumVal(
				raw.sendMessageShortcut,
				["enter", "cmd-enter"],
				D.sendMessageShortcut,
			),
			chatViewLocation: enumVal(
				raw.chatViewLocation,
				["right-tab", "right-split", "editor-tab", "editor-split"],
				D.chatViewLocation,
			),
			displaySettings: {
				autoCollapseDiffs: bool(
					rd.autoCollapseDiffs,
					D.displaySettings.autoCollapseDiffs,
				),
				diffCollapseThreshold: num(
					rd.diffCollapseThreshold,
					D.displaySettings.diffCollapseThreshold,
					1,
				),
				maxNoteLength: num(
					rd.maxNoteLength,
					D.displaySettings.maxNoteLength,
					1,
				),
				maxSelectionLength: num(
					rd.maxSelectionLength,
					D.displaySettings.maxSelectionLength,
					1,
				),
				showEmojis: bool(rd.showEmojis, D.displaySettings.showEmojis),
				fontSize: parseChatFontSize(rd.fontSize),
			},
			savedSessions: Array.isArray(raw.savedSessions)
				? (raw.savedSessions as SavedSessionInfo[])
				: D.savedSessions,
			lastUsedModels: strRecord(raw.lastUsedModels),
			lastUsedModes: strRecord(raw.lastUsedModes),
			lastUsedConfigOptions: nestedStrRecord(raw.lastUsedConfigOptions),
			// Migration: floatingChatEntry ← enableFloatingChat ← showFloatingButton
			floatingChatEntry: resolveFloatingChatEntry(
				raw,
				D.floatingChatEntry,
			),
			enableFloatingChatTabs: bool(
				raw.enableFloatingChatTabs,
				D.enableFloatingChatTabs,
			),
			floatingChatOneKeyToggle: bool(
				raw.floatingChatOneKeyToggle,
				D.floatingChatOneKeyToggle,
			),
			floatingButtonImage: str(
				raw.floatingButtonImage,
				D.floatingButtonImage,
			),
			...migrateFloatingWindowLayoutFields(
				raw,
				D.floatingWindowDefaultSize,
			),
			floatingButtonPosition: xyPoint(raw.floatingButtonPosition),
			floatingIdleTimeoutMs: parseFloatingIdleTimeoutMs(
				raw.floatingIdleTimeoutMs,
				D.floatingIdleTimeoutMs,
			),
			floatingIdleOpacityPercent: resolveFloatingIdleOpacityPercent(
				raw as Record<string, unknown>,
				D.floatingIdleOpacityPercent,
			),
			voiceInput: normalizeVoiceInputSettings(
				obj(raw.voiceInput) as Partial<VoiceInputSettings> | undefined,
			),
		};

		this.ensureAtLeastOneEnabled();
		this.ensureDefaultAgentId();

		if (
			migratedSecrets ||
			absorption.absorbed.length > 0 ||
			needsFloatingChatEntryMigration(raw) ||
			needsFloatingWindowLayoutMigration(raw) ||
			needsFloatingIdleOpacityMigration(raw as Record<string, unknown>)
		) {
			await this.saveSettings();
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async saveSettingsAndNotify(nextSettings: AgentClientPluginSettings) {
		await this.settingsService.updateSettings(nextSettings);
	}

	/**
	 * Migrate legacy plaintext apiKey (v0.10.x) to secretStorage.
	 *
	 * Returns the secretId to use for this agent.
	 *
	 * Behavior:
	 * - If apiKeySecretId is already set, return it as-is. If a legacy
	 *   plaintext apiKey still lingers in data.json (orphaned from prior
	 *   experimental state), trigger onMigrate to schedule a save that
	 *   cleans it up.
	 * - If legacy apiKey is empty, return empty string (no migration needed).
	 * - Otherwise, migrate to secretStorage:
	 *   - Use defaultSecretId (e.g. "claude-api-key") for cross-plugin sharing.
	 *   - On collision (defaultSecretId exists with a different value, e.g.
	 *     from another plugin), fall back to fallbackSecretId
	 *     (e.g. "agent-client-claude-api-key") to preserve the user's key
	 *     and notify them.
	 *
	 * This method is for upgrading from v0.10.x or experimental builds and
	 * can be removed in a future major version once we're confident no
	 * users have legacy plaintext apiKey fields in data.json.
	 */
	private migrateLegacyApiKey(
		defaultSecretId: string,
		fallbackSecretId: string,
		currentSecretId: string,
		legacyApiKey: string,
		agentLabel: string,
		onMigrate: () => void,
	): string {
		const trimmed = legacyApiKey.trim();

		// Already migrated
		if (currentSecretId.length > 0) {
			// Clean up orphaned plaintext apiKey if still in data.json
			if (trimmed.length > 0) {
				onMigrate();
			}
			return currentSecretId;
		}

		if (trimmed.length === 0) {
			return "";
		}

		const existing = this.app.secretStorage.getSecret(defaultSecretId);

		if (existing === null) {
			// No collision — create the secret with the preferred ID
			this.app.secretStorage.setSecret(defaultSecretId, trimmed);
			new Notice(
				`[Agent Client] Your ${agentLabel} API key has been migrated to Obsidian's Keychain as "${defaultSecretId}".`,
			);
			onMigrate();
			return defaultSecretId;
		}

		if (existing === trimmed) {
			// Idempotent re-migration (same value already stored)
			onMigrate();
			return defaultSecretId;
		}

		// Collision: defaultSecretId exists with a different value (likely
		// another plugin). Fall back to a plugin-prefixed ID to preserve
		// the user's key without overwriting other plugins' secrets.
		this.app.secretStorage.setSecret(fallbackSecretId, trimmed);
		new Notice(
			`[Agent Client] "${defaultSecretId}" was already in use. Your ${agentLabel} API key was migrated to "${fallbackSecretId}". You can rename it in Obsidian's Keychain settings.`,
		);
		onMigrate();
		return fallbackSecretId;
	}

	/**
	 * Check for plugin updates.
	 * - Stable version users: compare with latest stable release
	 * - Prerelease users: compare with both latest stable and latest prerelease
	 */
	async checkForUpdates(): Promise<boolean> {
		return checkPluginForUpdates(this.manifest.version);
	}

	ensureDefaultAgentId(): void {
		const availableIds = this.collectAvailableAgentIds();
		if (!availableIds.includes(this.settings.defaultAgentId)) {
			this.settings.defaultAgentId = firstEnabledAgentId(this.settings);
		}
	}

	/**
	 * Repair the "everything disabled" state by re-enabling the first preset.
	 * The settings UI refuses to disable the last enabled agent, so this is a
	 * backstop for load-time data and indirect paths (custom deletion).
	 */
	ensureAtLeastOneEnabled(): void {
		const repaired = repairNoEnabledAgents(this.settings);
		if (repaired) {
			this.settings.presetAgents = repaired;
		}
	}

	private collectAvailableAgentIds(): string[] {
		const ids = new Set<string>();
		for (const agent of this.getAvailableAgents()) {
			if (agent.id && agent.id.length > 0) {
				ids.add(agent.id);
			}
		}
		return Array.from(ids);
	}
}
