/**
 * Parse ACP `_meta` for nested/subagent attribution.
 *
 * Claude Code (claude-agent-acp) attaches namespaced fields under
 * `_meta.claudeCode` when the client advertises `subagent-transcript`.
 * Other adapters may put `parentToolUseId` / `subagent` at the `_meta` root.
 *
 * This module does not import the ACP SDK (plain objects only).
 */

export interface ToolCallMeta {
	parentToolUseId?: string;
	subagent?: boolean;
	title?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		return value as Record<string, unknown>;
	}
	return null;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value
		: undefined;
}

function extractFromRecord(meta: Record<string, unknown>): ToolCallMeta {
	const claudeCode =
		asRecord(meta.claudeCode) ?? asRecord(meta["claude-code"]);

	const parentToolUseId =
		readString(meta.parentToolUseId) ??
		readString(meta.parent_tool_use_id) ??
		readString(claudeCode?.parentToolUseId) ??
		readString(claudeCode?.parent_tool_use_id);

	const subagent =
		meta.subagent === true || claudeCode?.subagent === true || undefined;

	const title = readString(meta.title) ?? readString(claudeCode?.title);

	return { parentToolUseId, subagent, title };
}

/**
 * Merge `_meta` objects (session notification + update) into one ToolCallMeta.
 * Later sources override earlier ones when they actually have a value.
 */
export function extractToolCallMeta(...sources: Array<unknown>): ToolCallMeta {
	const merged: ToolCallMeta = {};
	for (const source of sources) {
		const record = asRecord(source);
		if (!record) continue;
		const next = extractFromRecord(record);
		if (next.parentToolUseId) merged.parentToolUseId = next.parentToolUseId;
		if (next.subagent) merged.subagent = true;
		if (next.title) merged.title = next.title;
	}
	return merged;
}
