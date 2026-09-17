import type { PresetAgentDefinition } from "../shared/preset-types";

export const codexPreset: PresetAgentDefinition = {
	presetId: "codex-acp",
	defaultDisplayName: "Codex",
	defaultCommand: "codex-acp",
	defaultArgs: [],
	legacySettingsKey: "codex",
	apiKey: {
		envVarName: "OPENAI_API_KEY",
		settingDesc:
			"OpenAI API key. Required if not logging in with an OpenAI account. Select from Obsidian's Keychain or create a new secret.",
		legacy: {
			defaultSecretId: "openai-api-key",
			fallbackSecretId: "agent-client-openai-api-key",
			noticeLabel: "Codex",
		},
	},
	installHint: {
		default: "npm install -g @agentclientprotocol/codex-acp@latest",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to codex-acp. Use just "codex-acp" to let the login shell resolve it, or enter an absolute path.',
	},
	docsPage: "codex",
};
