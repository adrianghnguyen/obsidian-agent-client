/**
 * Platform paths for the Antigravity ACP bridge.
 *
 * The `agy` CLI has no `acp` subcommand — Agent Client spawns the bridge
 * binary directly. macOS/Linux use agy_acp_server.par; Windows uses
 * agy_acp_server.exe. macOS ACP Registry installs land under
 * ~/Library/agy-acp-server/; Linux/Windows follow the same layout pattern.
 */

import { access, stat } from "fs/promises";
import { constants } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { Platform } from "obsidian";

export const ANTIGRAVITY_PRESET_ID = "antigravity";
export const ANTIGRAVITY_BRIDGE_PAR = "agy_acp_server.par";
export const ANTIGRAVITY_BRIDGE_EXE = "agy_acp_server.exe";
/** Zip sibling required for session/new unless ANTIGRAVITY_HARNESS_PATH is set. */
export const ANTIGRAVITY_HARNESS_FILENAME = "localharness_external";
/** ACP authenticate method for GEMINI_API_KEY mode (already in spawn env). */
export const ANTIGRAVITY_SESSION_AUTH_METHOD = "gemini-api-key";

/** Current-platform bridge basename (.exe on Windows, .par elsewhere). */
export function getAntigravityBridgeFilename(): string {
	return Platform.isWin ? ANTIGRAVITY_BRIDGE_EXE : ANTIGRAVITY_BRIDGE_PAR;
}

/** Legacy alias for the macOS/Linux basename. Prefer getAntigravityBridgeFilename(). */
export const ANTIGRAVITY_BRIDGE_FILENAME = ANTIGRAVITY_BRIDGE_PAR;

const home = (): string =>
	process.env.HOME || process.env.USERPROFILE || homedir();

/** Candidate bridge paths in probe order (AGY_ACP_BIN first when set). */
export function getAntigravityBridgeCandidates(): string[] {
	const candidates: string[] = [];
	const agyAcpBin = process.env.AGY_ACP_BIN?.trim();
	if (agyAcpBin) {
		candidates.push(agyAcpBin);
	}

	if (Platform.isMacOS) {
		candidates.push(
			join(home(), "Library", "agy-acp-server", ANTIGRAVITY_BRIDGE_PAR),
		);
	} else if (Platform.isWin) {
		const localAppData =
			process.env.LOCALAPPDATA ?? join(home(), "AppData", "Local");
		candidates.push(
			join(localAppData, "agy-acp-server", ANTIGRAVITY_BRIDGE_EXE),
			join(localAppData, "agy-acp-server", ANTIGRAVITY_BRIDGE_PAR),
		);
	} else {
		candidates.push(
			join(home(), ".local", "bin", ANTIGRAVITY_BRIDGE_PAR),
			join(
				home(),
				".local",
				"opt",
				"agy-acp",
				"current",
				ANTIGRAVITY_BRIDGE_PAR,
			),
		);
	}

	return [...new Set(candidates)];
}

/** Default bridge path shown in settings before auto-detect runs. */
export function getDefaultAntigravityBridgePath(): string {
	return (
		getAntigravityBridgeCandidates()[0] ?? getAntigravityBridgeFilename()
	);
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

/**
 * Bridge path the settings command will actually spawn.
 * Does not fall back when a configured path is set but missing — spawn
 * uses `preset.command` as-is, so health must not report a different binary.
 */
export async function resolveAntigravitySpawnBridge(
	configuredPath: string,
): Promise<string | null> {
	const trimmed = configuredPath.trim();
	if (trimmed.length > 0) {
		return (await isExecutableBridge(trimmed)) ? trimmed : null;
	}
	return resolveAntigravityBridgePath();
}

/** Companion binary candidates: env override, sibling of the .par, ~/.local/bin. */
export function getAntigravityCompanionCandidates(
	bridgePath: string | null,
	env: Record<string, string> = {},
): string[] {
	const candidates: string[] = [];
	const fromEnv =
		env.ANTIGRAVITY_HARNESS_PATH?.trim() ||
		process.env.ANTIGRAVITY_HARNESS_PATH?.trim();
	if (fromEnv) {
		candidates.push(fromEnv);
	}
	if (bridgePath?.trim()) {
		candidates.push(join(dirname(bridgePath), ANTIGRAVITY_HARNESS_FILENAME));
	}
	candidates.push(join(home(), ".local", "bin", ANTIGRAVITY_HARNESS_FILENAME));
	return [...new Set(candidates)];
}

export async function resolveAntigravityCompanionPath(
	bridgePath: string | null,
	env: Record<string, string> = {},
): Promise<string | null> {
	for (const candidate of getAntigravityCompanionCandidates(bridgePath, env)) {
		if (await isExecutableBridge(candidate)) {
			return candidate;
		}
	}
	return null;
}

export function hasGeminiApiKey(
	env: Record<string, string> | undefined,
): boolean {
	return Boolean(
		env?.GEMINI_API_KEY?.trim() || process.env.GEMINI_API_KEY?.trim(),
	);
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

/** Official ACP OAuth store (~/.gemini/antigravity-acp/). */
export function getAntigravityAcpDir(): string {
	return join(home(), ".gemini", "antigravity-acp");
}

export function getAntigravityAcpSettingsPath(): string {
	return join(getAntigravityAcpDir(), "settings.json");
}

export function getAntigravityAcpTokenPath(): string {
	return join(getAntigravityAcpDir(), "acp_token.json");
}

export function getAntigravityMcpConfigPath(): string {
	return join(home(), ".gemini", "config", "mcp_config.json");
}
