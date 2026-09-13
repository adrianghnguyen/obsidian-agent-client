import { describe, it, expect } from "vitest";
import type { ChatMessage, ToolCallMessageContent } from "../src/types/chat";
import {
	buildDisplayListItems,
	collectVisibleTurnRows,
	flattenTurnTraceItems,
	pickFinalThought,
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

describe("segmentAssistantTurns", () => {
	it("groups consecutive assistant messages after a user message", () => {
		const messages = [
			userMessage("u1", "hello"),
			assistantMessage("a1", [readCall("r1")]),
			assistantMessage("a2", [readCall("r2")]),
			assistantMessage("a3", [{ type: "text", text: "done" }]),
			userMessage("u2", "thanks"),
			assistantMessage("a4", [readCall("r3")]),
		];
		const segments = segmentAssistantTurns(messages);
		expect(segments).toHaveLength(2);
		expect(segments[0].userMessageIndex).toBe(0);
		expect(segments[0].assistantMessageIndices).toEqual([1, 2, 3]);
		expect(segments[1].userMessageIndex).toBe(4);
		expect(segments[1].assistantMessageIndices).toEqual([5]);
	});
});

describe("flattenTurnTraceItems", () => {
	it("collects reads from multiple bubbles into one buffer list", () => {
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [readCall("r1")]),
			assistantMessage("a2", [readCall("r2")]),
		];
		const segment = segmentAssistantTurns(messages)[0];
		const items = flattenTurnTraceItems(segment, messages);
		expect(items).toHaveLength(2);
		expect(items.every((i) => i.type === "tool_call")).toBe(true);
	});
});

describe("pickFinalThought", () => {
	it("peels the last thought before trailing answer text", () => {
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [
				{ type: "agent_thought", text: "first look" },
				readCall("r1"),
			]),
			assistantMessage("a2", [
				{ type: "agent_thought", text: "final insight" },
				{ type: "text", text: "Here is the answer." },
			]),
		];
		const segment = segmentAssistantTurns(messages)[0];
		expect(pickFinalThought(segment, messages)).toEqual({
			type: "agent_thought",
			text: "final insight",
		});

		const buffer = flattenTurnTraceItems(segment, messages);
		expect(buffer.some((i) => i.type === "agent_thought" && i.text === "final insight")).toBe(
			false,
		);
		expect(buffer.some((i) => i.type === "agent_thought" && i.text === "first look")).toBe(
			true,
		);
	});
});

describe("collectVisibleTurnRows", () => {
	it("at hidden, keeps permissions outside the buffer", () => {
		const withPermission = readCall("perm");
		withPermission.permissionRequest = {
			requestId: "r1",
			options: [],
			isActive: true,
		};
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [readCall("r1"), withPermission]),
		];
		const segment = segmentAssistantTurns(messages)[0];
		const rows = collectVisibleTurnRows(segment, messages, "hidden");
		expect(rows.map((r) => r.type)).toEqual(["hiddenBuffer", "permission"]);
		if (rows[0].type === "hiddenBuffer") {
			expect(rows[0].items).toHaveLength(1);
		}
	});

	it("at hidden, puts edits inside the buffer", () => {
		const edit = readCall("e1");
		edit.kind = "edit";
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [readCall("r1")]),
			assistantMessage("a2", [edit]),
		];
		const segment = segmentAssistantTurns(messages)[0];
		const rows = collectVisibleTurnRows(segment, messages, "hidden");
		expect(rows.map((r) => r.type)).toEqual(["hiddenBuffer"]);
		if (rows[0].type === "hiddenBuffer") {
			expect(rows[0].items).toHaveLength(2);
		}
	});

	it("at compact, groups across bubbles", () => {
		const search: ToolCallMessageContent = {
			type: "tool_call",
			toolCallId: "s1",
			kind: "search",
			status: "completed",
		};
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [readCall("r1")]),
			assistantMessage("a2", [search, search]),
		];
		const segment = segmentAssistantTurns(messages)[0];
		const rows = collectVisibleTurnRows(segment, messages, "compact");
		expect(rows).toHaveLength(1);
		if (rows[0].type === "compactGroups") {
			const kinds = rows[0].groups.map((g) => g.type);
			expect(kinds).toContain("noisyTools");
			const searchGroup = rows[0].groups.find(
				(g) => g.type === "noisyTools" && g.kind === "search",
			);
			if (searchGroup?.type === "noisyTools") {
				expect(searchGroup.items).toHaveLength(2);
			}
		}
	});
});

describe("buildDisplayListItems", () => {
	it("collapses assistant turn bubbles at hidden verbosity", () => {
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [readCall("r1")]),
			assistantMessage("a2", [readCall("r2")]),
		];
		const items = buildDisplayListItems(messages, "hidden");
		expect(items).toHaveLength(2);
		expect(items[0].type).toBe("message");
		expect(items[1].type).toBe("turn");
	});

	it("keeps one item per message at full verbosity", () => {
		const messages = [
			userMessage("u1", "go"),
			assistantMessage("a1", [readCall("r1")]),
			assistantMessage("a2", [readCall("r2")]),
		];
		const items = buildDisplayListItems(messages, "full");
		expect(items).toHaveLength(3);
		expect(items.every((i) => i.type === "message")).toBe(true);
	});
});
