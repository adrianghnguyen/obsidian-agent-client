/**
 * Antigravity preset health checks for Settings → Agent Client.
 *
 * Probes the ACP bridge binary, Antigravity ACP auth under
 * ~/.gemini/antigravity-acp/, the localharness companion, and the configured
 * spawn endpoint. Does not spawn the bridge (too slow).
 */

import { access, readFile, stat } from "fs/promises";
import { constants } from "fs";
import { basename } from "path";
import { classifyAntigravityAuth, gatherAntigravityAuthSignals } from "./auth";
import {
	ANTIGRAVITY_HARNESS_FILENAME,
	getAntigravityBridgeCandidates,
	getAntigravityBridgeFilename,
	getAntigravityCompanionCandidates,
	getAntigravityMcpConfigPath,
	resolveAntigravityCompanionPath,
	resolveAntigravitySpawnBridge,
} from "./paths";

export type AntigravityHealthLevel = "ok" | "warning" | "error";

export interface AntigravityHealthCheck {
	id: "bridge" | "auth" | "endpoint" | "harness";
	label: string;
	status: AntigravityHealthLevel;
	detail: string;
	suggestion?: string;
}

export interface AntigravityHealthReport {
	overall: AntigravityHealthLevel;
	checks: AntigravityHealthCheck[];
	endpoint: string;
}

export interface AntigravityHealthOptions {
	env?: Record<string, string>;
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path, constants.F_OK);
		return true;
	} catch {
		return false;
	}
}

async function checkBridge(
	configuredPath: string,
): Promise<AntigravityHealthCheck> {
	const filename = getAntigravityBridgeFilename();
	const resolved = await resolveAntigravitySpawnBridge(configuredPath);
	if (resolved) {
		return {
			id: "bridge",
			label: "ACP bridge",
			status: "ok",
			detail: `Found ${basename(resolved)} at ${resolved}`,
		};
	}

	if (configuredPath.trim()) {
		return {
			id: "bridge",
			label: "ACP bridge",
			status: "error",
			detail: `Configured path ${configuredPath.trim()} is missing or not executable.`,
			suggestion:
				"Fix the Path or click Auto-detect. Chat spawns this path as-is and will not fall back to another install.",
		};
	}

	const candidates = getAntigravityBridgeCandidates();
	const probed = candidates.slice(0, 3).join(", ");
	return {
		id: "bridge",
		label: "ACP bridge",
		status: "error",
		detail: `${filename} not found. Probed: ${probed}${candidates.length > 3 ? ", …" : ""}`,
		suggestion: `Install the Antigravity ACP bridge from the ACP Registry (Zed: Agents → Antigravity) or copy ${filename} into the platform install folder, then click Auto-detect.`,
	};
}

async function checkAuth(
	env?: Record<string, string>,
): Promise<AntigravityHealthCheck> {
	const classification = classifyAntigravityAuth(
		await gatherAntigravityAuthSignals(undefined, {
			...process.env,
			...env,
		}),
	);
	return {
		id: "auth",
		label: "Authentication",
		status: classification.health.status,
		detail: classification.health.detail,
		suggestion: classification.health.suggestion,
	};
}

async function checkEndpoint(
	configuredPath: string,
): Promise<AntigravityHealthCheck> {
	const resolved = await resolveAntigravitySpawnBridge(configuredPath);

	if (resolved) {
		return {
			id: "endpoint",
			label: "ACP endpoint",
			status: "ok",
			detail: `Spawn command: ${resolved}`,
		};
	}

	if (configuredPath.trim()) {
		let detail = `Configured endpoint ${configuredPath.trim()} is missing or not executable.`;
		try {
			await stat(configuredPath.trim());
			detail = `Configured endpoint ${configuredPath.trim()} exists but is not executable.`;
		} catch {
			/* use missing message */
		}
		return {
			id: "endpoint",
			label: "ACP endpoint",
			status: "error",
			detail,
			suggestion:
				"Fix the Path below or click Auto-detect. Agent Client calls this binary directly — there is no `agy acp` subcommand.",
		};
	}

	return {
		id: "endpoint",
		label: "ACP endpoint",
		status: "warning",
		detail: "No path configured; chat will spawn an empty command until you set Path or click Auto-detect.",
		suggestion: "Click Auto-detect to fill the bridge path before starting a chat.",
	};
}

async function checkHarness(
	configuredPath: string,
	env?: Record<string, string>,
): Promise<AntigravityHealthCheck> {
	const bridge = await resolveAntigravitySpawnBridge(configuredPath);
	const resolved = await resolveAntigravityCompanionPath(bridge, env ?? {});
	if (resolved) {
		return {
			id: "harness",
			label: "Local harness",
			status: "ok",
			detail: `Found ${ANTIGRAVITY_HARNESS_FILENAME} at ${resolved}`,
		};
	}

	const probed = getAntigravityCompanionCandidates(bridge, env ?? {})
		.slice(0, 3)
		.join(", ");
	return {
		id: "harness",
		label: "Local harness",
		status: "error",
		detail: `${ANTIGRAVITY_HARNESS_FILENAME} not found. Probed: ${probed}`,
		suggestion:
			"Install the zip sibling localharness_external next to agy_acp_server.par, or set ANTIGRAVITY_HARNESS_PATH to that binary. The ACP bridge alone is not enough for session/new.",
	};
}

function overallStatus(
	checks: AntigravityHealthCheck[],
): AntigravityHealthLevel {
	if (checks.some((c) => c.status === "error")) return "error";
	if (checks.some((c) => c.status === "warning")) return "warning";
	return "ok";
}

/** Run Antigravity health checks for the settings UI. */
export async function checkAntigravityHealth(
	configuredPath: string,
	options: AntigravityHealthOptions = {},
): Promise<AntigravityHealthReport> {
	const env = options.env;
	const [bridge, auth, endpoint, harness] = await Promise.all([
		checkBridge(configuredPath),
		checkAuth(env),
		checkEndpoint(configuredPath),
		checkHarness(configuredPath, env),
	]);
	const checks = [bridge, auth, endpoint, harness];
	const resolved = await resolveAntigravitySpawnBridge(configuredPath);
	return {
		overall: overallStatus(checks),
		checks,
		endpoint: resolved ?? (configuredPath.trim() || "(unresolved)"),
	};
}

/** Note shown when mcp_config.json is empty — intentional for Antigravity. */
export async function getAntigravityMcpConfigNote(): Promise<string | null> {
	const path = getAntigravityMcpConfigPath();
	if (!(await fileExists(path))) {
		return null;
	}
	try {
		const raw = await readFile(path, "utf8");
		const trimmed = raw.trim();
		if (
			trimmed === "" ||
			trimmed === "{}" ||
			trimmed === '{"mcpServers":{}}'
		) {
			return "Empty ~/.gemini/config/mcp_config.json is intentional — Antigravity manages MCP separately.";
		}
	} catch {
		return null;
	}
	return null;
}
