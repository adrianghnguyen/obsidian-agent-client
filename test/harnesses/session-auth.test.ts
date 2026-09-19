import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { access, readFile } from "fs/promises";
import {
	getAuthenticateBeforeNewSession,
	openHarnessSession,
} from "../../src/harnesses";
import { ANTIGRAVITY_SESSION_AUTH_METHOD } from "../../src/harnesses/antigravity";
import {
	classifyAntigravityAuth,
	gatherAntigravityAuthSignals,
	type AntigravityAuthIo,
} from "../../src/harnesses/antigravity/auth";
import {
	getAntigravityAcpSettingsPath,
	getAntigravityAcpTokenPath,
} from "../../src/harnesses/antigravity/paths";

vi.mock("fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("fs/promises")>();
	return {
		...actual,
		access: vi.fn(),
		readFile: vi.fn(),
	};
});

const mockedAccess = vi.mocked(access);
const mockedReadFile = vi.mocked(readFile);

function rejectMissing(): never {
	throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
}

function makeClient() {
	const calls: string[] = [];
	return {
		calls,
		initialize: vi.fn(async () => {
			calls.push("initialize");
		}),
		authenticate: vi.fn(async (methodId: string) => {
			calls.push(`authenticate:${methodId}`);
			return true;
		}),
		newSession: vi.fn(async (cwd: string) => {
			calls.push("session/new");
			return { sessionId: "sess-1", cwd };
		}),
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

describe("openHarnessSession", () => {
	const originalGemini = process.env.GEMINI_API_KEY;

	beforeEach(() => {
		mockedAccess.mockImplementation(async () => rejectMissing());
		mockedReadFile.mockImplementation(async () => rejectMissing());
	});

	afterEach(() => {
		if (originalGemini === undefined) {
			delete process.env.GEMINI_API_KEY;
		} else {
			process.env.GEMINI_API_KEY = originalGemini;
		}
		vi.clearAllMocks();
	});

	it("exposes a resolver on Antigravity only", () => {
		expect(getAuthenticateBeforeNewSession("antigravity")).toEqual(
			expect.any(Function),
		);
		expect(ANTIGRAVITY_SESSION_AUTH_METHOD).toBe("gemini-api-key");
		expect(getAuthenticateBeforeNewSession("cursor")).toBeUndefined();
		expect(
			getAuthenticateBeforeNewSession("claude-code-acp"),
		).toBeUndefined();
		expect(getAuthenticateBeforeNewSession("gemini-cli")).toBeUndefined();
	});

	it("skips authenticate when no ACP store and no API key", async () => {
		delete process.env.GEMINI_API_KEY;
		const client = makeClient();
		await client.initialize();
		const result = await openHarnessSession(
			"antigravity",
			"/vault",
			client,
		);
		expect(result).toEqual({ sessionId: "sess-1", cwd: "/vault" });
		expect(client.calls).toEqual(["initialize", "session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("authenticates Antigravity with gemini-api-key when only the env key is set", async () => {
		process.env.GEMINI_API_KEY = "test-key";
		const client = makeClient();
		await client.initialize();
		await openHarnessSession("antigravity", "/vault", client);
		expect(client.calls).toEqual([
			"initialize",
			"authenticate:gemini-api-key",
			"session/new",
		]);
		expect(client.authenticate).toHaveBeenCalledWith("gemini-api-key");
	});

	it("does not authenticate Cursor before session/new", async () => {
		const client = makeClient();
		await client.initialize();
		await openHarnessSession("cursor", "/vault", client);
		expect(client.calls).toEqual(["initialize", "session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
		expect(client.newSession).toHaveBeenCalledOnce();
	});

	it("does not authenticate other presets before session/new", async () => {
		const client = makeClient();
		await client.initialize();
		await openHarnessSession("claude-code-acp", "/vault", client);
		expect(client.calls).toEqual(["initialize", "session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("does not call session/new when API-key authenticate fails", async () => {
		process.env.GEMINI_API_KEY = "test-key";
		const client = makeClient();
		client.authenticate.mockImplementation(async (methodId: string) => {
			client.calls.push(`authenticate:${methodId}`);
			return false;
		});
		await client.initialize();
		await expect(
			openHarnessSession("antigravity", "/vault", client),
		).rejects.toThrow("Authentication required");
		expect(client.calls).toEqual([
			"initialize",
			"authenticate:gemini-api-key",
		]);
		expect(client.newSession).not.toHaveBeenCalled();
	});

	it("skips authenticate when ACP OAuth files are present even if GEMINI_API_KEY is set", async () => {
		process.env.GEMINI_API_KEY = "test-key";
		const settingsPath = getAntigravityAcpSettingsPath();
		const tokenPath = getAntigravityAcpTokenPath();
		mockedAccess.mockImplementation(async (path) => {
			if (path === settingsPath || path === tokenPath) return undefined;
			rejectMissing();
		});
		mockedReadFile.mockImplementation(async (path) => {
			if (path === settingsPath) {
				return JSON.stringify({ selectedAuthType: "oauth-personal" });
			}
			rejectMissing();
		});
		const client = makeClient();
		await client.initialize();
		await openHarnessSession("antigravity", "/vault", client);
		expect(client.calls).toEqual(["initialize", "session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();

		const io = fakeIo({
			[settingsPath]: JSON.stringify({
				selectedAuthType: "oauth-personal",
			}),
			[tokenPath]: true,
		});
		const method = classifyAntigravityAuth(
			await gatherAntigravityAuthSignals(io, {
				GEMINI_API_KEY: "test-key",
			}),
		).sessionAuthMethod;
		expect(method).toBeUndefined();
	});
});
