/**
 * Turn-level trace segmentation for verbosity grouping.
 * Pure helpers — no React, no ACP SDK.
 */

import type { ChatMessage, MessageContent, ToolCallMessageContent } from "../types/chat";
import type { TraceVerbosity } from "../types/settings";
import {
	groupTraceContent,
	isCreatePlanToolContent,
	isHiddenTraceItem,
	type HiddenTraceItem,
	type TraceContentGroup,
} from "./trace-verbosity";

export interface TurnSegment {
	turnId: string;
	userMessageIndex: number | null;
	assistantMessageIndices: number[];
}

export type ThoughtItem =
	| Extract<MessageContent, { type: "agent_thought" }>
	| ToolCallMessageContent;

export type TurnRow =
	| { type: "hiddenBuffer"; items: HiddenTraceItem[] }
	| { type: "finalThought"; item: ThoughtItem }
	| { type: "compactGroups"; groups: TraceContentGroup[] }
	| { type: "text"; content: Extract<MessageContent, { type: "text" | "text_with_context" }> }
	| { type: "permission"; item: ToolCallMessageContent }
	| { type: "plan"; content: Extract<MessageContent, { type: "plan" }> }
	| { type: "createPlan"; item: ToolCallMessageContent }
	| { type: "other"; item: MessageContent };

function isAnswerText(content: MessageContent): boolean {
	return content.type === "text" || content.type === "text_with_context";
}

/**
 * Split the message list into turns: consecutive assistant messages after
 * each user message (or from the start until the first user message).
 */
export function segmentAssistantTurns(messages: ChatMessage[]): TurnSegment[] {
	const segments: TurnSegment[] = [];
	let current: TurnSegment | null = null;
	let turnCounter = 0;

	const startTurn = (userMessageIndex: number | null) => {
		current = {
			turnId: `turn-${turnCounter++}`,
			userMessageIndex,
			assistantMessageIndices: [],
		};
		segments.push(current);
	};

	for (let i = 0; i < messages.length; i++) {
		const message = messages[i];
		if (message.role === "user") {
			startTurn(i);
			continue;
		}
		if (!current) {
			startTurn(null);
		}
		current!.assistantMessageIndices.push(i);
	}

	return segments;
}

/** Flatten all content blocks from assistant bubbles in a turn, in order. */
export function flattenTurnContents(
	segment: TurnSegment,
	messages: ChatMessage[],
): MessageContent[] {
	return segment.assistantMessageIndices.flatMap(
		(index) => messages[index]?.content ?? [],
	);
}

/**
 * Index of the final thought in flattened turn contents — last agent_thought
 * or completed think tool before trailing assistant answer text.
 */
export function pickFinalThoughtIndex(contents: MessageContent[]): number | null {
	let lastIdx = contents.length - 1;
	while (lastIdx >= 0 && isAnswerText(contents[lastIdx])) {
		lastIdx--;
	}

	for (let i = lastIdx; i >= 0; i--) {
		const content = contents[i];
		if (content.type === "agent_thought") return i;
		if (
			content.type === "tool_call" &&
			content.kind === "think" &&
			content.status === "completed" &&
			!isCreatePlanToolContent(content)
		) {
			return i;
		}
	}
	return null;
}

export function pickFinalThought(
	segment: TurnSegment,
	messages: ChatMessage[],
): ThoughtItem | null {
	const contents = flattenTurnContents(segment, messages);
	const index = pickFinalThoughtIndex(contents);
	if (index === null) return null;
	const content = contents[index];
	if (content.type === "agent_thought") return content;
	if (content.type === "tool_call") return content;
	return null;
}

/** Hidden-buffer items: all intermediary thoughts + tools (including the last thought). */
export function flattenTurnTraceItems(
	segment: TurnSegment,
	messages: ChatMessage[],
): HiddenTraceItem[] {
	const contents = flattenTurnContents(segment, messages);
	const items: HiddenTraceItem[] = [];

	for (const content of contents) {
		if (isHiddenTraceItem(content)) {
			items.push(content as HiddenTraceItem);
		}
	}

	return items;
}

