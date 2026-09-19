/**
 * Antigravity-specific chat error copy.
 *
 * Maps generic process/ACP failures into actionable messages with the ACP
 * endpoint path and a short next step. Only used when agentId is antigravity.
 */

import type { ErrorInfo } from "../../types/errors";
import type { ProcessError } from "../../types/errors";
import { AcpErrorCode } from "../../types/errors";
import {
	ANTIGRAVITY_PRESET_ID,
	getDefaultAntigravityBridgePath,
} from "./paths";

const DOCS_URL =
	"https://rait-09.github.io/obsidian-agent-client/agent-setup/antigravity.html";

export function isAntigravityAgent(agentId: string | undefined | null): boolean {
	return agentId === ANTIGRAVITY_PRESET_ID;
}

export function resolveAntigravityEndpoint(
	configuredCommand: string | undefined,
): string {
	const trimmed = configuredCommand?.trim();
	return trimmed && trimmed.length > 0
		? trimmed
		: getDefaultAntigravityBridgePath();
}

function withDocs(errorInfo: ErrorInfo): ErrorInfo {
	return {
		...errorInfo,
		link: { text: "Antigravity setup guide", url: DOCS_URL },
	};
}

function endpointLine(endpoint: string): string {
	return `ACP endpoint: ${endpoint}`;
}

/** Map process-level errors (spawn, exit, timeout) for Antigravity. */
export function mapAntigravityProcessError(
	error: ProcessError,
	endpoint: string,
): ErrorInfo {
	const endpointMsg = endpointLine(endpoint);

	switch (error.type) {
		case "spawn_failed":
		case "command_not_found":
			if (error.errorCode === "ENOENT" || error.type === "command_not_found") {
				return withDocs({
					title: "Antigravity ACP bridge not found",
					message: `${endpointMsg} — the bridge binary could not be executed.`,
					suggestion:
						"Install agy_acp_server.par (ACP Registry or ~/Library/agy-acp-server/ on macOS), click Auto-detect in Settings, then start a new chat.",
				});
			}
			return withDocs({
				title: "Antigravity bridge failed to start",
				message: `${endpointMsg} — ${error.message}`,
				suggestion:
					"Confirm the .par file is executable and not quarantined (macOS: xattr -d com.apple.quarantine). Run the health check in Settings.",
			});

		case "process_timeout":
			return withDocs({
				title: "Antigravity connection timed out",
				message: `${endpointMsg} — the bridge did not respond in time (first launch can take minutes).`,
				suggestion:
					"Wait and retry, or run the bridge once in Terminal to finish setup. Check Settings → Antigravity health.",
			});

		case "agent_exited":
		case "process_crashed":
			return withDocs({
				title: "Antigravity ACP server exited",
				message: `${endpointMsg} — the bridge process exited (code ${error.exitCode ?? "n/a"}).`,
				suggestion:
					"Run agy_acp_server.par in Terminal to see stderr, fix auth or install issues, then restart the chat.",
			});

		default:
			return withDocs({
				title: "Antigravity agent error",
				message: `${endpointMsg} — ${error.message}`,
				suggestion: error.suggestion ?? "See the Antigravity setup guide and health check.",
			});
	}
}

/** Map ACP protocol errors for Antigravity. */
export function mapAntigravityAcpError(
	code: number | undefined,
	message: string,
	endpoint: string,
): ErrorInfo {
	const endpointMsg = endpointLine(endpoint);
	const lower = message.toLowerCase();

	if (
		code === AcpErrorCode.AUTHENTICATION_REQUIRED ||
		lower.includes("auth") ||
		lower.includes("login") ||
		lower.includes("unauthorized") ||
		lower.includes("401")
	) {
		return withDocs({
			title: "Antigravity authentication failed",
			message: `${endpointMsg} — ${message}`,
			suggestion:
				"Run `agy` in Terminal and sign in, or set modelProvider=gemini with GEMINI_API_KEY. Then retry.",
		});
	}

	if (
		lower.includes("connection closed") ||
		lower.includes("econnrefused") ||
		lower.includes("unreachable") ||
		lower.includes("not found")
	) {
		return withDocs({
			title: "Antigravity ACP endpoint unreachable",
			message: `${endpointMsg} — ${message}`,
			suggestion:
				"Verify agy_acp_server.par exists, run Settings health check, and confirm the Path matches Auto-detect.",
		});
	}

	if (lower.includes("timeout") || lower.includes("timed out")) {
		return withDocs({
			title: "Antigravity connection timed out",
			message: `${endpointMsg} — ${message}`,
			suggestion:
				"First Antigravity ACP init can take a long time. Retry or warm up the bridge in Terminal.",
		});
	}

	return withDocs({
		title: "Antigravity agent error",
		message: `${endpointMsg} — ${message}`,
		suggestion: "Check Settings → Antigravity health, then restart the chat.",
	});
}

/** Map session creation / send failures from message text. */
export function mapAntigravityMessageError(
	message: string,
	endpoint: string,
): ErrorInfo | null {
	const lower = message.toLowerCase();
	const endpointMsg = endpointLine(endpoint);

	if (lower.includes("command not configured")) {
		return withDocs({
			title: "Antigravity path not configured",
			message: endpointMsg,
			suggestion: "Set the bridge path in Settings or click Auto-detect.",
		});
	}

	if (
		lower.includes("authentication") ||
		lower.includes("api key") ||
		lower.includes("login")
	) {
		return mapAntigravityAcpError(
			AcpErrorCode.AUTHENTICATION_REQUIRED,
			message,
			endpoint,
		);
	}

	if (
		lower.includes("enoent") ||
		lower.includes("not found") ||
		lower.includes("spawn")
	) {
		return withDocs({
			title: "Antigravity ACP bridge not found",
			message: `${endpointMsg} — ${message}`,
			suggestion:
				"Install the bridge and run Auto-detect. The agy CLI has no acp subcommand.",
		});
	}

	if (lower.includes("timeout") || lower.includes("timed out")) {
		return mapAntigravityAcpError(undefined, message, endpoint);
	}

	if (lower.includes("connection closed") || lower.includes("acp connection")) {
		return mapAntigravityAcpError(undefined, message, endpoint);
	}

	return null;
}

/** Upgrade generic ErrorInfo when the active agent is Antigravity. */
export function enrichAntigravityErrorInfo(
	agentId: string | undefined,
	endpoint: string,
	errorInfo: ErrorInfo,
): ErrorInfo {
	if (!isAntigravityAgent(agentId)) {
		return errorInfo;
	}

	const mapped = mapAntigravityMessageError(errorInfo.message, endpoint);
	if (mapped) {
		return mapped;
	}

	return withDocs({
		...errorInfo,
		message: `${endpointLine(endpoint)} — ${errorInfo.message}`,
	});
}
