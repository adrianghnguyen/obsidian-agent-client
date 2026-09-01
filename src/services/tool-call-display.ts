/**
 * Pure helpers for displaying tool calls (titles, subagent detection).
 * No React, no ACP SDK.
 */

import type { ToolCallMessageContent } from "../types/chat";
import { isRawInputRecord } from "../utils/raw-input";

const SUBAGENT_TITLE_RE = /^(task|agent|subagent)\b/i;

/**
 * rawInput is normally normalized to an object at the ACP boundary, but
 * guard here too so a malformed value (e.g. a JSON string) can never crash
 * a render via `in` or property access.
 */
function safeRawInput(
	rawInput?: { [k: string]: unknown },
): { [k: string]: unknown } | undefined {
	return isRawInputRecord(rawInput) ? rawInput : undefined;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function toolNameFromRawInput(rawInput?: {
	[k: string]: unknown;
}): string | undefined {
	const raw = safeRawInput(rawInput);
	if (!raw) return undefined;
	return (
		readString(raw._toolName) ??
		readString(raw.toolName) ??
		readString(raw.name)
	);
}

/**
 * True when this tool call launched (or is) a nested/subagent task.
 */
export function isSubagentToolCall(
	call: Pick<
		ToolCallMessageContent,
		"subagent" | "title" | "rawInput" | "nestedCalls"
	>,
): boolean {
	if (call.subagent) return true;
	if (call.nestedCalls && call.nestedCalls.length > 0) return true;
	const title = readString(call.title ?? undefined);
	if (title && SUBAGENT_TITLE_RE.test(title)) return true;
	const rawInput = safeRawInput(call.rawInput);
	const toolName = toolNameFromRawInput(rawInput);
	if (toolName && /^(task|agent|subagent)$/i.test(toolName)) return true;
	if (rawInput && "subagentType" in rawInput) return true;
	return false;
}

export interface ToolCallTitleInput {
	title?: string | null;
	kind?: string;
	rawInput?: { [k: string]: unknown };
	subagent?: boolean;
	metaTitle?: string;
}

/**
 * Resolve a user-visible title. Subagent launches often arrive with an empty
 * ACP `title` and the description in `_meta` or `rawInput`.
 */
export function resolveToolCallTitle(input: ToolCallTitleInput): string {
	const fromTitle = readString(input.title ?? undefined);
	if (fromTitle) return fromTitle;

	const fromMeta = readString(input.metaTitle);
	if (fromMeta) return fromMeta;

	const raw = input.rawInput;
	const fromDescription = readString(raw?.description);
	if (fromDescription) return fromDescription;

	const toolName = toolNameFromRawInput(raw);
	if (toolName && !/^(task|agent)$/i.test(toolName)) {
		return toolName;
	}

	const fromPrompt = readString(raw?.prompt);
	if (fromPrompt) {
		const firstLine = fromPrompt.split(/\r?\n/, 1)[0].trim();
		if (firstLine.length > 80) return `${firstLine.slice(0, 77)}...`;
		if (firstLine) return firstLine;
	}

	if (input.subagent || (toolName && /^(task|agent)$/i.test(toolName))) {
		return "Subagent task";
	}

	if (input.kind && input.kind !== "other") {
		return input.kind.replace(/_/g, " ");
	}

	return "Tool";
}
