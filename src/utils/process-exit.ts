/**
 * Process Exit Classification
 *
 * Pure helper that decides whether an agent process exit should be surfaced
 * as an actionable `process_error` (type "agent_exited").
 *
 * Callers (AcpClient's `exit` handler) already treat code 127 as
 * command_not_found, so this helper excludes it to avoid double-reporting.
 */

import type { ProcessError } from "../types/errors";

/**
 * Classify an agent process exit.
 *
 * @param code - Exit code (null if the process was killed by a signal)
 * @param signal - Signal that terminated the process (null if normal exit)
 * @param isInitialized - Whether the client still considers the agent
 *   connected/initialized. A user-initiated disconnect() clears this flag
 *   before killing the process, so those exits are not reported.
 * @param agentId - ID of the agent that exited
 * @param agentLabel - Display label for the agent (e.g. "Name (id)")
 * @returns A ProcessError to surface to the user, or null if the exit is
 *   benign/handled elsewhere (clean exit, code 127, or user disconnect).
 */
export function classifyUnexpectedExit(
	code: number | null,
	signal: string | null,
	isInitialized: boolean,
	agentId: string,
	agentLabel: string,
): ProcessError | null {
	// Not connected (user-initiated disconnect, init never completed, etc.)
	if (!isInitialized) return null;

	// Handled separately as command_not_found
	if (code === 127) return null;

	// Clean exit
	if (code === 0) return null;

	// Only surface unexpected exits: non-zero code or a terminating signal
	const unexpected =
		(code !== null && code !== 0) || (signal !== null && signal !== "SIGTERM");
	if (!unexpected) return null;

	return {
		type: "agent_exited",
		agentId,
		exitCode: code ?? undefined,
		title: "Agent Exited Unexpectedly",
		message: `The ${agentLabel} process exited (code ${code ?? "n/a"}${signal ? `, ${signal}` : ""}). The connection was closed — restore/send failed as a result.`,
		suggestion:
			"Check the agent CLI works from a terminal, then start a new chat or restore again.",
	};
}
