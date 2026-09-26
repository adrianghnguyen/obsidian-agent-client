import { Platform } from "obsidian";
import { afterEach, describe, expect, it } from "vitest";
import {
	checkCursorCliHealth,
	hasCursorApiKey,
	isCursorStatusAuthenticated,
} from "../src/harnesses/cursor/health";

describe("isCursorStatusAuthenticated", () => {
	it("rejects empty status", () => {
		expect(isCursorStatusAuthenticated("")).toBe(false);
		expect(isCursorStatusAuthenticated("   \n")).toBe(false);
	});

	it("rejects Not logged in even when the CLI exits 0", () => {
		expect(isCursorStatusAuthenticated("Not logged in\n")).toBe(false);
		expect(isCursorStatusAuthenticated("status: NOT LOGGED IN")).toBe(false);
	});

	it("rejects unauthenticated wording", () => {
		expect(isCursorStatusAuthenticated("unauthenticated")).toBe(false);
	});

	it("accepts a signed-in status line", () => {
		expect(isCursorStatusAuthenticated("Logged in as user@example.com")).toBe(
			true,
		);
	});
});

describe("hasCursorApiKey", () => {
	const original = process.env.CURSOR_API_KEY;

	afterEach(() => {
		if (original === undefined) {
			delete process.env.CURSOR_API_KEY;
		} else {
			process.env.CURSOR_API_KEY = original;
		}
	});

	it("reads preset env before process.env", () => {
		delete process.env.CURSOR_API_KEY;
		expect(hasCursorApiKey({ CURSOR_API_KEY: "sk-test" })).toBe(true);
		expect(hasCursorApiKey({ CURSOR_API_KEY: "  " })).toBe(false);
		expect(hasCursorApiKey({})).toBe(false);
	});

	it("falls back to process.env", () => {
		process.env.CURSOR_API_KEY = "sk-from-shell";
		expect(hasCursorApiKey({})).toBe(true);
	});
});

describe.skipIf(process.platform !== "win32")(
	"checkCursorCliHealth (native Windows)",
	() => {
		const priorIsWin = Platform.isWin;

		afterEach(() => {
			Platform.isWin = priorIsWin;
		});

		it("probes version, acp, and auth when agent is on PATH", async () => {
			Platform.isWin = true;
			const result = await checkCursorCliHealth({
				command: "agent",
				args: ["acp"],
				wslMode: false,
			});
			const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
			expect(byId.path?.ok).toBe(true);
			expect(byId.version?.ok).toBe(true);
			expect(byId.acp?.ok).toBe(true);
			expect(byId.auth?.ok).toBe(true);
			expect(result.state).toBe("ok");
		});
	},
);
