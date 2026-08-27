/**
 * Pure functions for message state updates.
 *
 * These functions are extracted from useMessages to keep the hook thin
 * and to allow independent testing. They handle message array transformations
 * for streaming updates, tool call management, and permission state.
 */

import type {
	ChatMessage,
	MessageContent,
	ActivePermission,
	PermissionOption,
	ToolCallMessageContent,
	ToolCallContent,
} from "../types/chat";
import type { SessionUpdate } from "../types/session";

export type { ToolCallMessageContent };

// ============================================================================
// Tool Call Merge
// ============================================================================

/**
 * Merge new tool call content into existing tool call.
 * Preserves existing values when new values are undefined.
 */
export function mergeToolCallContent(
	existing: ToolCallMessageContent,
	update: ToolCallMessageContent,
): ToolCallMessageContent {
	// Merge content arrays
	let mergedContent = existing.content || [];
	if (update.content !== undefined) {
		const newContent = update.content || [];

		// If new content contains diff, replace all old diffs
		const hasDiff = newContent.some((item) => item.type === "diff");
		if (hasDiff) {
			mergedContent = mergedContent.filter(
				(item) => item.type !== "diff",
			);
		}

		mergedContent = mergeContentBlocks(mergedContent, newContent);
	}

	let mergedNested = existing.nestedCalls;
	if (update.nestedCalls !== undefined) {
		mergedNested = mergeNestedCalls(
			existing.nestedCalls ?? [],
			update.nestedCalls,
		);
	}

	return {
		...existing,
		toolCallId: update.toolCallId,
		title: update.title !== undefined ? update.title : existing.title,
		kind: update.kind !== undefined ? update.kind : existing.kind,
		status: update.status !== undefined ? update.status : existing.status,
		content: mergedContent,
		locations:
			update.locations !== undefined
				? update.locations
				: existing.locations,
		rawInput:
			update.rawInput !== undefined &&
			Object.keys(update.rawInput).length > 0
				? update.rawInput
				: existing.rawInput,
		rawOutput:
			update.rawOutput !== undefined
				? update.rawOutput
				: existing.rawOutput,
		parentToolUseId:
			update.parentToolUseId !== undefined
				? update.parentToolUseId
				: existing.parentToolUseId,
		subagent:
			update.subagent !== undefined ? update.subagent : existing.subagent,
		nestedCalls: mergedNested,
		permissionRequest:
			update.permissionRequest !== undefined
				? update.permissionRequest
				: existing.permissionRequest,
	};
}

function mergeContentBlocks(
	existing: ToolCallContent[],
	incoming: ToolCallContent[],
): ToolCallContent[] {
	if (incoming.length === 0) return existing;
	const result = [...existing];
	for (const item of incoming) {
		const last = result[result.length - 1];
		if (item.type === "content" && last && last.type === "content") {
			result[result.length - 1] = {
				type: "content",
				text: last.text + item.text,
			};
		} else {
			result.push(item);
		}
	}
	return result;
}

function mergeNestedCalls(
	existing: ToolCallMessageContent[],
	incoming: ToolCallMessageContent[],
): ToolCallMessageContent[] {
	const result = [...existing];
	for (const child of incoming) {
		const idx = result.findIndex((c) => c.toolCallId === child.toolCallId);
		if (idx >= 0) {
			result[idx] = mergeToolCallContent(result[idx], child);
		} else {
			result.push(child);
		}
	}
	return result;
}

// ============================================================================
// Message Array Update Functions (for batching)
// ============================================================================

/**
 * Apply a "last assistant message" update to the messages array.
 * Creates a new assistant message if needed.
 */
export function applyUpdateLastMessage(
	prev: ChatMessage[],
	content: MessageContent,
): ChatMessage[] {
	if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
		const newMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: "assistant",
			content: [content],
			timestamp: new Date(),
		};
		return [...prev, newMessage];
	}

	const lastMessage = prev[prev.length - 1];
	const updatedMessage = { ...lastMessage };

	if (content.type === "text" || content.type === "agent_thought") {
		const existingContentIndex = updatedMessage.content.findIndex(
			(c) => c.type === content.type,
		);
		if (existingContentIndex >= 0) {
			const existingContent =
				updatedMessage.content[existingContentIndex];
			if (
				existingContent.type === "text" ||
				existingContent.type === "agent_thought"
			) {
				updatedMessage.content[existingContentIndex] = {
					type: content.type,
					text: existingContent.text + content.text,
				};
			}
		} else {
			updatedMessage.content.push(content);
		}
	} else {
		const existingIndex = updatedMessage.content.findIndex(
			(c) => c.type === content.type,
		);
		if (existingIndex >= 0) {
			updatedMessage.content[existingIndex] = content;
		} else {
			updatedMessage.content.push(content);
		}
	}

	return [...prev.slice(0, -1), updatedMessage];
}

/**
 * Apply a "last user message" update to the messages array.
 * Creates a new user message if needed. Used for session/load history replay.
 */
