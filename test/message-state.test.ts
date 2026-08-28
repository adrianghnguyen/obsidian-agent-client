import { describe, it, expect } from "vitest";
import {
	applySingleUpdate,
	applyUpsertToolCall,
	findActivePermission,
	rebuildToolCallIndex,
} from "../src/services/message-state";
import type { ChatMessage, ToolCallMessageContent } from "../src/types/chat";
import type { SessionUpdate } from "../src/types/session";

function toolCall(
	partial: Partial<ToolCallMessageContent> & { toolCallId: string },
): ToolCallMessageContent {
	return {
		type: "tool_call",
		status: "in_progress",
		...partial,
	};
}

describe("applySingleUpdate tool_call content", () => {
	it("stores ACP content text on the tool call", () => {
		const index = new Map<string, number>();
		const update: SessionUpdate = {
			type: "tool_call",
			sessionId: "s1",
			toolCallId: "task-1",
			title: "Explore codebase",
			status: "completed",
			kind: "other",
			subagent: true,
			content: [{ type: "content", text: "Found auth.ts" }],
		};

		const next = applySingleUpdate([], update, index);
		const call = next[0].content[0] as ToolCallMessageContent;
		expect(call.title).toBe("Explore codebase");
		expect(call.subagent).toBe(true);
		expect(call.content).toEqual([
			{ type: "content", text: "Found auth.ts" },
		]);
	});
});

describe("nested subagent tool calls", () => {
	it("nests child tool calls under the parent Agent/Task call", () => {
		const index = new Map<string, number>();
		let messages: ChatMessage[] = [];

		messages = applyUpsertToolCall(
			messages,
			toolCall({
				toolCallId: "parent",
				title: "Task",
				subagent: true,
			}),
			index,
		);
		messages = applyUpsertToolCall(
			messages,
			toolCall({
				toolCallId: "child",
				title: "Read file",
				parentToolUseId: "parent",
				kind: "read",
			}),
			index,
		);

		expect(messages).toHaveLength(1);
		const parent = messages[0].content[0] as ToolCallMessageContent;
		expect(parent.nestedCalls).toHaveLength(1);
		expect(parent.nestedCalls?.[0].toolCallId).toBe("child");
		expect(parent.nestedCalls?.[0].title).toBe("Read file");
	});

	it("merges later child updates without promoting them to top-level", () => {
		const index = new Map<string, number>();
		let messages: ChatMessage[] = [];
		messages = applyUpsertToolCall(
			messages,
			toolCall({ toolCallId: "parent", title: "Task", subagent: true }),
			index,
		);
		messages = applyUpsertToolCall(
			messages,
			toolCall({
				toolCallId: "child",
				title: "Read file",
				parentToolUseId: "parent",
				status: "in_progress",
			}),
			index,
		);
		messages = applyUpsertToolCall(
			messages,
			toolCall({
				toolCallId: "child",
				status: "completed",
				content: [{ type: "content", text: "ok" }],
			}),
			index,
		);

		expect(messages).toHaveLength(1);
		const parent = messages[0].content[0] as ToolCallMessageContent;
		expect(parent.nestedCalls?.[0].status).toBe("completed");
		expect(parent.nestedCalls?.[0].content).toEqual([
			{ type: "content", text: "ok" },
		]);
	});

	it("appends nested agent text to the parent tool call", () => {
		const index = new Map<string, number>();
		let messages: ChatMessage[] = [];
		messages = applyUpsertToolCall(
			messages,
			toolCall({ toolCallId: "parent", title: "Task", subagent: true }),
			index,
		);
		messages = applySingleUpdate(
			messages,
			{
				type: "agent_message_chunk",
				sessionId: "s1",
				text: "Looking around",
				parentToolUseId: "parent",
			},
			index,
		);

		expect(messages).toHaveLength(1);
		const parent = messages[0].content[0] as ToolCallMessageContent;
		expect(parent.content).toEqual([
			{ type: "content", text: "Looking around" },
		]);
	});

	it("falls back to the main feed when parent is unknown", () => {
		const index = new Map<string, number>();
		const next = applySingleUpdate(
			[],
			{
				type: "agent_message_chunk",
				sessionId: "s1",
				text: "orphan nested text",
				parentToolUseId: "missing",
			},
			index,
		);
		expect(next[0].content[0]).toEqual({
			type: "text",
			text: "orphan nested text",
		});
	});

	it("indexes nested calls so rebuild still finds them", () => {
		const index = new Map<string, number>();
		let messages: ChatMessage[] = [];
		messages = applyUpsertToolCall(
			messages,
			toolCall({ toolCallId: "parent", title: "Task", subagent: true }),
			index,
		);
		messages = applyUpsertToolCall(
			messages,
			toolCall({
				toolCallId: "child",
				parentToolUseId: "parent",
				title: "Grep",
			}),
			index,
		);
		const rebuilt = new Map<string, number>();
		rebuildToolCallIndex(messages, rebuilt);
		expect(rebuilt.get("parent")).toBe(0);
		expect(rebuilt.get("child")).toBe(0);
	});

	it("finds active permissions on nested tool calls", () => {
		const messages: ChatMessage[] = [
			{
				id: "m1",
				role: "assistant",
				timestamp: new Date(),
				content: [
					toolCall({
						toolCallId: "parent",
						title: "Task",
						subagent: true,
						nestedCalls: [
							toolCall({
								toolCallId: "child",
								permissionRequest: {
									requestId: "req-1",
									options: [
										{
											optionId: "allow",
											name: "Allow",
											kind: "allow_once",
										},
									],
									isActive: true,
								},
							}),
						],
					}),
				],
			},
		];
		expect(findActivePermission(messages)?.requestId).toBe("req-1");
	});
});
