import type { PresetAgentDefinition } from "../shared/preset-types";

export const hermesAgentPreset: PresetAgentDefinition = {
	presetId: "hermes-agent",
	defaultDisplayName: "Hermes Agent",
	defaultCommand: "hermes",
	defaultArgs: ["acp"],
	installHint: {
		default:
			"curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
		nativeWindows:
			"iex (irm https://hermes-agent.nousresearch.com/install.ps1)",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to hermes. Use just "hermes" to let the login shell resolve it, or enter an absolute path.',
	},
	docsPage: "hermes",
};
