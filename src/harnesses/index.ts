import { claudeCodeHarness } from "./claude-code";
import { codexHarness } from "./codex";
import { geminiCliHarness } from "./gemini-cli";
import { hermesAgentHarness } from "./hermes-agent";
import { kiroCliHarness } from "./kiro-cli";
import { mistralVibeHarness } from "./mistral-vibe";
import { opencodeHarness } from "./opencode";
import type { PresetAgentDefinition } from "./shared/preset-types";
import type { HarnessDefinition } from "./shared/types";

/** All first-class harness modules, registration order = preset list order. */
export const HARNESS_DEFINITIONS: readonly HarnessDefinition[] = [
	claudeCodeHarness,
	codexHarness,
	geminiCliHarness,
	mistralVibeHarness,
	opencodeHarness,
	kiroCliHarness,
	hermesAgentHarness,
];

/** Preset rows derived from harness modules (legacy PRESET_AGENTS consumers). */
export const PRESET_AGENTS: readonly PresetAgentDefinition[] =
	HARNESS_DEFINITIONS.map((h) => h.preset);

/**
 * The Gemini preset id, referenced by the time-boxed Gemini CLI deprecation
 * notice (Google retires account login on June 18, 2026). Deliberately a
 * standalone constant instead of a registry field: the notice is temporary
 * and should be deleted together with this constant's references, without
 * leaving a dead field in the permanent registry schema.
 */
export const GEMINI_PRESET_ID = "gemini-cli";

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

export type { HarnessDefinition } from "./shared/types";
export type {
	PresetAgentDefinition,
	PresetAgentApiKey,
	PresetAgentApiKeyLegacy,
	PresetAgentInstallHint,
	PresetAgentSettingsCopy,
} from "./shared/preset-types";
