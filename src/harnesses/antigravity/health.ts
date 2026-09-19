/**
 * Antigravity preset health checks for Settings → Agent Client.
 *
 * Probes the ACP bridge binary, Antigravity auth signals under ~/.gemini/,
 * and the configured spawn endpoint. Does not spawn the bridge (too slow).
 */

import { access, readFile, stat } from "fs/promises";
import { constants } from "fs";
import { basename } from "path";
import { classifyAntigravityAuth, gatherAntigravityAuthSignals } from "./auth";
import {
	getAntigravityBridgeCandidates,
	getAntigravityBridgeFilename,
	getAntigravityMcpConfigPath,
	resolveAntigravityBridgeForSpawn,
} from "./paths";

export type AntigravityHealthLevel = "ok" | "warning" | "error";

export interface AntigravityHealthCheck {
	id: "bridge" | "auth" | "endpoint";
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
	const resolved = await resolveAntigravityBridgeForSpawn(configuredPath);
	if (resolved) {
		return {
			id: "bridge",
			label: "ACP bridge",
			status: "ok",
			detail: `Found ${basename(resolved)} at ${resolved}`,
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

async function checkAuth(): Promise<AntigravityHealthCheck> {
	const classification = classifyAntigravityAuth(
		await gatherAntigravityAuthSignals(),
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
	const endpoint =
		configuredPath.trim() || "(not configured — auto-detect on connect)";
	const resolved = await resolveAntigravityBridgeForSpawn(configuredPath);

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
		detail: `No path configured; will probe ${endpoint} on connect.`,
		suggestion:
			"Click Auto-detect to fill the bridge path before starting a chat.",
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
): Promise<AntigravityHealthReport> {
	const [bridge, auth, endpoint] = await Promise.all([
		checkBridge(configuredPath),
		checkAuth(),
		checkEndpoint(configuredPath),
	]);
	const checks = [bridge, auth, endpoint];
	const resolved = await resolveAntigravityBridgeForSpawn(configuredPath);
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
