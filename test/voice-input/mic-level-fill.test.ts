import { describe, expect, it } from "vitest";
import {
	MIC_HEAD_HEIGHT,
	MIC_HEAD_TOP,
	micHeadFill,
} from "../../src/voice-input/mic-level-fill";

describe("micHeadFill", () => {
	it("fills the mic head from the bottom", () => {
		expect(micHeadFill(0)).toEqual({
			y: MIC_HEAD_TOP + MIC_HEAD_HEIGHT,
			height: 0,
		});
		expect(micHeadFill(1)).toEqual({
			y: MIC_HEAD_TOP,
			height: MIC_HEAD_HEIGHT,
		});
		expect(micHeadFill(0.5)).toEqual({ y: 7, height: 5 });
	});

	it("clamps out-of-range and non-finite levels", () => {
		expect(micHeadFill(-1)).toEqual(micHeadFill(0));
		expect(micHeadFill(2)).toEqual(micHeadFill(1));
		expect(micHeadFill(Number.NaN)).toEqual(micHeadFill(0));
	});
});