function pushVisibleExtras(rows: TurnRow[], contents: MessageContent[]): void {
	for (const content of contents) {
		if (isAnswerText(content)) {
			rows.push({
				type: "text",
				content: content as Extract<
					MessageContent,
					{ type: "text" | "text_with_context" }
				>,
			});
		} else if (
			content.type === "tool_call" &&
			content.permissionRequest?.isActive === true
		) {
			rows.push({ type: "permission", item: content });
		} else if (content.type === "plan") {
			rows.push({ type: "plan", content });
		} else if (
			content.type === "tool_call" &&
			isCreatePlanToolContent(content)
		) {
			rows.push({ type: "createPlan", item: content });
		}
	}
}

function isCompactGroupingExcluded(
	content: MessageContent,
	index: number,
	finalThoughtIdx: number | null,
): boolean {
	if (index === finalThoughtIdx) return true;
	if (isAnswerText(content)) return true;
	if (content.type === "plan") return true;
	if (isCreatePlanToolContent(content)) return true;
	if (
		content.type === "tool_call" &&
		content.permissionRequest?.isActive === true
	) {
		return true;
	}
	return false;
}

export function collectActivePermissionTools(
	segment: TurnSegment,
	messages: ChatMessage[],
): ToolCallMessageContent[] {
	const tools: ToolCallMessageContent[] = [];
	for (const index of segment.assistantMessageIndices) {
		for (const content of messages[index]?.content ?? []) {
			if (
				content.type === "tool_call" &&
				content.permissionRequest?.isActive === true
			) {
				tools.push(content);
			}
		}
	}
	return tools;
}

/**
 * Ordered render units for a turn at Hidden or Compact verbosity.
 * Full verbosity uses per-message rendering instead.
 */
export function collectVisibleTurnRows(
	segment: TurnSegment,
	messages: ChatMessage[],
	verbosity: TraceVerbosity,
): TurnRow[] {
	const contents = flattenTurnContents(segment, messages);
	const rows: TurnRow[] = [];

	if (verbosity === "hidden") {
		const bufferItems = flattenTurnTraceItems(segment, messages);
		if (bufferItems.length > 0) {
			rows.push({ type: "hiddenBuffer", items: bufferItems });
		}
		pushVisibleExtras(rows, contents);
	} else if (verbosity === "compact") {
		const finalThoughtIdx = pickFinalThoughtIndex(contents);
		const groupingContents = contents.filter(
			(content, index) =>
				!isCompactGroupingExcluded(content, index, finalThoughtIdx),
		);
		const groups = groupTraceContent(groupingContents, "compact");
		if (groups.length > 0) {
			rows.push({ type: "compactGroups", groups });
		}
		const finalThought = pickFinalThought(segment, messages);
		if (finalThought) {
			rows.push({ type: "finalThought", item: finalThought });
		}
		pushVisibleExtras(rows, contents);
	}

	return rows;
}

export type DisplayListItem =
	| { type: "message"; key: string; message: ChatMessage; messageIndex: number }
	| {
			type: "turn";
			key: string;
			segment: TurnSegment;
			messageIndex: number;
	  };

/**
 * Build virtualizer items for MessageList. At Hidden/Compact, assistant turns
 * collapse to one row anchored at the first assistant message in the turn.
 */
export function buildDisplayListItems(
	messages: ChatMessage[],
	verbosity: TraceVerbosity,
): DisplayListItem[] {
	if (verbosity === "full") {
		return messages.map((message, index) => ({
			type: "message",
			key: message.id,
			message,
			messageIndex: index,
		}));
	}

	const segments = segmentAssistantTurns(messages);
	const absorbed = new Set<number>();
	const turnByFirstIndex = new Map<number, TurnSegment>();

	for (const segment of segments) {
		if (segment.assistantMessageIndices.length === 0) continue;
		const [first, ...rest] = segment.assistantMessageIndices;
		turnByFirstIndex.set(first, segment);
		for (const index of rest) {
			absorbed.add(index);
		}
	}

	const items: DisplayListItem[] = [];
	for (let index = 0; index < messages.length; index++) {
		if (absorbed.has(index)) continue;
		const message = messages[index];
		if (message.role === "user") {
			items.push({
				type: "message",
				key: message.id,
				message,
				messageIndex: index,
			});
			continue;
		}

		const segment = turnByFirstIndex.get(index);
		if (segment) {
			items.push({
				type: "turn",
				key: `turn-${segment.turnId}`,
				segment,
				messageIndex: index,
			});
			continue;
		}

		items.push({
			type: "message",
			key: message.id,
			message,
			messageIndex: index,
		});
	}

	return items;
}
