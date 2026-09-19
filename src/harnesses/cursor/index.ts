import type { ProcessError } from "../../types/errors";
import { defineHarness } from "../shared/define-harness";
import type {
	ConnectionErrorCard,
	ConnectionErrorContext,
	HealthContext,
	HealthReport,
} from "../shared/types";
import {
	enrichCursorProcessError,
	resolveCursorEndpoint,
} from "./connection-errors";
import { checkCursorCliHealth } from "./health";
import { CURSOR_PRESET_ID, cursorPreset } from "./preset";

export { CURSOR_PRESET_ID, cursorPreset } from "./preset";
export {
	checkCursorCliHealth,
	hasCursorApiKey,
	isCursorStatusAuthenticated,
} from "./health";
export {
	isCursorAgent,
	resolveCursorEndpoint,
	enrichCursorErrorInfo,
	enrichCursorProcessError,
} from "./connection-errors";

async function healthCheck(ctx: HealthContext): Promise<HealthReport> {
	const result = await checkCursorCliHealth({
		command: ctx.command ?? "agent",
		args: ctx.args && ctx.args.length > 0 ? [...ctx.args] : ["acp"],
		wslMode: ctx.wslMode ?? false,
		wslDistribution: ctx.wslDistribution,
		env: ctx.env,
	});
	return {
		ok: result.state === "ok",
		message: result.summary,
		summary: result.summary,
		checks: result.checks.map((c) => ({ ok: c.ok, message: c.message })),
	};
}

function mapConnectionError(
	err: ProcessError,
	ctx: ConnectionErrorContext = {},
): ConnectionErrorCard | null {
	if (err.agentId !== CURSOR_PRESET_ID) {
		return null;
	}
	const args = ctx.args && ctx.args.length > 0 ? [...ctx.args] : ["acp"];
	const enriched = enrichCursorProcessError(err, {
		command: ctx.command ?? "agent",
		args,
		endpoint: resolveCursorEndpoint(args, ctx.env),
		stderr: ctx.stderr,
		errorMessage: err.message,
		exitCode: err.exitCode,
		errorCode: err.errorCode,
	});
	return {
		title: enriched.title,
		body: enriched.message,
		suggestion: enriched.suggestion,
		link: enriched.link,
	};
}

export const cursorHarness = defineHarness(cursorPreset, {
	healthCheck,
	mapConnectionError,
	docs: { page: "cursor" },
});
