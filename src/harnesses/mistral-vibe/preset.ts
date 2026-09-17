import type { PresetAgentDefinition } from "../shared/preset-types";

export const mistralVibePreset: PresetAgentDefinition = {
	presetId: "mistral-vibe",
	defaultDisplayName: "Mistral Vibe",
	defaultCommand: "vibe-acp",
	defaultArgs: [],
	legacySettingsKey: "mistralVibe",
	apiKey: {
		envVarName: "MISTRAL_API_KEY",
		settingDesc:
			"Mistral API key. Required if not logging in with a Mistral account. Select from Obsidian's Keychain or create a new secret.",
		legacy: {
			defaultSecretId: "mistral-api-key",
			fallbackSecretId: "agent-client-mistral-api-key",
			noticeLabel: "Mistral Vibe",
		},
	},
	installHint: {
		default: "curl -LsSf https://mistral.ai/vibe/install.sh | bash",
		nativeWindows:
			'powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"; uv tool install mistral-vibe',
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to vibe-acp. Use just "vibe-acp" to let the login shell resolve it, or enter an absolute path.',
	},
	docsPage: "mistral-vibe",
};
