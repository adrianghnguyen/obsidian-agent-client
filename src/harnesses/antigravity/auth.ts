/**
 * Antigravity auth store classification.
 *
 * Official ACP OAuth lives in ~/.gemini/antigravity-acp/ (settings.json +
 * acp_token.json). The CLI store under antigravity-cli/ is a separate login
 * used by `agy`, not what Agent Client needs to start a chat.
 */

import { access, readFile } from "fs/promises";
import { constants } from "fs";
import {
	ANTIGRAVITY_SESSION_AUTH_METHOD,
	getAntigravityAcpSettingsPath,
	getAntigravityAcpTokenPath,
	getAntigravityCliSettingsPath,
	getAntigravityOAuthTokenPath,
} from "./paths";

export const ANTIGRAVITY_OAUTH_PERSONAL = "oauth-personal";

export interface AntigravityAuthIo {
	fileExists(path: string): Promise<boolean>;
	readJson(path: string): Promise<Record<string, unknown> | null>;
}

export interface AntigravityAuthSignals {
	acpSettingsExists: boolean;
	acpTokenExists: boolean;
	acpAuthMethod: string | null;
	cliSettingsExists: boolean;
	cliOAuthTokenExists: boolean;
	cliModelProvider: string | null;
	geminiApiKeySet: boolean;
}

export interface AntigravityAuthHealth {
	status: "ok" | "warning" | "error";
	detail: string;
	suggestion?: string;
}

export interface AntigravityAuthClassification {
	health: AntigravityAuthHealth;
	/** ACP authenticate method before session/new, or skip when undefined. */
	sessionAuthMethod: string | undefined;
}

const KNOWN_AUTH_METHODS = new Set([
	ANTIGRAVITY_OAUTH_PERSONAL,
	ANTIGRAVITY_SESSION_AUTH_METHOD,
]);

export function defaultAntigravityAuthIo(): AntigravityAuthIo {
	return {
		fileExists: async (path: string) => {
			try {
				await access(path, constants.F_OK);
				return true;
			} catch {
				return false;
			}
		},
		readJson: async (path: string) => {
			try {
				const raw = await readFile(path, "utf8");
				const parsed = JSON.parse(raw) as unknown;
				return parsed && typeof parsed === "object"
					? (parsed as Record<string, unknown>)
					: null;
			} catch {
				return null;
			}
		},
	};
}

