import type { PresetAgentDefinition } from "../shared/preset-types";
import { ANTIGRAVITY_BRIDGE_PAR } from "./paths";

export const antigravityPreset: PresetAgentDefinition = {
	presetId: "antigravity",
	defaultDisplayName: "Antigravity",
	defaultCommand: ANTIGRAVITY_BRIDGE_PAR,
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
			"Path to the Antigravity ACP bridge on this computer (not synced). Leave as agy_acp_server.par to auto-detect when you connect. Auto-detect saves this device only.",
	},
	docsPage: "antigravity",
};
