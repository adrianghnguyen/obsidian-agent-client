/**
 * Plugin settings shape and related UI enums.
 *
 * Zero runtime deps — types only. Defaults live in services/default-settings.ts.
 */

import type {
	CustomAgentSettings,
	PresetAgentUserSettings,
} from "./agent";
import type { SavedSessionInfo } from "./session";
import type { VoiceInputSettings } from "../voice-input/VoiceInputSettings";

/**
 * Send message shortcut configuration.
 * - 'enter': Enter to send, Shift+Enter for newline (default)
 * - 'cmd-enter': Cmd/Ctrl+Enter to send, Enter for newline
 */
export type SendMessageShortcut = "enter" | "cmd-enter";

/**
 * Chat view location configuration.
 * - 'right-tab': Open in right pane as tabs (default)
 * - 'right-split': Open in right pane with vertical split
 * - 'editor-tab': Open in editor area as tabs
 * - 'editor-split': Open in editor area with right split
 */
export type ChatViewLocation =
	| "right-tab"
	| "right-split"
	| "editor-tab"
	| "editor-split";

/** How the floating chat UI is entered (FAB, status bar, commands, or off). */
export type FloatingChatEntry = "off" | "button" | "status-bar" | "commands";

export interface AgentClientPluginSettings {
	/**
	 * Per-preset user overrides, keyed by presetId (see
	 * services/preset-agents.ts for the static registry). Normalization
	 * guarantees an entry for every registry preset; unknown keys written by
	 * a newer plugin version are preserved but never enumerated.
	 */
	presetAgents: Record<string, PresetAgentUserSettings>;
	customAgents: CustomAgentSettings[];
	/** Default agent ID for new views (renamed from activeAgentId for multi-session) */
	defaultAgentId: string;
	autoAllowPermissions: boolean;
	autoMentionActiveNote: boolean;
	/** Surface `[[wikilinks]]` inside note content as resolved metadata so the agent can decide which links to follow */
	expandWikilinkContext: boolean;
	/** Show OS system notifications on response completion and permission requests */
	enableSystemNotifications: boolean;
	/** Prompt injection settings for Obsidian-flavored Markdown guidance */
	promptInjection: {
		/** Master toggle for prompt injection */
		enabled: boolean;
		/** Inject LaTeX math formatting instructions ($...$ and $$...$$) */
		latex: boolean;
		/** Instruct agents to use [[Note Name]] wikilink syntax */
		wikiLinks: boolean;
		/** Instruct agents to leave a blank line before Markdown tables */
		tables: boolean;
	};
	debugMode: boolean;
	/** Hide disabled agents in Settings → Agents (turn off to re-enable them). */
	hideUnusedAgents: boolean;
	nodePath: string;
	exportSettings: {
		defaultFolder: string;
		filenameTemplate: string;
		autoExportOnNewChat: boolean;
		autoExportOnCloseChat: boolean;
		openFileAfterExport: boolean;
		includeImages: boolean;
		imageLocation: "obsidian" | "custom" | "base64";
		imageCustomFolder: string;
		frontmatterTag: string;
	};
	// WSL settings (Windows only)
	windowsWslMode: boolean;
	windowsWslDistribution?: string;
	// Input behavior
	sendMessageShortcut: SendMessageShortcut;
	// View settings
	chatViewLocation: ChatViewLocation;
	// Display settings
	displaySettings: {
		autoCollapseDiffs: boolean;
		diffCollapseThreshold: number;
		maxNoteLength: number;
		maxSelectionLength: number;
		showEmojis: boolean;
		fontSize: number | null;
	};
	// Locally saved session metadata (for agents without session/list support)
	savedSessions: SavedSessionInfo[];
	// Last used model per agent (agentId → modelId)
	lastUsedModels: Record<string, string>;
	// Last used mode per agent (agentId → modeId)
	lastUsedModes: Record<string, string>;
	// Last used non-model/mode config options per agent (agentId → {optionId → value})
	lastUsedConfigOptions: Record<string, Record<string, string>>;
	// Floating chat settings
	/**
	 * How floating chat is entered from the UI:
	 * - off: floating chat disabled
	 * - button: floating action button (FAB)
	 * - status-bar: status bar icon + Session Manager hover popover
	 * - commands: commands only (no FAB / status bar)
	 */
	floatingChatEntry: FloatingChatEntry;
	/** When true, new floating chats open as tabs in one window instead of separate windows. */
	enableFloatingChatTabs: boolean;
	/** When true, Toggle floating chat opens or minimizes with one hotkey. */
	floatingChatOneKeyToggle: boolean;
	floatingButtonImage: string;
	/** User-configurable default size when no last layout is saved. */
	floatingWindowDefaultSize: { width: number; height: number };
	/** User default position; null = automatic bottom-right. */
	floatingWindowDefaultPosition: { x: number; y: number } | null;
	/** Last size from resize; preferred over default on open. */
	floatingWindowLastSize: { width: number; height: number } | null;
	/** Last position from drag; preferred over default on open. */
	floatingWindowLastPosition: { x: number; y: number } | null;
	floatingButtonPosition: { x: number; y: number } | null;
	/**
	 * Fade the floating window this many ms after the input loses focus
	 * (or the user clicks elsewhere in the window). 0 disables idle transparency.
	 */
	floatingIdleTimeoutMs: number;
	/**
	 * How visible the floating window stays when faded (10–100%).
	 * Lower values are more transparent. Only applies when floatingIdleTimeoutMs > 0.
	 */
	floatingIdleOpacityPercent: number;
	/** Voice Input (Gemini Live) settings */
	voiceInput: VoiceInputSettings;
}