function nestedValue(
	obj: Record<string, unknown>,
	keys: readonly string[],
): unknown {
	let current: unknown = obj;
	for (const key of keys) {
		if (!current || typeof current !== "object") return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

function asKnownAuthMethod(value: unknown): string | null {
	if (typeof value !== "string") return null;
	const normalized = value.trim().toLowerCase();
	return KNOWN_AUTH_METHODS.has(normalized) ? normalized : null;
}

function findAuthMethodInObject(value: unknown, depth = 0): string | null {
	if (depth > 6) return null;
	const direct = asKnownAuthMethod(value);
	if (direct) return direct;
	if (!value || typeof value !== "object") return null;
	if (Array.isArray(value)) {
		for (const item of value) {
			const found = findAuthMethodInObject(item, depth + 1);
			if (found) return found;
		}
		return null;
	}
	for (const nested of Object.values(value as Record<string, unknown>)) {
		const found = findAuthMethodInObject(nested, depth + 1);
		if (found) return found;
	}
	return null;
}

/** Read selected ACP auth method from antigravity-acp/settings.json. */
export function extractAcpAuthMethod(
	settings: Record<string, unknown> | null,
): string | null {
	if (!settings) return null;
	const candidates: unknown[] = [
		settings.selectedAuthType,
		settings.authType,
		settings.selectedType,
		nestedValue(settings, ["security", "auth", "selectedType"]),
		nestedValue(settings, ["security", "auth", "selectedAuthType"]),
		nestedValue(settings, ["auth", "selectedType"]),
		nestedValue(settings, ["auth", "selectedAuthType"]),
	];
	for (const candidate of candidates) {
		const method = asKnownAuthMethod(candidate);
		if (method) return method;
	}
	return findAuthMethodInObject(settings);
}

function cliModelProvider(
	settings: Record<string, unknown> | null,
): string | null {
	if (typeof settings?.modelProvider !== "string") return null;
	const value = settings.modelProvider.trim().toLowerCase();
	return value.length > 0 ? value : null;
}

export async function gatherAntigravityAuthSignals(
	io?: AntigravityAuthIo,
	env: NodeJS.ProcessEnv = process.env,
): Promise<AntigravityAuthSignals> {
	const fs = io ?? defaultAntigravityAuthIo();
	const acpSettingsPath = getAntigravityAcpSettingsPath();
	const cliSettingsPath = getAntigravityCliSettingsPath();
	const [acpSettingsExists, acpTokenExists, cliOAuthTokenExists] =
		await Promise.all([
			fs.fileExists(acpSettingsPath),
			fs.fileExists(getAntigravityAcpTokenPath()),
			fs.fileExists(getAntigravityOAuthTokenPath()),
		]);
	const [acpSettings, cliSettings] = await Promise.all([
		acpSettingsExists
			? fs.readJson(acpSettingsPath)
			: Promise.resolve(null),
		fs.readJson(cliSettingsPath),
	]);
	return {
		acpSettingsExists,
		acpTokenExists,
		acpAuthMethod: extractAcpAuthMethod(acpSettings),
		cliSettingsExists: cliSettings !== null,
		cliOAuthTokenExists,
		cliModelProvider: cliModelProvider(cliSettings),
		geminiApiKeySet: Boolean(env.GEMINI_API_KEY?.trim()),
	};
}

function hasAcpStore(signals: AntigravityAuthSignals): boolean {
	return signals.acpSettingsExists || signals.acpTokenExists;
}

function cliUnsignedNote(signals: AntigravityAuthSignals): string {
	if (
		signals.cliOAuthTokenExists ||
		signals.cliSettingsExists ||
		signals.cliModelProvider
	) {
		return "";
	}
	return " CLI store (~/.gemini/antigravity-cli/) is unsigned — not required for Agent Client.";
}

function apiKeyHealth(
	signals: AntigravityAuthSignals,
): AntigravityAuthClassification["health"] {
	if (signals.geminiApiKeySet) {
		return {
			status: "ok",
			detail: "Gemini API key mode (GEMINI_API_KEY set). ACP OAuth store not used.",
		};
	}
	return {
		status: "error",
		detail: "Antigravity is in Gemini API key mode but GEMINI_API_KEY is not set in this environment.",
		suggestion:
			"Export GEMINI_API_KEY in your shell profile, or complete Google login so ~/.gemini/antigravity-acp/settings.json exists.",
	};
}

/** Classify health row + session authenticate method from gathered signals. */
export function classifyAntigravityAuth(
	signals: AntigravityAuthSignals,
): AntigravityAuthClassification {
	if (signals.acpAuthMethod === ANTIGRAVITY_SESSION_AUTH_METHOD) {
		return {
			health: apiKeyHealth(signals),
			sessionAuthMethod: ANTIGRAVITY_SESSION_AUTH_METHOD,
		};
	}

	if (hasAcpStore(signals)) {
		const parts = ["ACP OAuth in ~/.gemini/antigravity-acp/"];
		if (signals.acpAuthMethod) {
			parts.push(`(${signals.acpAuthMethod})`);
		}
		if (signals.acpTokenExists) {
			parts.push("acp_token.json present.");
		}
		const note = cliUnsignedNote(signals);
		if (note) parts.push(note.trim());
		return {
			health: {
				status: "ok",
				detail: parts.join(" "),
			},
			sessionAuthMethod: undefined,
		};
	}

	if (signals.cliOAuthTokenExists) {
		return {
			health: {
				status: "warning",
				detail: "CLI OAuth token present (~/.gemini/antigravity-cli/), but official ACP auth lives in ~/.gemini/antigravity-acp/.",
				suggestion:
					"Sign in through the Antigravity ACP bridge so antigravity-acp/settings.json and acp_token.json exist. `agy` login only fills the CLI store.",
			},
			sessionAuthMethod: undefined,
		};
	}

	if (signals.cliModelProvider === "gemini") {
		const health = apiKeyHealth(signals);
		return {
			health,
			sessionAuthMethod:
				health.status === "error"
					? undefined
					: ANTIGRAVITY_SESSION_AUTH_METHOD,
		};
	}

	if (signals.geminiApiKeySet) {
		return {
			health: {
				status: "ok",
				detail: "GEMINI_API_KEY is set in this environment.",
			},
			sessionAuthMethod: ANTIGRAVITY_SESSION_AUTH_METHOD,
		};
	}

	if (signals.cliSettingsExists) {
		return {
			health: {
				status: "warning",
				detail: "Antigravity CLI settings exist; official ACP auth was not found under ~/.gemini/antigravity-acp/.",
				suggestion:
					"Complete Google login via the ACP bridge so antigravity-acp/settings.json exists. Running `agy` alone is not enough for Agent Client.",
			},
			sessionAuthMethod: undefined,
		};
	}

	return {
		health: {
			status: "error",
			detail: "No Antigravity ACP auth detected under ~/.gemini/antigravity-acp/.",
			suggestion:
				"Sign in with your Google account so ~/.gemini/antigravity-acp/settings.json (and acp_token.json) exist, or set GEMINI_API_KEY for API-key mode.",
		},
		sessionAuthMethod: undefined,
	};
}

/** Resolve authenticate methodId for session/new, or skip when OAuth is on disk. */
export async function resolveAntigravitySessionAuthMethod(
	io?: AntigravityAuthIo,
	env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
	const signals = await gatherAntigravityAuthSignals(
		io ?? defaultAntigravityAuthIo(),
		env,
	);
	return classifyAntigravityAuth(signals).sessionAuthMethod;
}
