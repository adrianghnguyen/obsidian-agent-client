import { describe, expect, it } from "vitest";

import { formatElapsedDuration } from "../src/utils/format-elapsed-duration";
import { applyTurnDurationToLastAssistant } from "../src/services/message-state";
import type { ChatMessage } from "../src/types/chat";

describe("formatElapsedDuration", () => {
	it("formats seconds with zero padding", () => {
		expect(formatElapsedDuration(5000)).toBe("0:05");
	});

	it("formats minutes and seconds", () => {
		expect(formatElapsedDuration(70_000)).toBe("1:10");
	});

	it("clamps negative values to 0:00", () => {
		expect(formatElapsedDuration(-100)).toBe("0:00");
	});
});

describe("applyTurnDurationToLastAssistant", () => {
	const user: ChatMessage = {
		id: "u1",
		role: "user",
		content: [{ type: "text", text: "hi" }],
		timestamp: new Date(),
	};
	const assistant: ChatMessage = {
		id: "a1",
		role: "assistant",
		content: [{ type: "text", text: "hello" }],
		timestamp: new Date(),
	};

	it("sets duration on the last assistant message", () => {
		const next = applyTurnDurationToLastAssistant(
			[user, assistant],
			12_500,
		);
		expect(next[1].turnDurationMs).toBe(12_500);
		expect(next[0].turnDurationMs).toBeUndefined();
	});

	it("targets the latest assistant when user follows", () => {
		const older: ChatMessage = {
			...assistant,
			id: "a0",
		};
		const next = applyTurnDurationToLastAssistant(
			[older, user, assistant],
			3000,
		);
		expect(next[2].turnDurationMs).toBe(3000);
		expect(next[0].turnDurationMs).toBeUndefined();
	});

	it("no-ops when there is no assistant message", () => {
		const next = applyTurnDurationToLastAssistant([user], 1000);
		expect(next).toEqual([user]);
	});
});
