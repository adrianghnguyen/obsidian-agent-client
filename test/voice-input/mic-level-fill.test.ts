import { describe, expect, it } from "vitest";
import { micWavePath } from "../../src/voice-input/mic-level-fill";

describe("micWavePath", () => {
	it("draws a flat line across the icon when silent", () => {
		expect(micWavePath(0, 0)).toBe(
			"M2 12 L5.33 12 L8.67 12 L12 12 L15.33 12 L18.67 12 L22 12",
		);
	});

	it("spans the icon at full level", () => {
		const path = micWavePath(1, Math.PI / 2);
		expect(path.startsWith("M2 5")).toBe(true);
		expect(path).toContain("L12 19");
		expect(path.endsWith("L22 5")).toBe(true);
	});

	it("treats out-of-range and non-finite levels as silence", () => {
		const silent = micWavePath(0, 0);
		expect(micWavePath(-1, 0)).toBe(silent);
		expect(micWavePath(Number.NaN, 0)).toBe(silent);
		expect(micWavePath(4, 0)).toBe(micWavePath(1, 0));
	});
});
