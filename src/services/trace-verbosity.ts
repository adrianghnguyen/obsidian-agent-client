/**
 * Client-side thinking/tool-trace verbosity (not ACP thought_level).
 * Pure helpers — no React, no ACP SDK.
 */

import { normalizeRawInput } from "../utils/raw-input";
import type {
	MessageContent,
	ToolCallMessageContent,
	ToolCallStatus,
} from "../types/chat";
import type { SessionConfigOption } from "../types/session";
import type { TraceVerbosity } from "../types/settings";
import { isSubagentToolCall } from "./tool-call-display";

export type { TraceVerbosity };

export const TRACE_VERBOSITY_LEVELS: readonly TraceVerbosity[] = [
	"hidden",
	"compact",
	"full",
] as const;

export const DEFAULT_TRACE_VERBOSITY: TraceVerbosity = "compact";

/** Plugin-wide persist path — not lastUsedConfigOptions[agentId]. */
export const TRACE_VERBOSITY_SETTING_KEY =
	"displaySettings.traceVerbosity" as const;

export const TRACE_VERBOSITY_LABELS: Record<TraceVerbosity, string> = {
	hidden: "Hidden",
	compact: "Compact",
	full: "Full",
};

/** Short summary for the toolbar menu header and Settings description. */
export const TRACE_VERBOSITY_SUMMARY =
	"Controls how much agent thinking and tool activity is shown.";

/** Per-level detail shown beside each verbosity option in the toolbar menu. */
export const TRACE_VERBOSITY_DESCRIPTIONS: Record<TraceVerbosity, string> = {
	hidden:
		"One working-queue buffer per turn plus the final thought. Permission prompts stay visible.",
	compact:
		"Groups tools by type across the turn. Bodies stay folded until you expand a card.",
	full: "Shows full thinking and tool details.",
};

const NOISY_KINDS = new Set<string>([
	"execute",
	"read",
	"search",
	"fetch",
	"think",
	"edit",
	"delete",
	"move",
	"other",
]);

export function parseTraceVerbosity(value: unknown): TraceVerbosity {
	if (
		typeof value === "string" &&
		(TRACE_VERBOSITY_LEVELS as readonly string[]).includes(value)
	) {
		return value as TraceVerbosity;
	}
	return DEFAULT_TRACE_VERBOSITY;
}

export function shouldRenderThought(level: TraceVerbosity): boolean {
	return level !== "hidden";
}

export function thoughtExpandedByDefault(level: TraceVerbosity): boolean {
	return level === "full";
}

/**
 * Verbosity is a client display control. Always offer it, even when the
 * agent advertises no config options / no thought_level.
 */
export function shouldShowVerbosityControl(
	_configOptions?: SessionConfigOption[] | null,
): boolean {
	return true;
}

