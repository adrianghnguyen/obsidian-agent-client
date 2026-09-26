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
	apiKey: {
		envVarName: "CURSOR_API_KEY",
		settingName: "API key (Secrets manager)",
		settingDesc:
			"1) Create a key at cursor.com/dashboard → Integrations. 2) Click Link… and save the value in Obsidian's Secrets manager (not in synced data.json). Agent Client injects it as CURSOR_API_KEY when spawning `agent acp`. On Windows this is the reliable fix when Terminal `agent login` works but chat still opens a browser login every session.",
		legacy: {
			defaultSecretId: "cursor-api-key",
			fallbackSecretId: "agent-client-cursor-api-key",
			noticeLabel: "Cursor",
		},
	},
	settingsCopy: {
		pathDesc:
			"Cursor CLI on this computer (not synced). Leave as agent to use your login-shell PATH. Auto-detect saves an absolute path here only — other devices keep their own.",
		argsDescSuffix:
			" (Cursor speaks ACP through the hidden `acp` subcommand — keep `acp` here.)",
		envDescExtra:
			"Do not paste CURSOR_API_KEY here unless you intentionally want a plain env override; use API key (Secrets manager) above.",
	},
	installHint: {
		default: "curl https://cursor.com/install -fsS | bash",
		nativeWindows: "irm 'https://cursor.com/install?win32=true' | iex",
	},
	docsPage: "cursor",
};
