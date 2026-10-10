/**
 * Functional: ACP session updates become one transcript, then a file.
 * AcpHandler filters by session id. message-state merges chunks.
 * SessionStorage reloads that transcript. No agent process.
 */
import { describe, it, expect } from "vitest";
import { AcpHandler } from "../../src/acp/acp-handler";
import { PermissionManager } from "../../src/acp/permission-handler";
import { TerminalManager } from "../../src/acp/terminal-handler";
import type AgentClientPlugin from "../../src/plugin";
import { applySingleUpdate } from "../../src/services/message-state";
import { computeSessionTitle } from "../../src/services/session-helpers";
import type { ChatMessage, ToolCallMessageContent } from "../../src/types/chat";
import type { SessionUpdate } from "../../src/types/session";
import { getLogger } from "../../src/utils/logger";
import { createMemorySessionStore } from "./memory-session-store";

function wireHandler(sessionId: string): {
	handler: AcpHandler;
	read: () => ChatMessage[];
} {
	let messages: ChatMessage[] = [];
	const index = new Map<string, number>();
	const permissions = new PermissionManager(
		{ onSessionUpdate: () => {} },
		false,
	);
	const handler = new AcpHandler(
		permissions,
		new TerminalManager({} as AgentClientPlugin),
		() => "/vault",
		() => sessionId,
		getLogger(),
	);
	handler.onSessionUpdate((update: SessionUpdate) => {
		messages = applySingleUpdate(messages, update, index);
	});
	return { handler, read: () => messages };
}

describe("message stream persist", () => {
	it("merges one session's chunks and ignores another session and usage", async () => {
		const { handler, read } = wireHandler("sess-live");

		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text: "Fix " },
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text: "the note" },
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-other",
			update: {
				sessionUpdate: "user_message_chunk",
				content: { type: "text", text: "IGNORE" },
			},
		});

		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "agent_thought_chunk",
				content: { type: "text", text: "Think" },
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "Done" },
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "agent_thought_chunk",
				content: { type: "text", text: " more" },
			},
		});

		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "tool_call",
				toolCallId: "parent",
				title: "Task",
				status: "in_progress",
				kind: "other",
				rawInput: '{"path":"A.md"}',
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-live",
			_meta: { parentToolUseId: "parent" },
			update: {
				sessionUpdate: "agent_message_chunk",
				content: { type: "text", text: "nested" },
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "tool_call_update",
				toolCallId: "parent",
				status: "completed",
			},
		});
		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "plan",
				entries: [
					{
						content: "Edit the note",
						status: "completed",
						priority: "high",
					},
				],
			},
		});

		const beforeUsage = read();
		await handler.sessionUpdate({
			sessionId: "sess-live",
			update: {
				sessionUpdate: "usage_update",
				used: 10,
				size: 100,
			},
		});
		expect(read()).toBe(beforeUsage);

		const messages = read();
		expect(messages).toHaveLength(3);
		expect(messages[0].content).toEqual([
			{ type: "text", text: "Fix the note" },
		]);
		const assistant = messages[1].content;
		expect(assistant.find((block) => block.type === "agent_thought")).toEqual(
			{ type: "agent_thought", text: "Think more" },
		);
		expect(assistant.find((block) => block.type === "text")).toEqual({
			type: "text",
			text: "Done",
		});
		const toolMessage = messages[2].content;
		const tool = toolMessage.find(
			(block) => block.type === "tool_call",
		) as ToolCallMessageContent;
		expect(tool.status).toBe("completed");
		expect(tool.rawInput).toEqual({ path: "A.md" });
		expect(tool.content).toEqual([{ type: "content", text: "nested" }]);
		expect(toolMessage.find((block) => block.type === "plan")).toEqual({
			type: "plan",
			entries: [
				{
					content: "Edit the note",
					status: "completed",
					priority: "high",
				},
			],
		});
		expect(JSON.stringify(messages)).not.toContain("IGNORE");

		const { storage, state } = createMemorySessionStore();
		await storage.saveSession({
			sessionId: "sess-live",
			agentId: "cursor",
			cwd: "/vault",
			title: "Saved title",
			createdAt: "2026-01-01T00:00:00.000Z",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		await storage.saveSessionMessages("sess-live", "cursor", messages);
		const loaded = await storage.loadSessionMessages("sess-live");
		const loadedTool = loaded?.[2].content.find(
			(block) => block.type === "tool_call",
		) as ToolCallMessageContent;
		expect(loadedTool.status).toBe("completed");
		expect(loadedTool.content).toEqual([{ type: "content", text: "nested" }]);
		expect(
			computeSessionTitle("sess-live", state.savedSessions, loaded ?? []),
		).toBe("Saved title");
	});
});
