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
		nativeWindows:
			"Install from the ACP Registry or place agy_acp_server.exe in %LOCALAPPDATA%\\agy-acp-server\\",
	},
	settingsCopy: {
		pathDesc:
			"Absolute path to the Antigravity ACP bridge (agy_acp_server.par on macOS/Linux, agy_acp_server.exe on Windows). The agy CLI has no acp subcommand — Agent Client spawns this binary directly. Use Auto-detect or the health check below.",
	},
	docsPage: "antigravity",
};
