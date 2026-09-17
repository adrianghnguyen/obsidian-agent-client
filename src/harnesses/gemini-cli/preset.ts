import type { PresetAgentDefinition } from "../shared/preset-types";

export const geminiCliPreset: PresetAgentDefinition = {
	presetId: "gemini-cli",
	defaultDisplayName: "Gemini CLI",
	defaultCommand: "gemini",
	defaultArgs: ["--experimental-acp"],
	legacySettingsKey: "gemini",
	legacyCommandPathKey: "geminiCommandPath",
	apiKey: {
		envVarName: "GEMINI_API_KEY",
		settingDesc:
			"Gemini API key. Required if not logging in with a Google account. Select from Obsidian's Keychain or create a new secret.",
		legacy: {
			defaultSecretId: "gemini-api-key",
			fallbackSecretId: "agent-client-gemini-api-key",
			noticeLabel: "Gemini",
		},
	},
	installHint: {
		default: "npm install -g @google/gemini-cli@latest",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to the Gemini CLI. Use just "gemini" to let the login shell resolve it, or enter an absolute path for a specific version.',
		argsDescSuffix:
			'(Currently, the Gemini CLI requires the "--experimental-acp" option.)',
		envDescExtra: "Required to authenticate with Vertex AI.",
		envPlaceholder: "GOOGLE_CLOUD_PROJECT=...",
	},
	docsPage: "gemini-cli",
};