export function applyUpdateUserMessage(
	prev: ChatMessage[],
	content: MessageContent,
): ChatMessage[] {
	if (prev.length === 0 || prev[prev.length - 1].role !== "user") {
		const newMessage: ChatMessage = {
			id: crypto.randomUUID(),
			role: "user",
			content: [content],
			timestamp: new Date(),
		};
		return [...prev, newMessage];
	}

	const lastMessage = prev[prev.length - 1];
	const updatedMessage = { ...lastMessage };

	if (content.type === "text") {
		const existingContentIndex = updatedMessage.content.findIndex(
			(c) => c.type === "text",
		);
		if (existingContentIndex >= 0) {
			const existingContent =
				updatedMessage.content[existingContentIndex];
			if (existingContent.type === "text") {
				updatedMessage.content[existingContentIndex] = {
					type: "text",
					text: existingContent.text + content.text,
				};
			}
		} else {
			updatedMessage.content.push(content);
		}
	} else {
		const existingIndex = updatedMessage.content.findIndex(
			(c) => c.type === content.type,
		);
		if (existingIndex >= 0) {
			updatedMessage.content[existingIndex] = content;
		} else {
			updatedMessage.content.push(content);
		}
	}

	return [...prev.slice(0, -1), updatedMessage];
}

/**
 * Walk a tool-call tree (top-level + nestedCalls). Returns true if `visit`
 * returns true (early exit).
 */
function walkToolCalls(
	calls: ToolCallMessageContent[],
	visit: (call: ToolCallMessageContent) => boolean,
): boolean {
	for (const call of calls) {
		if (visit(call)) return true;
		if (call.nestedCalls && walkToolCalls(call.nestedCalls, visit)) {
			return true;
		}
	}
	return false;
}

function toolCallsInMessage(message: ChatMessage): ToolCallMessageContent[] {
	return message.content.filter(
		(c): c is ToolCallMessageContent => c.type === "tool_call",
	);
}

function mapToolCallTree(
	calls: ToolCallMessageContent[],
	toolCallId: string,
	mapper: (call: ToolCallMessageContent) => ToolCallMessageContent,
): { next: ToolCallMessageContent[]; found: boolean } {
	let found = false;
	const next = calls.map((call) => {
		if (call.toolCallId === toolCallId) {
			found = true;
			return mapper(call);
		}
		if (call.nestedCalls && call.nestedCalls.length > 0) {
			const nested = mapToolCallTree(
				call.nestedCalls,
				toolCallId,
				mapper,
			);
			if (nested.found) {
				found = true;
				return { ...call, nestedCalls: nested.next };
			}
		}
		return call;
	});
	return { next, found };
}

function replaceToolCallsInMessage(
	message: ChatMessage,
	nextCalls: ToolCallMessageContent[],
): ChatMessage {
	let i = 0;
	return {
		...message,
		content: message.content.map((c) => {
			if (c.type !== "tool_call") return c;
			return nextCalls[i++] ?? c;
		}),
	};
}

function indexToolCallTree(
	calls: ToolCallMessageContent[],
	msgIdx: number,
	toolCallIndex: Map<string, number>,
): void {
	for (const call of calls) {
		toolCallIndex.set(call.toolCallId, msgIdx);
		if (call.nestedCalls) {
			indexToolCallTree(call.nestedCalls, msgIdx, toolCallIndex);
		}
	}
}

function updateToolCallInMessages(
	prev: ChatMessage[],
	toolCallId: string,
	toolCallIndex: Map<string, number>,
	mapper: (call: ToolCallMessageContent) => ToolCallMessageContent,
): ChatMessage[] | null {
	const hinted = toolCallIndex.get(toolCallId);
	const tryIndex = (msgIdx: number): ChatMessage[] | null => {
		if (msgIdx < 0 || msgIdx >= prev.length) return null;
		const mapped = mapToolCallTree(
			toolCallsInMessage(prev[msgIdx]),
			toolCallId,
			mapper,
		);
		if (!mapped.found) return null;
		const result = [...prev];
		result[msgIdx] = replaceToolCallsInMessage(prev[msgIdx], mapped.next);
		return result;
	};

	if (hinted !== undefined) {
		const hit = tryIndex(hinted);
		if (hit) return hit;
	}

	for (let i = 0; i < prev.length; i++) {
		if (i === hinted) continue;
		const hit = tryIndex(i);
		if (hit) {
			toolCallIndex.set(toolCallId, i);
			return hit;
		}
	}
	return null;
}

/**
 * Apply a tool call upsert to the messages array.
 * Nested calls (parentToolUseId) are stored on the parent tool call.
 */
