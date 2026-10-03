/**
 * Tool-call status presentation helpers.
 *
 * Pure functions — no React, no Obsidian, no ACP SDK.
 *
 * Some ACP adapters (notably Google's Antigravity bridge) report a tool call
 * as `failed` even when nothing errored: a prompt / local-harness call that
 * the agent decided not to execute, or a tool the agent invoked directly
 * instead, is still emitted as `status: "failed"` because the bridge only
 * closes unmatched frames with a terminal "failed" update. The UI must not
 * count those as real errors, and it should say why a call failed instead of
 * showing a bare red X.
 *
 * The distinction is deliberately conservative: a call only drops out of the
 * error count when we can positively prove it never carried an error signal
 * (no ACP `content` and no `rawOutput`). Anything with a payload — e.g. a
 * denied `run_command` carrying "Rejected by user" — stays a real failure.
 */

import type { ToolCallMessageContent } from "../types/chat";
import { isRawInputRecord } from "../utils/raw-input";

const ERROR_HINT_RE =
	/\b(denied|rejected|error|failed|failure|not found|does not exist|unauthorized|forbidden|exception|timed? ?out|refused|invalid|unable)\b/i;
const INCOMPLETE_HINT_RE =
	/\b(never executed|not executed|dropped|aborted|did not run|never ran|superseded)\b/i;

export type ToolCallFailureReason = "explained" | "aborted" | "unknown";

/** True when `rawOutput` carries an explicit `error` field. */
export function hasToolErrorField(
	rawOutput?: { [k: string]: unknown },
): boolean {
	if (!isRawInputRecord(rawOutput)) return false;
	for (const key of ["error", "Error"]) {
		const value = rawOutput[key];
		if (typeof value === "string") {
			if (value.trim().length > 0) return true;
		} else if (value != null) {
			return true;
		}
	}
	return false;
}

