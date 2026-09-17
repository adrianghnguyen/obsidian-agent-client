import type { PresetAgentDefinition } from "../shared/preset-types";

export const claudeCodePreset: PresetAgentDefinition = {
	presetId: "claude-code-acp",
	defaultDisplayName: "Claude Code",
	defaultCommand: "claude-agent-acp",
	defaultArgs: [],
	legacySettingsKey: "claude",
	legacyCommandPathKey: "claudeCodeAcpCommandPath",
	apiKey: {
		envVarName: "ANTHROPIC_API_KEY",
		settingDesc:
			"Anthropic API key. Required if not logging in with an Anthropic account. Select from Obsidian's Keychain or create a new secret.",
		legacy: {
			defaultSecretId: "claude-api-key",
			fallbackSecretId: "agent-client-claude-api-key",
			noticeLabel: "Claude",
		},
	},
	installHint: {
		default: "npm install -g @agentclientprotocol/claude-agent-acp@latest",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to claude-agent-acp. Use just "claude-agent-acp" to let the login shell resolve it, or enter an absolute path.',
	},
	docsPage: "claude-code",
};
