import type { PresetAgentDefinition } from "../shared/preset-types";

export const kiroCliPreset: PresetAgentDefinition = {
	presetId: "kiro-cli",
	defaultDisplayName: "Kiro",
	defaultCommand: "kiro-cli",
	defaultArgs: ["acp"],
	absorbsCustomAgentId: "kiro-cli",
	apiKey: {
		envVarName: "KIRO_API_KEY",
		settingDesc:
			"Kiro API key (Kiro Pro and higher tiers). Required only for API-key auth — leave empty when signing in with kiro-cli login. Select from Obsidian's Keychain or create a new secret.",
	},
	installHint: {
		default: "curl -fsSL https://cli.kiro.dev/install | bash",
		nativeWindows: "irm 'https://cli.kiro.dev/install.ps1' | iex",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to kiro-cli. Use just "kiro-cli" to let the login shell resolve it, or enter an absolute path.',
	},
	docsPage: "kiro",
};