export function applyUpsertToolCall(
	prev: ChatMessage[],
	content: ToolCallMessageContent,
	toolCallIndex: Map<string, number>,
): ChatMessage[] {
	const existing = updateToolCallInMessages(
		prev,
		content.toolCallId,
		toolCallIndex,
		(call) => mergeToolCallContent(call, content),
	);
	if (existing) return existing;

	const parentId = content.parentToolUseId;
	if (parentId && parentId !== content.toolCallId) {
		const nested = updateToolCallInMessages(
			prev,
			parentId,
			toolCallIndex,
			(parent) => ({
				...parent,
				subagent: parent.subagent ?? true,
				nestedCalls: mergeNestedCalls(parent.nestedCalls ?? [], [
					content,
				]),
			}),
		);
		if (nested) {
			const parentMsgIdx = toolCallIndex.get(parentId);
			if (parentMsgIdx !== undefined) {
				toolCallIndex.set(content.toolCallId, parentMsgIdx);
			}
			return nested;
		}
	}

	toolCallIndex.set(content.toolCallId, prev.length);
	if (content.nestedCalls) {
		indexToolCallTree(content.nestedCalls, prev.length, toolCallIndex);
	}
	return [
		...prev,
		{
			id: crypto.randomUUID(),
			role: "assistant" as const,
			content: [content],
			timestamp: new Date(),
		},
	];
}

/**
 * Append streamed text/thought to a parent tool call's content.
 * Returns null if the parent is not in the message list.
 */
export function appendNestedTranscript(
	prev: ChatMessage[],
	parentToolUseId: string,
	text: string,
	asThought: boolean,
	toolCallIndex: Map<string, number>,
): ChatMessage[] | null {
	return updateToolCallInMessages(
		prev,
		parentToolUseId,
		toolCallIndex,
		(parent) => {
			const incoming: ToolCallContent = {
				type: "content",
				text: asThought ? `*(thinking)* ${text}` : text,
			};
			return {
				...parent,
				content: mergeContentBlocks(parent.content ?? [], [incoming]),
			};
		},
	);
}

/**
 * Rebuild the tool call index from a messages array (including nested calls).
 */
export function rebuildToolCallIndex(
	messages: ChatMessage[],
	toolCallIndex: Map<string, number>,
): void {
	toolCallIndex.clear();
	messages.forEach((msg, msgIdx) => {
		indexToolCallTree(toolCallsInMessage(msg), msgIdx, toolCallIndex);
	});
}

/**
 * Apply a single session update to the messages array.
 * Returns the same array reference if no change (session-level updates).
 */
export function applySingleUpdate(
	prev: ChatMessage[],
	update: SessionUpdate,
	toolCallIndex: Map<string, number>,
): ChatMessage[] {
	switch (update.type) {
		case "agent_message_chunk":
			if (update.parentToolUseId) {
				const nested = appendNestedTranscript(
					prev,
					update.parentToolUseId,
					update.text,
					false,
					toolCallIndex,
				);
				if (nested) return nested;
			}
			return applyUpdateLastMessage(prev, {
				type: "text",
				text: update.text,
			});
		case "agent_thought_chunk":
			if (update.parentToolUseId) {
				const nested = appendNestedTranscript(
					prev,
					update.parentToolUseId,
					update.text,
					true,
					toolCallIndex,
				);
				if (nested) return nested;
			}
			return applyUpdateLastMessage(prev, {
				type: "agent_thought",
				text: update.text,
			});
		case "user_message_chunk":
			return applyUpdateUserMessage(prev, {
				type: "text",
				text: update.text,
			});
		case "tool_call":
		case "tool_call_update":
			return applyUpsertToolCall(
				prev,
				{
					type: "tool_call",
					toolCallId: update.toolCallId,
					title: update.title,
					status: update.status || "pending",
					kind: update.kind,
					content: update.content,
					locations: update.locations,
					rawInput: update.rawInput,
					rawOutput: update.rawOutput,
					parentToolUseId: update.parentToolUseId,
					subagent: update.subagent,
					permissionRequest: update.permissionRequest,
				},
				toolCallIndex,
			);
		case "plan":
			return applyUpdateLastMessage(prev, {
				type: "plan",
				entries: update.entries,
			});
		default:
			return prev;
	}
}

// ============================================================================
// Permission Helper Functions
// ============================================================================

/**
 * Find the active permission request from messages.
 */
export function findActivePermission(
	messages: ChatMessage[],
): ActivePermission | null {
	let found: ActivePermission | null = null;
	for (const message of messages) {
		walkToolCalls(toolCallsInMessage(message), (call) => {
			const permission = call.permissionRequest;
			if (permission?.isActive) {
				found = {
					requestId: permission.requestId,
					toolCallId: call.toolCallId,
					options: permission.options,
				};
				return true;
			}
			return false;
		});
		if (found) return found;
	}
	return null;
}

/**
 * Select an option from the available options based on preferred kinds.
 */
export function selectOption(
	options: PermissionOption[],
	preferredKinds: PermissionOption["kind"][],
	fallback?: (option: PermissionOption) => boolean,
): PermissionOption | undefined {
	for (const kind of preferredKinds) {
		const match = options.find((opt) => opt.kind === kind);
		if (match) return match;
	}
	if (fallback) {
		const fallbackOption = options.find(fallback);
		if (fallbackOption) return fallbackOption;
	}
	return options[0];
}
