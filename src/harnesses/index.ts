import type { ProcessError } from "../types/errors";
import { antigravityHarness } from "./antigravity";
import { claudeCodeHarness } from "./claude-code";
import { codexHarness } from "./codex";
import { cursorHarness } from "./cursor";
import { buildSessionOpenPlan } from "./shared/build-session-open-plan";
import type { PresetAgentDefinition } from "./shared/preset-types";
import {
	runSessionOpen,
	type HarnessSessionClient,
} from "./shared/open-harness-session";
import type {
	ConnectionErrorContext,
	HarnessDefinition,
	HarnessSessionOpenContext,
} from "./shared/types";

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

export type { HarnessSessionClient };

/**
 * Open a session after initialize using the harness sessionAuthPolicy
 * (authenticate only when credentials are not already ready).
 */
export async function openHarnessSession<T>(
	agentId: string,
	workingDirectory: string,
	client: HarnessSessionClient<T>,
	ctx?: HarnessSessionOpenContext,
): Promise<T> {
	const harness = getHarnessById(agentId);
	if (!harness) {
		throw new Error(`Unknown harness "${agentId}"`);
	}
	const plan = await buildSessionOpenPlan(harness, ctx);
	return runSessionOpen(plan, workingDirectory, client);
}

export { buildSessionOpenPlan } from "./shared/build-session-open-plan";
export type { SessionOpenPlan } from "./shared/build-session-open-plan";
export { runSessionOpen } from "./shared/open-harness-session";
export {
	assertValidSessionAuthPolicy,
	SESSION_AUTH_NONE,
	withCredentialsReadyOverride,
} from "./shared/session-auth-policy";

export type {
	HarnessDefinition,
	HarnessSessionAuthPolicy,
	HarnessSessionOpenContext,
} from "./shared/types";
export type {
	PresetAgentDefinition,
	PresetAgentApiKey,
	PresetAgentApiKeyLegacy,
	PresetAgentInstallHint,
	PresetAgentSettingsCopy,
} from "./shared/preset-types";