/** Structured error text on a tool call's `rawOutput`, if any. */
export function readToolRawOutputText(
	rawOutput?: { [k: string]: unknown },
): string | null {
	if (!isRawInputRecord(rawOutput)) return null;
	for (const key of ["error", "Error", "message", "Message"]) {
		const value = rawOutput[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}

function hasResourceLink(rawInput?: { [k: string]: unknown }): boolean {
	if (!isRawInputRecord(rawInput)) return false;
	for (const value of Object.values(rawInput)) {
		if (!isRawInputRecord(value)) continue;
		const uri = value.uri ?? value.Uri ?? value.href;
		if (typeof uri === "string" && uri.trim().length > 0) return true;
	}
	return false;
}

/**
 * True when a failed tool call carries no evidence that it actually errored:
 * no ACP content blocks, no structured error/output, and no resource_link
 * (whose body arrives via the client's fs read, not ACP `content`).
 */
export function isUnexplainedFailure(
	call: Pick<
		ToolCallMessageContent,
		"status" | "content" | "rawOutput" | "rawInput"
	>,
): boolean {
	if (call.status !== "failed") return false;
	if ((call.content?.length ?? 0) > 0) return false;
	if (isRawInputRecord(call.rawOutput)) return false;
	if (hasResourceLink(call.rawInput)) return false;
	return true;
}

/**
 * Classify a failed tool call for display.
 *
 * - `explained` — a real error with a message or a rejected/denied permission.
 * - `aborted` — no error signal; the adapter reported failed for a call that
 *   never ran (Antigravity bridge abort/dropped-frame behavior).
 * - `unknown` — failed but not classifiable (kept as an error).
 */
export function classifyToolCallFailure(
	call: Pick<
		ToolCallMessageContent,
		"status" | "content" | "rawOutput" | "rawInput" | "permissionRequest"
	>,
): ToolCallFailureReason {
	if (call.status !== "failed") return "unknown";
	if (call.permissionRequest?.isCancelled === true) return "unknown";
	if ((call.content?.length ?? 0) > 0) return "explained";
	if (hasToolErrorField(call.rawOutput)) return "explained";
	const text = readToolRawOutputText(call.rawOutput);
	if (text !== null) {
		return ERROR_HINT_RE.test(text) ? "explained" : "aborted";
	}
	if (isRawInputRecord(call.rawOutput)) return "explained";
	if (hasResourceLink(call.rawInput)) return "unknown";
	return "aborted";
}

/** Human-readable tool name from `rawInput`, when the adapter supplies one. */
export function toolNameFromRawInput(
	rawInput?: { [k: string]: unknown },
): string | null {
	if (!isRawInputRecord(rawInput)) return null;
	for (const key of ["_toolName", "toolName", "ToolName", "name"]) {
		const value = rawInput[key];
		if (typeof value === "string" && value.trim().length > 0) {
			return value.trim();
		}
	}
	return null;
}

/**
 * Short, user-facing reason for a failed call, or `null` when none applies.
 * Guarded by the classification so an aborted call never shows an error
 * sentence.
 */
export function findToolFailureReason(
	call: Pick<
		ToolCallMessageContent,
		| "status"
		| "content"
		| "rawOutput"
		| "rawInput"
		| "permissionRequest"
	>,
): string | null {
	const classification = classifyToolCallFailure(call);
	const text = readToolRawOutputText(call.rawOutput);

	if (call.permissionRequest?.isCancelled === true) {
		return "Request was cancelled.";
	}
	if (classification === "explained") {
		if (text !== null) return text;
		return "The tool reported an error.";
	}
	if (classification !== "aborted") return null;

	if (text !== null && INCOMPLETE_HINT_RE.test(text)) {
		return "The agent did not run this call.";
	}
	const name = toolNameFromRawInput(call.rawInput);
	if (name) {
		return `The agent did not run this ${name} call and used another tool instead.`;
	}
	return "The agent aborted this call before it ran.";
}

export interface FailedCountOptions {
	/**
	 * When false (default), failed calls with no error evidence are excluded
	 * from the count so the Antigravity abort pattern is not reported as
	 * "N failed". Set true for the strict, raw `status === "failed"` count.
	 */
	includeUnexplained?: boolean;
}

/**
 * Count failed tool calls under an analysis level, applying the configured
 * classification. Shared by every group header (Hidden buffer, Compact noisy
 * groups, and per-message groups) so the number never diverges.
 */
export function countFailedToolCalls(
	calls: readonly Pick<
		ToolCallMessageContent,
		"status" | "content" | "rawOutput" | "rawInput" | "permissionRequest"
	>[],
	options: FailedCountOptions = {},
): number {
	let count = 0;
	for (const call of calls) {
		if (call.status !== "failed") continue;
		if (
			!options.includeUnexplained &&
			classifyToolCallFailure(call) === "aborted"
		) {
			continue;
		}
		count++;
	}
	return count;
}

/** ACP statuses a user may see. Kept here so the label and icon agree. */
export type ToolCallStatus = ToolCallMessageContent["status"];

/** Icon name for a failed call under the configured analysis level. */
export function toolCallStatusIcon(
	status: ToolCallStatus,
	call: Pick<
		ToolCallMessageContent,
		"content" | "rawOutput" | "rawInput" | "permissionRequest"
	>,
	analysis: ToolCallFailureAnalysis,
): string {
	if (status !== "failed") return "ellipsis";
	const classification = classifyToolCallFailure({ ...call, status });
	if (classification === "aborted" && analysis !== "strict") {
		return "slash";
	}
	return "x";
}

/** Milder status wording so an aborted call is not labelled "failed". */
export function toolCallStatusLabel(
	status: ToolCallStatus,
	call: Pick<
		ToolCallMessageContent,
		"content" | "rawOutput" | "rawInput" | "permissionRequest"
	>,
	analysis: ToolCallFailureAnalysis,
): string {
	if (status !== "failed") {
		return status === "completed"
			? "Completed"
			: status === "in_progress"
				? "Running"
				: "Pending";
	}
	const classification = classifyToolCallFailure({ ...call, status });
	if (classification === "aborted" && analysis !== "strict") {
		return "Not run";
	}
	return "Failed";
}

export type ToolCallFailureAnalysis = "lenient" | "strict";
