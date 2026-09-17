import { describe, it, expect } from "vitest";
import {
	HARNESS_DEFINITIONS,
	PRESET_AGENTS,
	GEMINI_PRESET_ID,
	getHarnessById,
	listHarnessIds,
} from "../../src/harnesses";

const EXPECTED_PRESET_IDS = [
	"claude-code-acp",
	"codex-acp",
	"gemini-cli",
	"mistral-vibe",
	"opencode",
	"kiro-cli",
	"hermes-agent",
] as const;

describe("harness registry", () => {
	it("registers every in-tree preset harness", () => {
		expect(HARNESS_DEFINITIONS).toHaveLength(EXPECTED_PRESET_IDS.length);
		expect(listHarnessIds()).toEqual([...EXPECTED_PRESET_IDS]);
	});

	it("derives PRESET_AGENTS from harness presets without reordering", () => {
		expect(PRESET_AGENTS.map((def) => def.presetId)).toEqual([
			...EXPECTED_PRESET_IDS,
		]);
		expect(PRESET_AGENTS).toEqual(
			HARNESS_DEFINITIONS.map((h) => h.preset),
		);
	});

	it("looks up harnesses by preset id", () => {
		for (const id of EXPECTED_PRESET_IDS) {
			expect(getHarnessById(id)?.preset.presetId).toBe(id);
		}
		expect(getHarnessById("unknown-harness")).toBeUndefined();
	});

	it("keeps GEMINI_PRESET_ID on the gemini-cli harness", () => {
		expect(GEMINI_PRESET_ID).toBe("gemini-cli");
		expect(getHarnessById(GEMINI_PRESET_ID)?.preset.defaultCommand).toBe(
			"gemini",
		);
	});

	it("leaves optional harness slots empty for migrated presets", () => {
		for (const harness of HARNESS_DEFINITIONS) {
			expect(harness.vendorAcp).toBeUndefined();
			expect(harness.traceAdapters).toBeUndefined();
			expect(harness.healthCheck).toBeUndefined();
			expect(harness.mapConnectionError).toBeUndefined();
			expect(harness.updateRules).toBeUndefined();
			expect(harness.notices).toBeUndefined();
		}
	});
});
