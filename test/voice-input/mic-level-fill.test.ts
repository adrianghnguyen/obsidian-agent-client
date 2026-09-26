import { describe, expect, it } from "vitest";
import { micWavePath } from "../../src/voice-input/mic-level-fill";

describe("micWavePath", () => {
	it("draws a flat line through the mic head when silent", () => {
		expect(micWavePath(0, 0)).toBe(
			"M9.35 7 L10.68 7 L12 7 L13.33 7 L14.65 7",
		);
	});

	it("peaks inside the mic head at full level", () => {
		const path = micWavePath(1, Math.PI / 2);
		expect(path.startsWith("M9.35 2.8")).toBe(true);
		expect(path).toContain("L12 11.2");
		expect(path.endsWith("L14.65 2.8")).toBe(true);
	});

	it("treats out-of-range and non-finite levels as silence", () => {
		const silent = micWavePath(0, 0);
		expect(micWavePath(-1, 0)).toBe(silent);
		expect(micWavePath(Number.NaN, 0)).toBe(silent);
		expect(micWavePath(4, 0)).toBe(micWavePath(1, 0));
	});
});
