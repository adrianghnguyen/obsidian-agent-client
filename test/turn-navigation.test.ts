import { describe, expect, it } from "vitest";
import {
	buildTurnNavEntries,
	extractUserPromptPreview,
	findActiveTurnIndex,
} from "../src/services/turn-navigation";
import type { DisplayListItem } from "../src/services/trace-turn";
import type { ChatMessage } from "../src/types/chat";

function userMsg(id: string, text: string): ChatMessage {
	return {
		id,
		role: "user",
		content: text ? [{ type: "text", text }] : [{ type: "image", data: "", mimeType: "image/png" }],
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

describe("extractUserPromptPreview", () => {
	it("collapses whitespace and trims", () => {
		expect(
			extractUserPromptPreview(userMsg("u1", "  hello\n\tworld   again  ")),
		).toBe("hello world again");
	});

	it("truncates long prompts with an ellipsis", () => {
		const preview = extractUserPromptPreview(
			userMsg("u1", "abcdefghijklmnopqrstuvwxyz"),
			10,
		);
		expect(preview).toBe("abcdefghi…");
		expect(preview.length).toBeLessThanOrEqual(10);
	});

	it("falls back to Attachment when no non-empty text exists", () => {
		expect(extractUserPromptPreview(userMsg("u1", ""))).toBe("Attachment");
	});
});

describe("buildTurnNavEntries", () => {
	it("collects only user messages and computes proportional positions", () => {
		const items: DisplayListItem[] = [
			{
				type: "message",
				key: "u1",
				message: userMsg("u1", "First turn"),
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
				message: userMsg("u2", "Second turn"),
				messageIndex: 2,
			},
			{
				type: "message",
				key: "a2",
				message: assistantMsg("a2"),
				messageIndex: 3,
			},
		];
		const offsets = [0, 100, 500, 650];
		const entries = buildTurnNavEntries(
			items,
			(idx) => offsets[idx],
			1000,
		);

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({
			turnNumber: 1,
			displayIndex: 0,
			key: "u1",
			preview: "First turn",
			positionRatio: 0.02,
		});
		expect(entries[1]).toMatchObject({
			turnNumber: 2,
			displayIndex: 2,
			key: "u2",
			preview: "Second turn",
			positionRatio: 0.5,
		});
	});

	it("distributes positions evenly when layout metrics are unavailable", () => {
		const items: DisplayListItem[] = [
			{
				type: "message",
				key: "u1",
				message: userMsg("u1", "One"),
				messageIndex: 0,
			},
			{
				type: "message",
				key: "u2",
				message: userMsg("u2", "Two"),
				messageIndex: 1,
			},
			{
				type: "message",
				key: "u3",
				message: userMsg("u3", "Three"),
				messageIndex: 2,
			},
		];
		const entries = buildTurnNavEntries(items, undefined, 0);
		expect(entries).toHaveLength(3);
		expect(entries[0].positionRatio).toBeCloseTo(0.04);
		expect(entries[1].positionRatio).toBeCloseTo(0.5);
		expect(entries[2].positionRatio).toBeCloseTo(0.96);
	});
});

describe("findActiveTurnIndex", () => {
	it("returns the latest turn whose offset is at or above scrollTop + tolerance", () => {
		const items: DisplayListItem[] = [
			{
				type: "message",
				key: "u1",
				message: userMsg("u1", "One"),
				messageIndex: 0,
			},
			{
				type: "message",
				key: "u2",
				message: userMsg("u2", "Two"),
				messageIndex: 1,
			},
			{
				type: "message",
				key: "u3",
				message: userMsg("u3", "Three"),
				messageIndex: 2,
			},
		];
		const offsets = [0, 400, 900];
		const entries = buildTurnNavEntries(
			items,
			(idx) => offsets[idx],
			1200,
		);

		expect(findActiveTurnIndex(entries, 0, (idx) => offsets[idx])).toBe(0);
		expect(findActiveTurnIndex(entries, 385, (idx) => offsets[idx])).toBe(1);
		expect(findActiveTurnIndex(entries, 950, (idx) => offsets[idx])).toBe(2);
		expect(findActiveTurnIndex([], 0, () => 0)).toBe(-1);
	});
});
