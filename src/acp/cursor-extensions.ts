/**
 * Cursor ACP vendor extensions (`cursor/task`, `cursor/create_plan`,
 * `cursor/ask_question`). These are not part of the ACP spec; method names
 * do not start with `_`. Keep this file SDK-free so converters are testable.
 */

import type { ToolCall } from "../types/session";
import type { ToolKind } from "../types/chat";

export interface CursorTaskParams {
	toolCallId: string;
	description: string;
	prompt: string;
	subagentType: string;
	model?: string;
	agentId?: string;
	durationMs?: number;
}

export interface CursorCreatePlanParams {
	toolCallId: string;
	name?: string;
	overview?: string;
	plan: string;
	todos?: Array<{ id: string; content: string; status: string }>;
}

export interface CursorAskQuestionParams {
	toolCallId: string;
	title?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function formatSubagentType(value: unknown): string {
	if (typeof value === "string" && value.length > 0) return value;
	const record = asRecord(value);
	const custom = readString(record?.custom);
	if (custom) return custom;
	return "unspecified";
}

function kindForSubagentType(subagentType: string): ToolKind {
	switch (subagentType) {
		case "explore":
			return "search";
		case "shell":
		case "computer_use":
		case "vm_setup_helper":
			return "execute";
		case "browser_use":
			return "fetch";
		default:
			return "other";
	}
}

/**
 * Lenient parser for `cursor/task` params. Throws if toolCallId is missing
 * so the SDK can surface a protocol error instead of silently dropping.
 */
export function parseCursorTaskParams(params: unknown): CursorTaskParams {
	const record = asRecord(params);
	const toolCallId = readString(record?.toolCallId)?.trim();
	if (!record || !toolCallId) {
		throw new Error("cursor/task requires toolCallId");
	}
	const subagentType = formatSubagentType(record.subagentType);
	return {
		toolCallId,
		description: readString(record.description)?.trim() || "Subagent task",
		prompt: readString(record.prompt) ?? "",
		subagentType,
		model: readString(record.model),
		agentId: readString(record.agentId),
		durationMs: readNumber(record.durationMs),
	};
}

export function parseCursorCreatePlanParams(
	params: unknown,
): CursorCreatePlanParams {
	const record = asRecord(params);
	const toolCallId = readString(record?.toolCallId)?.trim();
	if (!record || !toolCallId) {
		throw new Error("cursor/create_plan requires toolCallId");
	}
	return {
		toolCallId,
		name: readString(record.name),
		overview: readString(record.overview),
		plan: readString(record.plan) ?? "",
		todos: Array.isArray(record.todos)
			? (record.todos as CursorCreatePlanParams["todos"])
			: undefined,
	};
}

export function parseCursorAskQuestionParams(
	params: unknown,
): CursorAskQuestionParams {
	const record = asRecord(params);
	const toolCallId = readString(record?.toolCallId)?.trim();
	if (!record || !toolCallId) {
		throw new Error("cursor/ask_question requires toolCallId");
	}
	return {
		toolCallId,
		title: readString(record.title),
	};
}

export function cursorTaskToToolCall(
	params: CursorTaskParams,
	sessionId: string,
): ToolCall {
	const completed = params.durationMs != null;
	return {
		type: "tool_call",
		sessionId,
		toolCallId: params.toolCallId,
		title: params.description,
		status: completed ? "completed" : "in_progress",
		kind: kindForSubagentType(params.subagentType),
		subagent: true,
		rawInput: {
			prompt: params.prompt,
			subagentType: params.subagentType,
			model: params.model,
			agentId: params.agentId,
			durationMs: params.durationMs,
		},
		content: params.prompt
			? [{ type: "content", text: params.prompt }]
			: undefined,
	};
}

export function cursorCreatePlanToToolCall(
	params: CursorCreatePlanParams,
	sessionId: string,
): ToolCall {
	const body = [params.overview, params.plan]
		.filter((part): part is string => !!part && part.trim().length > 0)
		.join("\n\n");
	return {
		type: "tool_call",
		sessionId,
		toolCallId: params.toolCallId,
		title: params.name || "Create Plan",
		status: "completed",
		kind: "think",
		content: body ? [{ type: "content", text: body }] : undefined,
		rawInput: {
			_toolName: "createPlan",
			name: params.name,
			overview: params.overview,
		},
	};
}

export function cursorCompletedOutcome(extra?: Record<string, unknown>): {
	outcome: { outcome: "completed" } & Record<string, unknown>;
} {
	return { outcome: { outcome: "completed", ...extra } };
}

export function cursorAcceptedOutcome(): {
	outcome: { outcome: "accepted" };
} {
	return { outcome: { outcome: "accepted" } };
}

export function cursorSkippedOutcome(reason: string): {
	outcome: { outcome: "skipped"; reason: string };
} {
	return { outcome: { outcome: "skipped", reason } };
}
