import { describe, it, expect } from "vitest";
import {
	classifyAntigravityAuth,
	extractAcpAuthMethod,
	gatherAntigravityAuthSignals,
	type AntigravityAuthIo,
	type AntigravityAuthSignals,
} from "../src/harnesses/antigravity/auth";
import {
	getAntigravityAcpSettingsPath,
	getAntigravityAcpTokenPath,
	getAntigravityCliSettingsPath,
	getAntigravityOAuthTokenPath,
} from "../src/harnesses/antigravity/paths";

function signals(
	overrides: Partial<AntigravityAuthSignals> = {},
): AntigravityAuthSignals {
	return {
		acpSettingsExists: false,
		acpTokenExists: false,
		acpAuthMethod: null,
		cliSettingsExists: false,
		cliOAuthTokenExists: false,
		cliModelProvider: null,
		geminiApiKeySet: false,
		...overrides,
	};
}

function fakeIo(files: Record<string, string | true>): AntigravityAuthIo {
	return {
		fileExists: async (path) => path in files,
		readJson: async (path) => {
			const value = files[path];
			if (typeof value !== "string") return null;
			return JSON.parse(value) as Record<string, unknown>;
		},
	};
}

describe("extractAcpAuthMethod", () => {
	it("reads selectedAuthType", () => {
		expect(
			extractAcpAuthMethod({ selectedAuthType: "oauth-personal" }),
		).toBe("oauth-personal");
	});

	it("reads nested security.auth.selectedType", () => {
		expect(
			extractAcpAuthMethod({
				security: { auth: { selectedType: "gemini-api-key" } },
			}),
		).toBe("gemini-api-key");
	});

	it("finds oauth-personal nested in an unknown shape", () => {
		expect(
			extractAcpAuthMethod({ extra: { mode: "oauth-personal" } }),
		).toBe("oauth-personal");
	});

	it("returns null for empty settings", () => {
		expect(extractAcpAuthMethod(null)).toBeNull();
		expect(extractAcpAuthMethod({})).toBeNull();
	});
});

describe("classifyAntigravityAuth", () => {
	it("treats ACP settings + oauth-personal as ready and skips session authenticate", () => {
		const result = classifyAntigravityAuth(
			signals({
				acpSettingsExists: true,
				acpTokenExists: true,
				acpAuthMethod: "oauth-personal",
			}),
		);
		expect(result.health.status).toBe("ok");
		expect(result.health.detail).toMatch(/antigravity-acp/);
		expect(result.health.detail).toMatch(/oauth-personal/);
		expect(result.sessionAuthMethod).toBeUndefined();
	});

	it("is ok when only ACP settings.json exists", () => {
		const result = classifyAntigravityAuth(
			signals({ acpSettingsExists: true }),
		);
		expect(result.health.status).toBe("ok");
		expect(result.sessionAuthMethod).toBeUndefined();
	});

	it("is ok when only acp_token.json exists", () => {
		const result = classifyAntigravityAuth(
			signals({ acpTokenExists: true }),
		);
		expect(result.health.status).toBe("ok");
		expect(result.sessionAuthMethod).toBeUndefined();
	});

	it("does not force gemini-api-key when ACP OAuth and GEMINI_API_KEY both exist", () => {
		const result = classifyAntigravityAuth(
			signals({
				acpSettingsExists: true,
				acpAuthMethod: "oauth-personal",
				geminiApiKeySet: true,
			}),
		);
		expect(result.sessionAuthMethod).toBeUndefined();
		expect(result.health.status).toBe("ok");
	});

	it("notes an unsigned CLI store without failing health", () => {
		const result = classifyAntigravityAuth(
			signals({
				acpSettingsExists: true,
				acpAuthMethod: "oauth-personal",
			}),
		);
		expect(result.health.status).toBe("ok");
		expect(result.health.detail).toMatch(/antigravity-cli/);
	});

	it("uses gemini-api-key when ACP settings select that method", () => {
		const result = classifyAntigravityAuth(
			signals({
				acpSettingsExists: true,
				acpAuthMethod: "gemini-api-key",
				geminiApiKeySet: true,
			}),
		);
		expect(result.sessionAuthMethod).toBe("gemini-api-key");
		expect(result.health.status).toBe("ok");
	});

	it("authenticates with gemini-api-key for CLI API-key mode", () => {
		const result = classifyAntigravityAuth(
			signals({
				cliSettingsExists: true,
				cliModelProvider: "gemini",
				geminiApiKeySet: true,
			}),
		);
		expect(result.health.status).toBe("ok");
		expect(result.sessionAuthMethod).toBe("gemini-api-key");
	});

	it("errors when CLI API-key mode has no GEMINI_API_KEY", () => {
		const result = classifyAntigravityAuth(
			signals({
				cliSettingsExists: true,
				cliModelProvider: "gemini",
			}),
		);
		expect(result.health.status).toBe("error");
		expect(result.sessionAuthMethod).toBeUndefined();
		expect(result.health.suggestion).toMatch(/antigravity-acp/);
	});

	it("uses GEMINI_API_KEY alone when no ACP store exists", () => {
		const result = classifyAntigravityAuth(
			signals({ geminiApiKeySet: true }),
		);
		expect(result.sessionAuthMethod).toBe("gemini-api-key");
		expect(result.health.status).toBe("ok");
	});

	it("warns when only the CLI OAuth token exists", () => {
		const result = classifyAntigravityAuth(
			signals({ cliOAuthTokenExists: true }),
		);
		expect(result.health.status).toBe("warning");
		expect(result.health.detail).toMatch(/antigravity-acp/);
		expect(result.sessionAuthMethod).toBeUndefined();
	});

	it("errors when no store is present and does not default to gemini-api-key", () => {
		const result = classifyAntigravityAuth(signals());
		expect(result.health.status).toBe("error");
		expect(result.health.detail).toMatch(/antigravity-acp/);
		expect(result.health.suggestion).not.toMatch(/run `agy`/i);
		expect(result.sessionAuthMethod).toBeUndefined();
	});
});

describe("gatherAntigravityAuthSignals", () => {
	it("reads ACP settings and token through the io adapter", async () => {
		const io = fakeIo({
			[getAntigravityAcpSettingsPath()]: JSON.stringify({
				selectedAuthType: "oauth-personal",
			}),
			[getAntigravityAcpTokenPath()]: true,
		});
		const gathered = await gatherAntigravityAuthSignals(io, {});
		expect(gathered.acpSettingsExists).toBe(true);
		expect(gathered.acpTokenExists).toBe(true);
		expect(gathered.acpAuthMethod).toBe("oauth-personal");
		expect(gathered.cliSettingsExists).toBe(false);
		expect(gathered.geminiApiKeySet).toBe(false);
	});

	it("reads CLI settings and env key", async () => {
		const io = fakeIo({
			[getAntigravityCliSettingsPath()]: JSON.stringify({
				modelProvider: "gemini",
			}),
			[getAntigravityOAuthTokenPath()]: true,
		});
		const gathered = await gatherAntigravityAuthSignals(io, {
			GEMINI_API_KEY: "test-key",
		});
		expect(gathered.cliSettingsExists).toBe(true);
		expect(gathered.cliModelProvider).toBe("gemini");
		expect(gathered.cliOAuthTokenExists).toBe(true);
		expect(gathered.geminiApiKeySet).toBe(true);
	});
});
