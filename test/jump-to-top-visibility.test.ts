import { describe, expect, it } from "vitest";
import {
	computeJumpToTopVisible,
	isLatestMessageLong,
	JUMP_TO_TOP_NEAR_MESSAGE_END_PX,
} from "../src/services/jump-to-top-visibility";

describe("jump-to-top visibility", () => {
	const clientHeight = 300;

	it("treats a message as long when its start has scrolled above the viewport", () => {
		expect(
			isLatestMessageLong({ scrollTop: 120, latestItemStart: 100 }),
		).toBe(true);
		expect(
			isLatestMessageLong({ scrollTop: 100, latestItemStart: 100 }),
		).toBe(false);
	});

	it("hides when the latest message start is still visible", () => {
		expect(
			computeJumpToTopVisible({
				scrollTop: 50,
				clientHeight,
				latestItemStart: 100,
				latestItemHeight: 800,
				isAtConversationBottom: false,
			}),
		).toBe(false);
	});

	it("hides while pinned to the conversation bottom", () => {
		expect(
			computeJumpToTopVisible({
				scrollTop: 700,
				clientHeight,
				latestItemStart: 100,
				latestItemHeight: 800,
				isAtConversationBottom: true,
			}),
		).toBe(false);
	});

	it("hides when the viewport is not near the end of the long reply", () => {
		expect(
			computeJumpToTopVisible({
				scrollTop: 200,
				clientHeight,
				latestItemStart: 100,
				latestItemHeight: 800,
				isAtConversationBottom: false,
			}),
		).toBe(false);
	});

	it("shows when scrolled up and within 100px of the message end", () => {
		const latestItemStart = 100;
		const latestItemHeight = 800;
		const latestItemEnd = latestItemStart + latestItemHeight;
		const scrollTop = latestItemEnd - clientHeight - 50;

		expect(
			computeJumpToTopVisible({
				scrollTop,
				clientHeight,
				latestItemStart,
				latestItemHeight,
				isAtConversationBottom: false,
			}),
		).toBe(true);

		expect(
			computeJumpToTopVisible({
				scrollTop:
					latestItemEnd -
					clientHeight -
					JUMP_TO_TOP_NEAR_MESSAGE_END_PX,
				clientHeight,
				latestItemStart,
				latestItemHeight,
				isAtConversationBottom: false,
			}),
		).toBe(true);
	});

	it("hides when the message end is more than 100px below the viewport", () => {
		expect(
			computeJumpToTopVisible({
				scrollTop:
					900 -
					clientHeight -
					JUMP_TO_TOP_NEAR_MESSAGE_END_PX -
					1,
				clientHeight,
				latestItemStart: 100,
				latestItemHeight: 800,
				isAtConversationBottom: false,
			}),
		).toBe(false);
	});
});
