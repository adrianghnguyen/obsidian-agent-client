import { assertValidSessionAuthPolicy } from "./session-auth-policy";
import type { HarnessDefinition } from "./types";
import type { PresetAgentDefinition } from "./preset-types";

/** Build a harness from a preset row; optional slots are added at call sites later. */
export function defineHarness(
	preset: PresetAgentDefinition,
	slots: Omit<HarnessDefinition, "preset">,
): HarnessDefinition {
	const harness: HarnessDefinition = { preset, ...slots };
	assertValidSessionAuthPolicy(harness);
	return harness;
}
