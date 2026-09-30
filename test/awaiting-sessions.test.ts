import { describe, it, expect, vi } from "vitest";
import {
	countAwaitingSessions,
	type IChatViewContainer,
} from "../src/services/view-registry";

function makeView(awaiting: boolean): IChatViewContainer {
	return {
		isAwaitingReply: vi.fn(() => awaiting),
	} as unknown as IChatViewContainer;
}

describe("countAwaitingSessions", () => {
	it("returns 0 for an empty list", () => {
		expect(countAwaitingSessions([])).toBe(0);
	});

	it("counts a single awaiting view", () => {
		expect(countAwaitingSessions([makeView(true)])).toBe(1);
	});

	it("ignores views that are not awaiting", () => {
		expect(countAwaitingSessions([makeView(false), makeView(false)])).toBe(
			0,
		);
	});

	it("counts only the awaiting views in a mixed list", () => {
		const views = [
			makeView(true),
			makeView(false),
			makeView(true),
			makeView(false),
			makeView(true),
		];
		expect(countAwaitingSessions(views)).toBe(3);
	});
});
