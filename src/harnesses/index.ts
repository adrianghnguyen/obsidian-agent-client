import type { ProcessError } from "../types/errors";
import { antigravityHarness } from "./antigravity";
import { claudeCodeHarness } from "./claude-code";
import { codexHarness } from "./codex";
import { cursorHarness } from "./cursor";
import type { PresetAgentDefinition } from "./shared/preset-types";
import type { ConnectionErrorContext, HarnessDefinition } from "./shared/types";

/** All first-class harness modules, registration order = preset list order. */
export const HARNESS_DEFINITIONS: readonly HarnessDefinition[] = [
	claudeCodeHarness,
	codexHarness,
	cursorHarness,
	antigravityHarness,
];

/** Preset rows derived from harness modules (legacy PRESET_AGENTS consumers). */
export const PRESET_AGENTS: readonly PresetAgentDefinition[] =
	HARNESS_DEFINITIONS.map((h) => h.preset);

const harnessById = new Map<string, HarnessDefinition>(
	HARNESS_DEFINITIONS.map((h) => [h.preset.presetId, h]),
);

export function getHarnessById(
	presetId: string,
): HarnessDefinition | undefined {
	return harnessById.get(presetId);
}

export function listHarnessIds(): readonly string[] {
	return HARNESS_DEFINITIONS.map((h) => h.preset.presetId);
}

/** Apply a harness `mapConnectionError` slot onto a process error, if any. */
export function applyHarnessConnectionError(
	error: ProcessError,
	ctx?: ConnectionErrorContext,
): ProcessError {
	const card = getHarnessById(error.agentId)?.mapConnectionError?.(
		error,
		ctx,
	);
	if (!card) {
		return error;
	}
	return {
		...error,
		title: card.title,
		message: card.body,
		suggestion: card.suggestion ?? error.suggestion,
		link: card.link ?? error.link,
	};
}

/** Raw harness authenticate slot (string, resolver, or missing). */
export function getAuthenticateBeforeNewSession(
	agentId: string,
): HarnessDefinition["authenticateBeforeNewSession"] {
	return getHarnessById(agentId)?.authenticateBeforeNewSession;
}

/** ACP authenticate method to run after initialize, or undefined (no-op). */
export async function resolveAuthenticateBeforeNewSession(
	agentId: string,
): Promise<string | undefined> {
	const slot = getAuthenticateBeforeNewSession(agentId);
	if (typeof slot === "function") {
		return slot();
	}
	return slot;
}

export interface HarnessSessionClient<T> {
	authenticate(methodId: string): Promise<boolean>;
	newSession(workingDirectory: string): Promise<T>;
}

/**
 * Open a session after initialize: authenticate when the harness slot
 * resolves to a method id, then session/new. Antigravity skips authenticate
 * when ACP OAuth is already on disk. Cursor calls `cursor_login` before
 * session/new so CLI credentials are bound inside the ACP process.
 */
export async function openHarnessSession<T>(
	agentId: string,
	workingDirectory: string,
	client: HarnessSessionClient<T>,
): Promise<T> {
	const methodId = await resolveAuthenticateBeforeNewSession(agentId);
	if (methodId) {
		const ok = await client.authenticate(methodId);
		if (!ok) {
			throw new Error("Authentication required");
		}
	}
	return client.newSession(workingDirectory);
}

export type { HarnessDefinition } from "./shared/types";
export type {
	PresetAgentDefinition,
	PresetAgentApiKey,
	PresetAgentApiKeyLegacy,
	PresetAgentInstallHint,
	PresetAgentSettingsCopy,
} from "./shared/preset-types";
