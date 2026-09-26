import type { ProcessError } from "../../types/errors";
import { defineHarness } from "../shared/define-harness";
import type {
	ConnectionErrorCard,
	ConnectionErrorContext,
	HealthContext,
	HealthReport,
} from "../shared/types";
import {
	mapAntigravityProcessError,
	resolveAntigravityEndpoint,
} from "./errors";
import { checkAntigravityHealth } from "./health";
import { antigravitySessionAuthPolicy } from "./session-auth";
import { ANTIGRAVITY_PRESET_ID } from "./paths";
import { antigravityPreset } from "./preset";

export { antigravityPreset } from "./preset";
export {
	ANTIGRAVITY_PRESET_ID,
	ANTIGRAVITY_BRIDGE_FILENAME,
	ANTIGRAVITY_HARNESS_FILENAME,
	ANTIGRAVITY_BRIDGE_PAR,
	ANTIGRAVITY_BRIDGE_EXE,
	ANTIGRAVITY_SESSION_AUTH_METHOD,
	getAntigravityBridgeFilename,
	getDefaultAntigravityBridgePath,
	getAntigravityCompanionCandidates,
	hasGeminiApiKey,
	resolveAntigravityBridgePath,
	resolveAntigravityBridgeForSpawn,
	resolveAntigravityCompanionPath,
	resolveAntigravitySpawnBridge,
} from "./paths";
export {
	classifyAntigravityAuth,
	extractAcpAuthMethod,
	resolveAntigravitySessionAuthMethod,
	ANTIGRAVITY_OAUTH_PERSONAL,
} from "./auth";
export {
	checkAntigravityHealth,
	getAntigravityMcpConfigNote,
	type AntigravityHealthReport,
} from "./health";
export {
	isAntigravityAgent,
	resolveAntigravityEndpoint,
	mapAntigravityProcessError,
	mapAntigravityAcpError,
	mapAntigravityMessageError,
	enrichAntigravityErrorInfo,
} from "./errors";

async function healthCheck(ctx: HealthContext): Promise<HealthReport> {
	const report = await checkAntigravityHealth(ctx.command ?? "", {
		env: ctx.env,
	});
	return {
		ok: report.overall === "ok",
		message:
			report.overall === "ok"
				? "Health check: ready"
				: report.overall === "warning"
					? "Health check: warnings — review below"
					: "Health check: issues found",
		summary:
			report.overall === "ok"
				? "Health check: ready"
				: report.overall === "warning"
					? "Health check: warnings — review below"
					: "Health check: issues found",
		checks: report.checks.map((c) => ({
			ok: c.status === "ok",
			message: `${c.label}: ${c.detail}`,
		})),
	};
}

function mapConnectionError(
	err: ProcessError,
	ctx: ConnectionErrorContext = {},
): ConnectionErrorCard | null {
	if (err.agentId !== ANTIGRAVITY_PRESET_ID) {
		return null;
	}
	const mapped = mapAntigravityProcessError(
		err,
		resolveAntigravityEndpoint(ctx.command),
	);
	return {
		title: mapped.title,
		body: mapped.message,
		suggestion: mapped.suggestion,
		link: mapped.link,
	};
}

/** Empty-state copy while the ACP bridge finishes a cold initialize. */
export const ANTIGRAVITY_CONNECTING_COPY =
	"Starting ACP bridge… first initialize can take about 30 seconds";

export const antigravityHarness = defineHarness(antigravityPreset, {
	healthCheck,
	mapConnectionError,
	sessionAuthPolicy: antigravitySessionAuthPolicy,
	docs: { page: "antigravity" },
});
