/**
 * Pure helpers for per-message conversation fork.
 *
 * ACP session/fork cannot rewind to a prior turn, so a message-level fork
 * copies the local transcript through that message into a sibling chat and
 * injects that history as agent-only context on the first prompt.
 */

import type { ChatMessage, PromptContent } from "../types/chat";
import type { TurnSegment } from "./trace-turn";
import { extractTextContent } from "../utils/message-copy";
import { truncateTitle } from "../utils/text";

const FORK_TITLE_PREFIX = "Fork: ";
const FORK_CONTEXT_HEADER =
	"The following is the prior conversation this chat was forked from. Continue from it when the user sends their next message.\n\n";
const EARLIER_TURNS_OMITTED = "[Earlier turns omitted]\n\n";
const DEFAULT_MAX_FORK_CONTEXT = 10000;

/**
 * Messages from the start of the transcript through `messageId` inclusive.
 * Returns null when the id is not in the list.
 */
export function sliceMessagesThrough(
	messages: ChatMessage[],
	messageId: string,
): ChatMessage[] | null {
	const index = messages.findIndex((message) => message.id === messageId);
	if (index < 0) return null;
	return messages.slice(0, index + 1);
}

/** Title for a forked session: keeps the "Fork: " prefix within 50 chars. */
export function forkSessionTitle(sourceTitle: string): string {
	const base = sourceTitle.trim() || "Session";
	return `${FORK_TITLE_PREFIX}${truncateTitle(base, 50 - FORK_TITLE_PREFIX.length)}`;
}

/**
 * Compact-turn fork target: last assistant message in the turn, else the
 * user message that opened it.
 */
export function forkThroughMessageIdForTurn(
	segment: TurnSegment,
	messages: ChatMessage[],
): string | null {
	const lastAssistantIndex = segment.assistantMessageIndices.at(-1);
	if (lastAssistantIndex != null) {
		const id = messages[lastAssistantIndex]?.id;
		if (id) return id;
	}
	if (segment.userMessageIndex == null) return null;
	return messages[segment.userMessageIndex]?.id ?? null;
}

/**
 * User/Assistant text only. Thoughts, tools, and permissions are skipped.
 * When over `maxLength`, oldest turns are dropped so the fork point is kept.
 */
export function formatForkContext(
	messages: ChatMessage[],
	maxLength: number = DEFAULT_MAX_FORK_CONTEXT,
): string {
	const turns: string[] = [];
	for (const message of messages) {
		const text = extractTextContent(message.content).trim();
		if (!text) continue;
		const label = message.role === "user" ? "User" : "Assistant";
		turns.push(`${label}:\n${text}`);
	}
	if (turns.length === 0) return "";

	const fit = (parts: string[], omitted: boolean): string => {
		const body = parts.join("\n\n");
		const prefix = omitted
			? FORK_CONTEXT_HEADER + EARLIER_TURNS_OMITTED
			: FORK_CONTEXT_HEADER;
		return prefix + body;
	};

	let omitted = false;
	while (turns.length > 1 && fit(turns, omitted).length > maxLength) {
		turns.shift();
		omitted = true;
	}

	let formatted = fit(turns, omitted);
	if (formatted.length <= maxLength) return formatted;

	const prefix = omitted
		? FORK_CONTEXT_HEADER + EARLIER_TURNS_OMITTED
		: FORK_CONTEXT_HEADER;
	const budget = Math.max(0, maxLength - prefix.length);
	formatted = prefix + turns.join("\n\n").slice(-budget);
	return formatted;
}

export function applyForkContextToAgentContent(
	agentContent: PromptContent[],
	forkContext: string,
): PromptContent[] {
	if (!forkContext.trim()) return agentContent;
	return [{ type: "text", text: forkContext }, ...agentContent];
}

/**
 * If `inject` is true, prepend formatted history to agent content.
 * `injected` is true when the pending flag should be cleared after a
 * successful send (including when there was no text to prepend).
 */
export function consumePendingForkContext(input: {
	inject: boolean;
	history: ChatMessage[];
	agentContent: PromptContent[];
	maxLength?: number;
}): { agentContent: PromptContent[]; injected: boolean } {
	if (!input.inject) {
		return { agentContent: input.agentContent, injected: false };
	}
	const formatted = formatForkContext(input.history, input.maxLength);
	return {
		agentContent: applyForkContextToAgentContent(
			input.agentContent,
			formatted,
		),
		injected: true,
	};
}
