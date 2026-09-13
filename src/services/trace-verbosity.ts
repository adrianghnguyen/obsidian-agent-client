/**
 * Client-side thinking/tool-trace verbosity (not ACP thought_level).
 * Pure helpers — no React, no ACP SDK.
 */

import { normalizeRawInput } from "../utils/raw-input";
import type { ToolCallStatus } from "../types/chat";
import type { SessionConfigOption } from "../types/session";
import type { TraceVerbosity } from "../types/settings";

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

const NOISY_KINDS = new Set<string>([
	"execute",
	"read",
	"search",
	"fetch",
	"think",
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

function isNoisyTool(kind?: string | null, rawInput?: unknown): boolean {
	if (kind && NOISY_KINDS.has(kind)) return true;
	if (kind === "edit" || kind === "delete" || kind === "move") return false;
	return extractToolCommand(rawInput) !== undefined;
}

export function shouldFoldToolDetails(input: FoldToolDetailsInput): boolean {
	if (input.verbosity === "full") return false;
	if (input.hasPermission) return false;
	if (input.status === "in_progress" || input.status === "pending") {
		return false;
	}
	return isNoisyTool(input.kind, input.rawInput);
}

export function isThinkToolKind(kind?: string | null): boolean {
	return kind === "think";
}
