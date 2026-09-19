/**
 * Platform paths for the Antigravity ACP bridge (agy_acp_server.par).
 *
 * The `agy` CLI has no `acp` subcommand — Agent Client spawns the bridge
 * binary directly. macOS ACP Registry installs land under
 * ~/Library/agy-acp-server/; Linux/Windows follow the same layout pattern.
 */

import { access, stat } from "fs/promises";
import { constants } from "fs";
import { homedir } from "os";
import { join } from "path";
import { Platform } from "obsidian";

export const ANTIGRAVITY_PRESET_ID = "antigravity";
export const ANTIGRAVITY_BRIDGE_FILENAME = "agy_acp_server.par";
/** ACP authenticate method for GEMINI_API_KEY mode (already in spawn env). */
export const ANTIGRAVITY_SESSION_AUTH_METHOD = "gemini-api-key";

const home = (): string => process.env.HOME || process.env.USERPROFILE || homedir();

/** Candidate bridge paths in probe order (AGY_ACP_BIN first when set). */
export function getAntigravityBridgeCandidates(): string[] {
	const candidates: string[] = [];
	const agyAcpBin = process.env.AGY_ACP_BIN?.trim();
	if (agyAcpBin) {
		candidates.push(agyAcpBin);
	}

	if (Platform.isMacOS) {
		candidates.push(
			join(home(), "Library", "agy-acp-server", ANTIGRAVITY_BRIDGE_FILENAME),
		);
	} else if (Platform.isWin) {
		const localAppData =
			process.env.LOCALAPPDATA ?? join(home(), "AppData", "Local");
		candidates.push(
			join(localAppData, "agy-acp-server", ANTIGRAVITY_BRIDGE_FILENAME),
		);
	} else {
		candidates.push(
			join(home(), ".local", "bin", ANTIGRAVITY_BRIDGE_FILENAME),
			join(
				home(),
				".local",
				"opt",
				"agy-acp",
				"current",
				ANTIGRAVITY_BRIDGE_FILENAME,
			),
		);
	}

	return [...new Set(candidates)];
}

/** Default bridge path shown in settings before auto-detect runs. */
export function getDefaultAntigravityBridgePath(): string {
	return getAntigravityBridgeCandidates()[0] ?? ANTIGRAVITY_BRIDGE_FILENAME;
}

async function isExecutableBridge(path: string): Promise<boolean> {
	try {
		const st = await stat(path);
		if (!st.isFile()) return false;
		await access(path, constants.X_OK);
		return true;
	} catch {
		try {
			const st = await stat(path);
			return st.isFile();
		} catch {
			return false;
		}
	}
}

/** Resolve the first existing bridge binary from platform candidates. */
export async function resolveAntigravityBridgePath(): Promise<string | null> {
	for (const candidate of getAntigravityBridgeCandidates()) {
		if (await isExecutableBridge(candidate)) {
			return candidate;
		}
	}
	return null;
}

/** Resolve a configured path, or fall back to platform auto-detect. */
export async function resolveAntigravityBridgeForSpawn(
	configuredPath: string,
): Promise<string | null> {
	const trimmed = configuredPath.trim();
	if (trimmed.length > 0 && (await isExecutableBridge(trimmed))) {
		return trimmed;
	}
	return resolveAntigravityBridgePath();
}

/** Antigravity CLI config root (~/.gemini/ — not ~/.antigravity/). */
export function getAntigravityGeminiConfigDir(): string {
	return join(home(), ".gemini");
}

export function getAntigravityCliSettingsPath(): string {
	return join(home(), ".gemini", "antigravity-cli", "settings.json");
}

export function getAntigravityOAuthTokenPath(): string {
	return join(
		home(),
		".gemini",
		"antigravity-cli",
		"antigravity-oauth-token",
	);
}

export function getAntigravityMcpConfigPath(): string {
	return join(home(), ".gemini", "config", "mcp_config.json");
}
