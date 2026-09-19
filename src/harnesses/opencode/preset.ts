import type { PresetAgentDefinition } from "../shared/preset-types";

export const opencodePreset: PresetAgentDefinition = {
	presetId: "opencode",
	defaultDisplayName: "OpenCode",
	defaultCommand: "opencode",
	defaultArgs: ["acp"],
	absorbsCustomAgentId: "opencode",
	installHint: {
		default: "curl -fsSL https://opencode.ai/install | bash",
		nativeWindows: "npm install -g opencode-ai",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to opencode. Use just "opencode" to let the login shell resolve it, or enter an absolute path.',
	},
	docsPage: "opencode",
};
