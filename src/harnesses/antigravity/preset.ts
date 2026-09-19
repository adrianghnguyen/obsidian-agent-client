import type { PresetAgentDefinition } from "../shared/preset-types";
import { getDefaultAntigravityBridgePath } from "./paths";

export const antigravityPreset: PresetAgentDefinition = {
	presetId: "antigravity",
	defaultDisplayName: "Antigravity",
	defaultCommand: getDefaultAntigravityBridgePath(),
	defaultArgs: [],
	absorbsCustomAgentId: "antigravity",
	installHint: {
		default:
			"Install from the ACP Registry (e.g. Zed → Agents → Antigravity) or place agy_acp_server.par in ~/Library/agy-acp-server/ on macOS",
	},
	settingsCopy: {
		pathDesc:
			"Absolute path to agy_acp_server.par (Antigravity ACP bridge). The agy CLI has no acp subcommand — Agent Client spawns this binary directly. Use Auto-detect or the health check below.",
	},
	docsPage: "antigravity",
};
