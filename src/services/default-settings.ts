/**
 * Default plugin settings. Lives in services/ because it depends on
 * PRESET_AGENTS and voice defaults (types/ stays zero-runtime-deps).
 */

import type { AgentClientPluginSettings } from "../types/settings";
import { PRESET_AGENTS } from "./preset-agents";
import { defaultPresetAgentSettings } from "./settings-normalizer";
import { DEFAULT_VOICE_INPUT } from "../voice-input/VoiceInputSettings";

export const DEFAULT_SETTINGS: AgentClientPluginSettings = {
	presetAgents: Object.fromEntries(
		PRESET_AGENTS.map((def) => [
			def.presetId,
			defaultPresetAgentSettings(def),
		]),
	),
	customAgents: [],
	defaultAgentId: PRESET_AGENTS[0].presetId,
	autoAllowPermissions: false,
	autoMentionActiveNote: true,
	expandWikilinkContext: true,
	enableSystemNotifications: true,
	promptInjection: {
		enabled: true,
		latex: true,
		wikiLinks: true,
		tables: true,
	},
	debugMode: false,
	hideUnusedAgents: false,
	nodePath: "",
	exportSettings: {
		defaultFolder: "Agent Client",
		filenameTemplate: "agent_client_{date}_{time}",
		autoExportOnNewChat: false,
		autoExportOnCloseChat: false,
		openFileAfterExport: true,
		includeImages: true,
		imageLocation: "obsidian",
		imageCustomFolder: "Agent Client",
		frontmatterTag: "agent-client",
	},
	windowsWslMode: false,
	windowsWslDistribution: undefined,
	sendMessageShortcut: "enter",
	chatViewLocation: "right-tab",
	displaySettings: {
		autoCollapseDiffs: false,
		diffCollapseThreshold: 10,
		maxNoteLength: 10000,
		maxSelectionLength: 10000,
		showEmojis: true,
		fontSize: null,
	},
	savedSessions: [],
	lastUsedModels: {},
	lastUsedModes: {},
	lastUsedConfigOptions: {},
	floatingChatEntry: "off",
	enableFloatingChatTabs: false,
	floatingChatOneKeyToggle: true,
	floatingButtonImage: "",
	floatingWindowDefaultSize: { width: 400, height: 500 },
	floatingWindowDefaultPosition: null,
	floatingWindowLastSize: null,
	floatingWindowLastPosition: null,
	floatingButtonPosition: null,
	floatingIdleTimeoutMs: 0,
	floatingIdleOpacityPercent: 50,
	voiceInput: { ...DEFAULT_VOICE_INPUT },
};
