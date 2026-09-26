import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { Platform } from "obsidian";
import { access, readFile } from "fs/promises";
import { openHarnessSession } from "../../src/harnesses";
import { ANTIGRAVITY_SESSION_AUTH_METHOD } from "../../src/harnesses/antigravity";
import { CURSOR_SESSION_AUTH_METHOD } from "../../src/harnesses/cursor";
import {
	hasCursorApiKey,
	isCursorCliSignedIn,
} from "../../src/harnesses/cursor/health";
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

vi.mock("../../src/harnesses/cursor/health", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("../../src/harnesses/cursor/health")
		>();
	return {
		...actual,
		isCursorCliSignedIn: vi.fn(async (options) => {
			if (actual.hasCursorApiKey(options.env)) {
				return true;
			}
			return false;
		}),
	};
});

const mockedCursorSignedIn = vi.mocked(isCursorCliSignedIn);
const mockedAccess = vi.mocked(access);
const mockedReadFile = vi.mocked(readFile);

function rejectMissing(): never {
	throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
}

function makeClient() {
	const calls: string[] = [];
	return {
		calls,
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

describe("openHarnessSession integration", () => {
	const originalGemini = process.env.GEMINI_API_KEY;
	const priorIsWin = Platform.isWin;

	beforeEach(() => {
		mockedAccess.mockImplementation(async () => rejectMissing());
		mockedReadFile.mockImplementation(async () => rejectMissing());
		mockedCursorSignedIn.mockImplementation(async (options) =>
			hasCursorApiKey(options.env),
		);
	});

	afterEach(() => {
		Platform.isWin = priorIsWin;
		if (originalGemini === undefined) {
			delete process.env.GEMINI_API_KEY;
		} else {
			process.env.GEMINI_API_KEY = originalGemini;
		}
		vi.clearAllMocks();
	});

	it("authenticates Cursor with cursor_login when the CLI is not signed in (non-Windows)", async () => {
		Platform.isWin = false;
		mockedCursorSignedIn.mockResolvedValue(false);
		const client = makeClient();
		await openHarnessSession("cursor", "C:\\Obsidian", client);
		expect(client.calls).toEqual([
			`authenticate:${CURSOR_SESSION_AUTH_METHOD}`,
			"session/new",
		]);
	});

	it("skips Cursor pre-session authenticate on native Windows (optimistic)", async () => {
		Platform.isWin = true;
		mockedCursorSignedIn.mockResolvedValue(false);
		const client = makeClient();
		await openHarnessSession("cursor", "C:\\Obsidian", client, {
			wslMode: false,
		});
		expect(client.calls).toEqual(["session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("skips Cursor authenticate when the CLI is already signed in", async () => {
		Platform.isWin = false;
		mockedCursorSignedIn.mockResolvedValue(true);
		const client = makeClient();
		await openHarnessSession("cursor", "C:\\Obsidian", client);
		expect(client.calls).toEqual(["session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("skips Cursor authenticate when CURSOR_API_KEY is in session-open env", async () => {
		const client = makeClient();
		await openHarnessSession("cursor", "C:\\Obsidian", client, {
			env: { CURSOR_API_KEY: "key_test" },
		});
		expect(client.calls).toEqual(["session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("skips Antigravity authenticate when ACP OAuth files are present", async () => {
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
		await openHarnessSession("antigravity", "/vault", client);
		expect(client.calls).toEqual(["session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("authenticates Antigravity with gemini-api-key when only the env key is set", async () => {
		process.env.GEMINI_API_KEY = "test-key";
		const client = makeClient();
		await openHarnessSession("antigravity", "/vault", client);
		expect(client.calls).toEqual([
			`authenticate:${ANTIGRAVITY_SESSION_AUTH_METHOD}`,
			"session/new",
		]);
	});

	it("does not authenticate Claude before session/new", async () => {
		const client = makeClient();
		await openHarnessSession("claude-code-acp", "/vault", client);
		expect(client.calls).toEqual(["session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("does not call session/new when pre-session authenticate fails", async () => {
		process.env.GEMINI_API_KEY = "test-key";
		const client = makeClient();
		client.authenticate.mockResolvedValue(false);
		await expect(
			openHarnessSession("antigravity", "/vault", client),
		).rejects.toThrow("Authentication required");
		expect(client.newSession).not.toHaveBeenCalled();
	});
});
