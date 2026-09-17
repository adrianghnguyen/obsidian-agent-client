import { describe, it, expect } from "vitest";
import type { ChatMessage, MessageContent, ToolCallMessageContent } from "../src/types/chat";
import {
	extractTextContent,
	hasCopyableText,
} from "../src/utils/message-copy";
import {
	flattenTurnContents,
	segmentAssistantTurns,
} from "../src/services/trace-turn";

function userMessage(id: string, text: string): ChatMessage {
	return { id, role: "user", content: [{ type: "text", text }] };
}

function assistantMessage(
	id: string,
	content: ChatMessage["content"],
): ChatMessage {
	return { id, role: "assistant", content };
}

function readCall(id: string): ToolCallMessageContent {
	return {
		type: "tool_call",
		toolCallId: id,
		kind: "read",
		status: "completed",
		title: `Read ${id}`,
	};
}

describe("extractTextContent", () => {
	it("joins user text and text_with_context the same way as assistant answers", () => {
		const contents: MessageContent[] = [
			{ type: "text", text: "Hello" },
			{
				type: "text_with_context",
				text: "with note",
				autoMentionContext: { noteName: "Note", notePath: "Note.md" },
			},
		];
		expect(extractTextContent(contents)).toBe("Hello\nwith note");
		expect(hasCopyableText(contents)).toBe(true);
	});

	it("omits thoughts, tools, and empty text so Hidden buffers are not copied", () => {
		const contents: MessageContent[] = [
			{ type: "agent_thought", text: "planning" },
			readCall("r1"),
			{ type: "text", text: "" },
			{ type: "text", text: "Final answer." },
		];
		expect(extractTextContent(contents)).toBe("Final answer.");
	});

	it("returns empty when there is no visible reply text", () => {
		const contents: MessageContent[] = [
			{ type: "agent_thought", text: "planning" },
			readCall("r1"),
		];
		expect(extractTextContent(contents)).toBe("");
		expect(hasCopyableText(contents)).toBe(false);
	});

	it("copies only answer text from a Compact/Hidden turn flatten", () => {
		const messages: ChatMessage[] = [
			userMessage("u1", "go"),
			assistantMessage("a1", [
				{ type: "agent_thought", text: "thinking" },
				readCall("r1"),
			]),
			assistantMessage("a2", [{ type: "text", text: "Here is the answer." }]),
		];
		const segment = segmentAssistantTurns(messages)[0];
		expect(extractTextContent(flattenTurnContents(segment, messages))).toBe(
			"Here is the answer.",
		);
	});
});
