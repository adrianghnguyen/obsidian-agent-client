import type { PresetAgentDefinition } from "../shared/preset-types";

/** Stable id for the Cursor preset — used by connection-error copy and health-check. */
export const CURSOR_PRESET_ID = "cursor";

export const cursorPreset: PresetAgentDefinition = {
	presetId: CURSOR_PRESET_ID,
	defaultDisplayName: "Cursor",
	defaultCommand: "agent",
	defaultArgs: ["acp"],
	absorbsCustomAgentId: "cursor",
	installHint: {
		default: "curl https://cursor.com/install -fsS | bash",
		nativeWindows: "irm 'https://cursor.com/install?win32=true' | iex",
	},
	settingsCopy: {
		pathDesc:
			'Command name or path to the Cursor CLI (`agent`). Use just "agent" to let the login shell resolve it, or enter an absolute path (commonly ~/.local/bin/agent on macOS/Linux).',
		argsDescSuffix:
			" (Cursor speaks ACP through the hidden `acp` subcommand — keep `acp` here.)",
	},
	docsPage: "cursor",
};
