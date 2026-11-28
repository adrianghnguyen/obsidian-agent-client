import { describe, expect, it } from "vitest";
import {
	computeStreamDownwardsSpacerHeight,
	findLastUserDisplayIndex,
	STREAM_DOWNWARDS_TOP_INSET_PX,
} from "../src/services/stream-downwards";
import type { DisplayListItem } from "../src/services/trace-turn";
import type { ChatMessage } from "../src/types/chat";

function userMsg(id: string, text = "prompt"): ChatMessage {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

function assistantMsg(id: string, text = "reply"): ChatMessage {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

describe("findLastUserDisplayIndex", () => {
	it("returns -1 when displayItems is empty or has no user messages", () => {
		expect(findLastUserDisplayIndex([])).toBe(-1);
		const items: DisplayListItem[] = [
			{
				type: "message",
				key: "a1",
				message: assistantMsg("a1"),
				messageIndex: 0,
			},
		];
		expect(findLastUserDisplayIndex(items)).toBe(-1);
	});

	it("returns the index of the latest user message", () => {
		const items: DisplayListItem[] = [
			{
				type: "message",
				key: "u1",
				message: userMsg("u1"),
				messageIndex: 0,
			},
			{
				type: "message",
				key: "a1",
				message: assistantMsg("a1"),
				messageIndex: 1,
			},
			{
				type: "message",
				key: "u2",
				message: userMsg("u2"),
				messageIndex: 2,
			},
			{
				type: "message",
				key: "a2",
				message: assistantMsg("a2"),
				messageIndex: 3,
			},
		];
		expect(findLastUserDisplayIndex(items)).toBe(2);
	});
});

describe("computeStreamDownwardsSpacerHeight", () => {
	it("returns 0 when disabled, viewport empty, or no user turn exists", () => {
		expect(
			computeStreamDownwardsSpacerHeight({
				enabled: false,
				clientHeight: 500,
				lastUserStart: 400,
				totalContentHeight: 500,
			}),
		).toBe(0);
		expect(
			computeStreamDownwardsSpacerHeight({
				enabled: true,
				clientHeight: 0,
				lastUserStart: 400,
				totalContentHeight: 500,
			}),
		).toBe(0);
		expect(
			computeStreamDownwardsSpacerHeight({
				enabled: true,
				clientHeight: 500,
				lastUserStart: -1,
				totalContentHeight: 500,
			}),
		).toBe(0);
	});

	it("computes remaining viewport space for a short active turn", () => {
		const height = computeStreamDownwardsSpacerHeight({
			enabled: true,
			clientHeight: 500,
			lastUserStart: 800,
			totalContentHeight: 920,
			loadingIndicatorHeight: 36,
		});
		// activeTurnHeight = (920 - 800) + 36 = 156; 500 - 156 - 12 = 332
		expect(height).toBe(500 - 120 - 36 - STREAM_DOWNWARDS_TOP_INSET_PX);
	});

	it("shrinks to 0 once the active turn fills or overflows the viewport", () => {
		expect(
			computeStreamDownwardsSpacerHeight({
				enabled: true,
				clientHeight: 400,
				lastUserStart: 500,
				totalContentHeight: 950,
				loadingIndicatorHeight: 0,
			}),
		).toBe(0);
	});
});
