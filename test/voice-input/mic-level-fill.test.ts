import { describe, expect, it } from "vitest";
import { micLevelBars } from "../../src/voice-input/mic-level-fill";

describe("micLevelBars", () => {
	it("draws short bars when silent", () => {
		const bars = micLevelBars(0);
		expect(bars).toHaveLength(5);
		for (const bar of bars) {
			expect(bar.height).toBeCloseTo(14 * 0.12, 2);
			expect(bar.y + bar.height).toBeCloseTo(20, 2);
		}
	});

	it("scales center bars higher than edges at full level", () => {
		const bars = micLevelBars(1);
		expect(bars[2].height).toBeGreaterThan(bars[0].height);
		expect(bars[2].height).toBeGreaterThan(bars[4].height);
		expect(bars[0].height).toBeCloseTo(bars[4].height, 2);
	});

	it("treats out-of-range and non-finite levels as silence", () => {
		const silent = micLevelBars(0);
		expect(micLevelBars(-1)).toEqual(silent);
		expect(micLevelBars(Number.NaN)).toEqual(silent);
		expect(micLevelBars(4)[2].height).toBeCloseTo(micLevelBars(1)[2].height, 2);
	});
});
