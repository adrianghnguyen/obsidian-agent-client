/**
 * Antigravity preset health checks for Settings → Agent Client.
 *
 * Probes the ACP bridge binary, Antigravity auth signals under ~/.gemini/,
 * and the configured spawn endpoint. Does not spawn the bridge (too slow).
 */

import { access, readFile, stat } from "fs/promises";
import { constants } from "fs";
import {
	getAntigravityBridgeCandidates,
	getAntigravityCliSettingsPath,
	getAntigravityMcpConfigPath,
	getAntigravityOAuthTokenPath,
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

async function readJsonFile(path: string): Promise<Record<string, unknown> | null> {
	try {
		const raw = await readFile(path, "utf8");
		const parsed = JSON.parse(raw) as unknown;
		return parsed && typeof parsed === "object"
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

async function checkBridge(configuredPath: string): Promise<AntigravityHealthCheck> {
	const resolved = await resolveAntigravityBridgeForSpawn(configuredPath);
	if (resolved) {
		return {
			id: "bridge",
			label: "ACP bridge",
			status: "ok",
			detail: `Found agy_acp_server.par at ${resolved}`,
		};
	}

	const candidates = getAntigravityBridgeCandidates();
	const probed = candidates.slice(0, 3).join(", ");
	return {
		id: "bridge",
		label: "ACP bridge",
		status: "error",
		detail: `agy_acp_server.par not found. Probed: ${probed}${candidates.length > 3 ? ", …" : ""}`,
		suggestion:
			"Install the Antigravity ACP bridge from the ACP Registry (Zed: Agents → Antigravity) or copy agy_acp_server.par into ~/Library/agy-acp-server/ on macOS, then click Auto-detect.",
	};
}

async function checkAuth(): Promise<AntigravityHealthCheck> {
	const oauthPath = getAntigravityOAuthTokenPath();
	if (await fileExists(oauthPath)) {
		return {
			id: "auth",
			label: "Authentication",
			status: "ok",
			detail: "OAuth token file present (~/.gemini/antigravity-cli/).",
		};
	}

	const settings = await readJsonFile(getAntigravityCliSettingsPath());
	const modelProvider =
		typeof settings?.modelProvider === "string"
			? settings.modelProvider.trim().toLowerCase()
			: "";

	if (modelProvider === "gemini") {
		const hasKey = Boolean(process.env.GEMINI_API_KEY?.trim());
		if (hasKey) {
			return {
				id: "auth",
				label: "Authentication",
				status: "ok",
				detail: "Gemini API key mode (modelProvider=gemini, GEMINI_API_KEY set).",
			};
		}
		return {
			id: "auth",
			label: "Authentication",
			status: "error",
			detail:
				"settings.json uses modelProvider=gemini but GEMINI_API_KEY is not set in this environment.",
			suggestion:
				"Export GEMINI_API_KEY in your shell profile, or remove modelProvider from ~/.gemini/antigravity-cli/settings.json and run `agy` in Terminal to sign in with your Google account.",
		};
	}

	if (settings) {
		return {
			id: "auth",
			label: "Authentication",
			status: "warning",
			detail:
				"Antigravity CLI settings exist; account auth is stored in your OS keychain (not readable from Obsidian).",
			suggestion:
				"Run `agy` once in Terminal and complete sign-in if you have not already. Empty ~/.gemini/config/mcp_config.json is normal.",
		};
	}

	return {
		id: "auth",
		label: "Authentication",
		status: "error",
		detail: "No Antigravity auth detected under ~/.gemini/antigravity-cli/.",
		suggestion:
			"Run `agy` in Terminal and sign in with your Google account, or configure Gemini API key mode per the Antigravity setup guide.",
	};
}

async function checkEndpoint(configuredPath: string): Promise<AntigravityHealthCheck> {
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
		suggestion: "Click Auto-detect to fill the bridge path before starting a chat.",
	};
}

function overallStatus(checks: AntigravityHealthCheck[]): AntigravityHealthLevel {
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
		if (trimmed === "" || trimmed === "{}" || trimmed === '{"mcpServers":{}}') {
			return "Empty ~/.gemini/config/mcp_config.json is intentional — Antigravity manages MCP separately.";
		}
	} catch {
		return null;
	}
	return null;
}