function readCommandString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function formatArgs(args: unknown): string | undefined {
	if (!Array.isArray(args) || args.length === 0) return undefined;
	const parts = args
		.filter((item): item is string => typeof item === "string")
		.map((item) => item.trim())
		.filter((item) => item.length > 0);
	return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * Command text from Cursor (`command` + `args`) or Antigravity (`CommandLine`),
 * including JSON-string rawInput.
 */
export function extractToolCommand(rawInput?: unknown): string | undefined {
	const raw = normalizeRawInput(rawInput);
	if (!raw) return undefined;

	const commandLine = readCommandString(raw.CommandLine);
	if (commandLine) return commandLine;

	const command = readCommandString(raw.command);
	if (!command) return undefined;
	const args = formatArgs(raw.args);
	return args ? `${command} ${args}` : command;
}

export interface FoldToolDetailsInput {
	kind?: string | null;
	status: ToolCallStatus;
	hasPermission?: boolean;
	verbosity: TraceVerbosity;
	rawInput?: unknown;
}

export function isNoisyTool(kind?: string | null, rawInput?: unknown): boolean {
	if (kind && NOISY_KINDS.has(kind)) return true;
	return extractToolCommand(rawInput) !== undefined;
}

export function shouldFoldToolDetails(input: FoldToolDetailsInput): boolean {
	if (input.verbosity === "full") return false;
	if (input.hasPermission) return false;
	return true;
}

/** Thought or tool that Hidden folds into the turn buffer (permissions stay visible). */
export function isHiddenTraceItem(content: MessageContent): boolean {
	if (content.type === "agent_thought") return true;
	if (content.type !== "tool_call") return false;
	if (content.permissionRequest?.isActive === true) return false;
	return (
		isNoisyTool(content.kind, content.rawInput) ||
		isSubagentToolCall(content)
	);
}

export type HiddenTraceItem = Extract<
	MessageContent,
	{ type: "agent_thought" | "tool_call" }
>;

const HIDDEN_SUMMARY_KIND_ORDER = [
	"read",
	"search",
	"fetch",
	"execute",
	"edit",
	"delete",
	"move",
	"other",
	"think",
] as const;

function hiddenSummaryPart(
	kind: string,
	count: number,
	inFlight: boolean,
): string | null {
	if (count <= 0) return null;
	switch (kind) {
		case "read":
			return count === 1 ? "Read 1 file" : `Read ${count} files`;
		case "search":
			return inFlight
				? "Searching"
				: count === 1
					? "Searched"
					: `Searched ${count} times`;
		case "fetch":
			return inFlight
				? "Fetching"
				: count === 1
					? "Fetched"
					: `Fetched ${count} times`;
		case "execute":
			return inFlight
				? "Running commands"
				: count === 1
					? "Ran a command"
					: `Ran ${count} commands`;
		case "edit":
			return inFlight
				? "Editing"
				: count === 1
					? "Edited 1 file"
					: `Edited ${count} files`;
		case "delete":
			return inFlight
				? "Deleting"
				: count === 1
					? "Deleted 1 file"
					: `Deleted ${count} files`;
		case "move":
			return inFlight
				? "Moving"
				: count === 1
					? "Moved 1 file"
					: `Moved ${count} files`;
		case "other":
			return inFlight
				? "Working"
				: count === 1
					? "Updated 1"
					: `Updated ${count}`;
		case "think":
			return "Thinking";
		default:
			return count === 1 ? "Used a tool" : `Used ${count} tools`;
	}
}

/** Single-line Hidden summary, e.g. "Read 2 files… Searching… Ran 2 commands". */
export function hiddenTraceSummary(items: HiddenTraceItem[]): string {
	if (items.length === 0) return "Working";

	const counts = new Map<string, number>();
	const inFlightByKind = new Map<string, boolean>();

	for (const item of items) {
		if (item.type === "agent_thought") {
			counts.set("think", (counts.get("think") ?? 0) + 1);
			continue;
		}
		const key = noisyToolGroupKey(item.kind, item.rawInput);
		counts.set(key, (counts.get(key) ?? 0) + 1);
		if (item.status === "in_progress" || item.status === "pending") {
			inFlightByKind.set(key, true);
		}
	}

	const parts: string[] = [];
	const seen = new Set<string>();
	for (const kind of HIDDEN_SUMMARY_KIND_ORDER) {
		seen.add(kind);
		const part = hiddenSummaryPart(
			kind,
			counts.get(kind) ?? 0,
			inFlightByKind.get(kind) === true,
		);
		if (part) parts.push(part);
	}
	for (const kind of counts.keys()) {
		if (seen.has(kind)) continue;
		const part = hiddenSummaryPart(
			kind,
			counts.get(kind) ?? 0,
			inFlightByKind.get(kind) === true,
		);
		if (part) parts.push(part);
	}

	return parts.length > 0 ? parts.join("\u2026 ") : "Working";
}

export function isThinkToolKind(kind?: string | null): boolean {
	return kind === "think";
}

export type GroupableToolCall = Pick<
	ToolCallMessageContent,
	| "kind"
	| "status"
	| "rawInput"
	| "permissionRequest"
	| "subagent"
	| "title"
	| "nestedCalls"
>;

export function shouldGroupNoisyTool(
	call: GroupableToolCall,
	verbosity: TraceVerbosity,
): boolean {
	if (verbosity === "full") return false;
	if (call.permissionRequest?.isActive === true) return false;
	if (isSubagentToolCall(call)) return false;
	return isNoisyTool(call.kind, call.rawInput);
}

/** Stable key for consecutive same-kind grouping. */
export function noisyToolGroupKey(
	kind?: string | null,
	rawInput?: unknown,
): string {
	if (kind && kind !== "other") return kind;
	if (extractToolCommand(rawInput)) return "execute";
	return kind ?? "other";
}

export function noisyToolGroupLabel(kind: string): string {
	switch (kind) {
		case "read":
			return "Read";
		case "search":
			return "Search";
		case "fetch":
			return "Fetch";
		case "execute":
			return "Command";
		case "edit":
			return "Edited";
		case "delete":
			return "Deleted";
		case "move":
			return "Moved";
		case "think":
			return "Think";
		default:
			return "Tool";
	}
}

export type TraceContentGroup =
	| { type: "attachments"; items: MessageContent[] }
	| { type: "noisyTools"; kind: string; items: ToolCallMessageContent[] }
	| { type: "hiddenTrace"; items: HiddenTraceItem[] }
	| { type: "single"; item: MessageContent };

function groupHiddenTraceContent(
	contents: MessageContent[],
): TraceContentGroup[] {
	const hiddenItems = contents.filter(isHiddenTraceItem) as HiddenTraceItem[];
	const groups: TraceContentGroup[] = [];
	let attachments: MessageContent[] = [];
	let hiddenInserted = false;

	const flushAttachments = () => {
		if (attachments.length === 0) return;
		groups.push({ type: "attachments", items: attachments });
		attachments = [];
	};

	const insertHidden = () => {
		if (hiddenInserted || hiddenItems.length === 0) return;
		groups.push({ type: "hiddenTrace", items: hiddenItems });
		hiddenInserted = true;
	};

	for (const content of contents) {
		if (isHiddenTraceItem(content)) {
			flushAttachments();
			insertHidden();
			continue;
		}

		if (content.type === "image" || content.type === "resource_link") {
			attachments.push(content);
			continue;
		}

		flushAttachments();
		groups.push({ type: "single", item: content });
	}

	flushAttachments();
	insertHidden();
	return groups;
}

/**
 * Group consecutive images/resource links, and consecutive completed noisy
 * tool calls of the same kind (Compact only, 2+ items). Hidden collapses
 * thoughts and noisy tools into one summary line.
 */
export function groupTraceContent(
	contents: MessageContent[],
	verbosity: TraceVerbosity,
): TraceContentGroup[] {
	if (verbosity === "hidden") {
		return groupHiddenTraceContent(contents);
	}

	const groups: TraceContentGroup[] = [];
	let attachments: MessageContent[] = [];
	let noisy: ToolCallMessageContent[] = [];
	let noisyKind: string | null = null;

	const flushAttachments = () => {
		if (attachments.length === 0) return;
		groups.push({ type: "attachments", items: attachments });
		attachments = [];
	};

	const flushNoisy = () => {
		if (noisy.length === 0) return;
		if (noisyKind) {
			groups.push({
				type: "noisyTools",
				kind: noisyKind,
				items: noisy,
			});
		}
		noisy = [];
		noisyKind = null;
	};

	for (const content of contents) {
		if (content.type === "image" || content.type === "resource_link") {
			flushNoisy();
			attachments.push(content);
			continue;
		}

		flushAttachments();

		if (
			content.type === "tool_call" &&
			shouldGroupNoisyTool(content, verbosity)
		) {
			const key = noisyToolGroupKey(content.kind, content.rawInput);
			if (noisyKind !== null && noisyKind !== key) {
				flushNoisy();
			}
			noisyKind = key;
			noisy.push(content);
			continue;
		}

		flushNoisy();
		groups.push({ type: "single", item: content });
	}

	flushAttachments();
	flushNoisy();
	return groups;
}
