import { describe, it, expect } from "vitest";
import type { ChatMessage, PromptContent } from "../src/types/chat";
import {
	sliceMessagesThrough,
	forkSessionTitle,
	forkThroughMessageIdForTurn,
	formatForkContext,
	applyForkContextToAgentContent,
	consumePendingForkContext,
} from "../src/services/conversation-fork";
import { segmentAssistantTurns } from "../src/services/trace-turn";

function user(id: string, text: string): ChatMessage {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

function assistant(id: string, text: string): ChatMessage {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

function toolOnly(id: string): ChatMessage {
	return {
		id,
		role: "assistant",
		content: [
			{
				type: "tool_call",
				toolCallId: "t1",
				kind: "read",
				status: "completed",
				title: "Read file",
			},
		],
		timestamp: new Date(),
	};
}

describe("sliceMessagesThrough", () => {
	const messages = [
		user("a", "one"),
		assistant("b", "two"),
		user("c", "three"),
	];

	it("includes the target message and everything before it", () => {
		expect(sliceMessagesThrough(messages, "b")?.map((m) => m.id)).toEqual([
			"a",
			"b",
		]);
	});

	it("returns the full list when forking the last message", () => {
		expect(sliceMessagesThrough(messages, "c")).toEqual(messages);
		expect(sliceMessagesThrough(messages, "c")).not.toBe(messages);
	});

	it("returns null when the id is missing", () => {
		expect(sliceMessagesThrough(messages, "missing")).toBeNull();
	});
});

describe("forkSessionTitle", () => {
	it("prefixes Fork: and truncates the base to keep 50 chars", () => {
		expect(forkSessionTitle("Short")).toBe("Fork: Short");
		const long = "x".repeat(80);
		const titled = forkSessionTitle(long);
		expect(titled.startsWith("Fork: ")).toBe(true);
		expect(titled.length).toBe(50);
	});

	it("falls back to Session when the source title is blank", () => {
		expect(forkSessionTitle("   ")).toBe("Fork: Session");
	});
});

describe("forkThroughMessageIdForTurn", () => {
	it("targets the last assistant message in a compact turn", () => {
		const messages = [
			user("u1", "go"),
			assistant("a1", "thinking"),
			assistant("a2", "done"),
		];
		const [segment] = segmentAssistantTurns(messages);
		expect(forkThroughMessageIdForTurn(segment, messages)).toBe("a2");
	});
});

describe("formatForkContext", () => {
	it("emits User/Assistant text and skips tools and thoughts", () => {
		const formatted = formatForkContext([
			user("u", "hello"),
			{
				id: "t",
				role: "assistant",
				content: [{ type: "agent_thought", text: "secret" }],
				timestamp: new Date(),
			},
			toolOnly("tool"),
			assistant("a", "world"),
		]);
		expect(formatted).toContain("User:\nhello");
		expect(formatted).toContain("Assistant:\nworld");
		expect(formatted).not.toContain("secret");
		expect(formatted).not.toContain("Read file");
	});

	it("drops oldest turns when over the cap and keeps the fork point", () => {
		const messages = [
			user("u1", "A".repeat(80)),
			assistant("a1", "B".repeat(80)),
			user("u2", "keep-me-at-the-end"),
		];
		const formatted = formatForkContext(messages, 220);
		expect(formatted).toContain("keep-me-at-the-end");
		expect(formatted).toContain("[Earlier turns omitted]");
		expect(formatted).not.toContain("A".repeat(80));
	});

	it("returns empty when there is no copyable text", () => {
		expect(formatForkContext([toolOnly("t")])).toBe("");
	});
});

describe("consumePendingForkContext", () => {
	const history = [user("u", "prior"), assistant("a", "reply")];
	const original: PromptContent[] = [{ type: "text", text: "next" }];

	it("leaves agent content alone when inject is false", () => {
		const result = consumePendingForkContext({
			inject: false,
			history,
			agentContent: original,
		});
		expect(result.injected).toBe(false);
		expect(result.agentContent).toBe(original);
	});

	it("prepends history once and marks injected so a later send skips it", () => {
		const first = consumePendingForkContext({
			inject: true,
			history,
			agentContent: original,
		});
		expect(first.injected).toBe(true);
		expect(first.agentContent[0]).toEqual({
			type: "text",
			text: expect.stringContaining("User:\nprior"),
		});
		expect(first.agentContent.at(-1)).toEqual({
			type: "text",
			text: "next",
		});

		const second = consumePendingForkContext({
			inject: false,
			history,
			agentContent: original,
		});
		expect(second.injected).toBe(false);
		expect(second.agentContent).toEqual(original);
	});

	it("still consumes the flag when history has no text to prepend", () => {
		const result = consumePendingForkContext({
			inject: true,
			history: [toolOnly("t")],
			agentContent: original,
		});
		expect(result.injected).toBe(true);
		expect(result.agentContent).toEqual(original);
	});
});

describe("applyForkContextToAgentContent", () => {
	it("no-ops on blank context", () => {
		const content: PromptContent[] = [{ type: "text", text: "hi" }];
		expect(applyForkContextToAgentContent(content, "  ")).toBe(content);
	});
});
