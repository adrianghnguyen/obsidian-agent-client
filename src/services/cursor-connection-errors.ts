/**
 * Cursor-specific connection failure copy for spawn, ACP init, and prompt errors.
 * Keeps generic "Agent Error" out of the Cursor path when we can classify the cause.
 */

import { AcpErrorCode, type ErrorInfo, type ProcessError } from "../types/errors";
import { CURSOR_PRESET_ID } from "./preset-agents";

export type CursorFailureKind =
	| "auth_missing"
	| "cli_not_found"
	| "acp_unavailable"
	| "endpoint_unreachable"
	| "timeout_or_exit";

export interface CursorFailureContext {
	command: string;
	args: string[];
	exitCode?: number | null;
	errorCode?: string;
	stderr?: string;
	errorMessage?: string;
	endpoint?: string;
	acpErrorCode?: number;
}

const CURSOR_SETUP_LINK = {
	text: "Cursor setup guide",
	url: "https://rait-09.github.io/obsidian-agent-client/agent-setup/cursor.html",
} as const;

export function isCursorAgent(agentId: string | undefined | null): boolean {
	return agentId === CURSOR_PRESET_ID;
}

/** Resolve the API base URL Cursor CLI would use (args override env override default). */
export function resolveCursorEndpoint(
	args: readonly string[],
	env: Record<string, string> = {},
): string {
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "-e" || arg === "--endpoint") {
			const next = args[i + 1]?.trim();
			if (next) return next;
		}
		if (arg.startsWith("-e=")) {
			return arg.slice(3).trim() || "https://api2.cursor.sh";
		}
		if (arg.startsWith("--endpoint=")) {
			return arg.slice("--endpoint=".length).trim() || "https://api2.cursor.sh";
		}
	}
	const fromEnv =
		env.CURSOR_API_URL?.trim() ||
		env.CURSOR_ENDPOINT?.trim() ||
		process.env.CURSOR_API_URL?.trim() ||
		process.env.CURSOR_ENDPOINT?.trim();
	return fromEnv || "https://api2.cursor.sh";
}

function haystack(ctx: CursorFailureContext): string {
	return [
		ctx.errorMessage,
		ctx.stderr,
		ctx.errorCode,
		ctx.command,
	]
		.filter(Boolean)
		.join("\n")
		.toLowerCase();
}

export function classifyCursorFailureKind(
	ctx: CursorFailureContext,
): CursorFailureKind | null {
	const text = haystack(ctx);

	if (
		ctx.acpErrorCode === AcpErrorCode.AUTHENTICATION_REQUIRED ||
		/\b(not authenticated|authentication required|login required|sign in|cursor_login|unauthorized|401)\b/.test(
			text,
		)
	) {
		return "auth_missing";
	}

	if (
		ctx.errorCode === "ENOENT" ||
		ctx.exitCode === 127 ||
		/\b(enoent|command not found|not found.*\bagent\b)\b/.test(text)
	) {
		return "cli_not_found";
	}

	if (
		/\b(unknown command.*acp|acp.*not found|agent acp.*not|does not support acp)\b/.test(
			text,
		)
	) {
		return "acp_unavailable";
	}

	if (
		ctx.errorCode === "ECONNREFUSED" ||
		ctx.errorCode === "ENOTFOUND" ||
		ctx.errorCode === "ETIMEDOUT" ||
		ctx.errorCode === "EAI_AGAIN" ||
		/\b(econnrefused|enotfound|etimedout|network error|fetch failed|socket hang up|api\.cursor|api2\.cursor)\b/.test(
			text,
		)
	) {
		return "endpoint_unreachable";
	}

	if (
		ctx.errorCode === "ETIMEDOUT" ||
		/\b(timeout|timed out|connection closed|process exited|agent connection is not available|acp connection closed)\b/.test(
			text,
		) ||
		(ctx.exitCode != null && ctx.exitCode !== 0 && ctx.exitCode !== 127)
	) {
		return "timeout_or_exit";
	}

	return null;
}

export function cursorFailureCopy(
	kind: CursorFailureKind,
	ctx: CursorFailureContext,
): ErrorInfo {
	const endpoint = ctx.endpoint || resolveCursorEndpoint(ctx.args);
	const commandLabel =
		ctx.args.length > 0
			? `${ctx.command} ${ctx.args.join(" ")}`
			: ctx.command;

	switch (kind) {
		case "auth_missing":
			return {
				title: "Cursor Not Signed In",
				message:
					"The Cursor CLI (`agent`) is installed but not authenticated, so `agent acp` cannot start a session.",
				suggestion:
					"Run `agent login` in a terminal (or set CURSOR_API_KEY), then use **Check setup** in Settings → Agent Client → Cursor or start a new chat.",
				link: CURSOR_SETUP_LINK,
			};
		case "cli_not_found":
			return {
				title: "Cursor CLI Not Found",
				message: `Could not find \`agent\` on your PATH (needed for \`${commandLabel}\`).`,
				suggestion:
					"Install with `curl https://cursor.com/install -fsS | bash`, add ~/.local/bin to PATH, then click **Auto-detect** or paste the path from `which agent`.",
				link: CURSOR_SETUP_LINK,
			};
		case "acp_unavailable":
			return {
				title: "Cursor ACP Subcommand Missing",
				message: `\`agent\` was found, but \`agent acp\` is not available — the Cursor CLI may be outdated or the wrong \`agent\` binary is on PATH.`,
				suggestion:
					"Run `agent update`, then verify with `agent acp --help`. If another tool owns the name `agent`, set an absolute path to the Cursor CLI.",
				link: CURSOR_SETUP_LINK,
			};
		case "endpoint_unreachable":
			return {
				title: "Cursor API Unreachable",
				message: `Could not reach the Cursor API at ${endpoint}.`,
				suggestion:
					"Check network and proxy settings, then review any `-e` / `--endpoint` argument or CURSOR_API_URL in Environment variables.",
				link: CURSOR_SETUP_LINK,
			};
		case "timeout_or_exit": {
			const detail =
				ctx.exitCode != null
					? ` (exit code ${ctx.exitCode})`
					: ctx.errorMessage
						? `: ${ctx.errorMessage}`
						: "";
			return {
				title: "Cursor Agent Stopped Unexpectedly",
				message: `The \`${commandLabel}\` process exited or timed out before the session connected${detail}.`,
				suggestion:
					"Run `agent acp` in a terminal to inspect stderr, run `agent update`, then restart the chat or use **Check setup** in Cursor settings.",
				link: CURSOR_SETUP_LINK,
			};
		}
	}
}

export function enrichCursorErrorInfo(
	agentId: string,
	fallback: ErrorInfo,
	ctx: CursorFailureContext,
): ErrorInfo {
	if (!isCursorAgent(agentId)) {
		return fallback;
	}
	const kind = classifyCursorFailureKind(ctx);
	if (!kind) {
		return fallback;
	}
	return cursorFailureCopy(kind, ctx);
}

export function enrichCursorProcessError(
	error: ProcessError,
	ctx: CursorFailureContext,
): ProcessError {
	if (!isCursorAgent(error.agentId)) {
		return error;
	}
	const enriched = enrichCursorErrorInfo(error.agentId, error, {
		...ctx,
		exitCode: error.exitCode ?? ctx.exitCode,
		errorCode: error.errorCode ?? ctx.errorCode,
		errorMessage: ctx.errorMessage ?? error.message,
	});
	return { ...error, ...enriched };
}
