import type { PresetAgentDefinition } from "../shared/preset-types";

/** Stable id for the Cursor preset — used by connection-error copy and health-check. */
export const CURSOR_PRESET_ID = "cursor";

/** ACP authenticate method id advertised by `agent acp` (cursor_login). */
export const CURSOR_SESSION_AUTH_METHOD = "cursor_login";

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
			"Cursor CLI on this computer (not synced). Leave as agent to use your login-shell PATH. Auto-detect saves an absolute path here only — other devices keep their own.",
		argsDescSuffix:
			" (Cursor speaks ACP through the hidden `acp` subcommand — keep `acp` here.)",
	},
	docsPage: "cursor",
};
