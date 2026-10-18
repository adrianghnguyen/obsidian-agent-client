import { describe, expect, it } from "vitest";
import {
	computeJumpToTopVisible,
	isLatestMessageLong,
	JUMP_TO_TOP_NEAR_MESSAGE_END_PX,
} from "../src/services/jump-to-top-visibility";

describe("jump-to-top visibility", () => {
	const containerTop = 0;
	const containerBottom = 300;

	it("treats a message as long when its top is above the viewport", () => {
		expect(
			isLatestMessageLong({ containerTop, itemTop: -20 }),
		).toBe(true);
		expect(
			isLatestMessageLong({ containerTop, itemTop: 0 }),
		).toBe(false);
	});

	it("hides when the latest message start is still visible", () => {
		expect(
			computeJumpToTopVisible({
				containerTop,
				containerBottom,
				itemTop: 10,
				itemBottom: 400,
				isAtConversationBottom: false,
			}),
		).toBe(false);
	});

	it("hides while pinned to the conversation bottom", () => {
		expect(
			computeJumpToTopVisible({
				containerTop,
				containerBottom,
				itemTop: -200,
				itemBottom: 300,
				isAtConversationBottom: true,
			}),
		).toBe(false);
	});

	it("hides when the viewport is not near the end of the long reply", () => {
		// Message bottom sits well below the viewport — user is mid-response.
		expect(
			computeJumpToTopVisible({
				containerTop,
				containerBottom,
				itemTop: -400,
				itemBottom: 800,
				isAtConversationBottom: false,
			}),
		).toBe(false);
	});

	it("shows when scrolled up and within 100px of the message bottom", () => {
		expect(
			computeJumpToTopVisible({
				containerTop,
				containerBottom,
				itemTop: -400,
				itemBottom: 350,
				isAtConversationBottom: false,
			}),
		).toBe(true);

		expect(
			computeJumpToTopVisible({
				containerTop,
				containerBottom,
				itemTop: -400,
				itemBottom:
					containerBottom + JUMP_TO_TOP_NEAR_MESSAGE_END_PX,
				isAtConversationBottom: false,
			}),
		).toBe(true);
	});

	it("hides when the message bottom is more than 100px below the viewport", () => {
		expect(
			computeJumpToTopVisible({
				containerTop,
				containerBottom,
				itemTop: -400,
				itemBottom:
					containerBottom + JUMP_TO_TOP_NEAR_MESSAGE_END_PX + 1,
				isAtConversationBottom: false,
			}),
		).toBe(false);
	});
});
