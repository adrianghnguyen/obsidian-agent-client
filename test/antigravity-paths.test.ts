import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "obsidian";
import {
	ANTIGRAVITY_BRIDGE_FILENAME,
	ANTIGRAVITY_HARNESS_FILENAME,
	ANTIGRAVITY_PRESET_ID,
	getAntigravityBridgeCandidates,
	getAntigravityCompanionCandidates,
	getDefaultAntigravityBridgePath,
	hasGeminiApiKey,
} from "../src/harnesses/antigravity/paths";

describe("antigravity-paths", () => {
	const originalEnv = { ...process.env };

	afterEach(() => {
		process.env = { ...originalEnv };
		vi.restoreAllMocks();
	});

	beforeEach(() => {
		delete process.env.AGY_ACP_BIN;
	});

	it("exports stable preset id", () => {
		expect(ANTIGRAVITY_PRESET_ID).toBe("antigravity");
		expect(ANTIGRAVITY_BRIDGE_FILENAME).toBe("agy_acp_server.par");
	});

	it("lists macOS Library path first", () => {
		vi.spyOn(Platform, "isMacOS", "get").mockReturnValue(true);
		vi.spyOn(Platform, "isWin", "get").mockReturnValue(false);
		process.env.HOME = "/Users/test";
		const candidates = getAntigravityBridgeCandidates();
		expect(candidates[0]).toBe(
			`/Users/test/Library/agy-acp-server/${ANTIGRAVITY_BRIDGE_FILENAME}`,
		);
	});

	it("prefers AGY_ACP_BIN when set", () => {
		vi.spyOn(Platform, "isMacOS", "get").mockReturnValue(true);
		process.env.AGY_ACP_BIN = "/custom/agy_acp_server.par";
		expect(getAntigravityBridgeCandidates()[0]).toBe("/custom/agy_acp_server.par");
	});

	it("lists Linux local paths", () => {
		vi.spyOn(Platform, "isMacOS", "get").mockReturnValue(false);
		vi.spyOn(Platform, "isWin", "get").mockReturnValue(false);
		process.env.HOME = "/home/test";
		const candidates = getAntigravityBridgeCandidates();
		expect(candidates.some((p) => p.includes(".local/bin"))).toBe(true);
	});

	it("default path matches first candidate", () => {
		vi.spyOn(Platform, "isMacOS", "get").mockReturnValue(true);
		vi.spyOn(Platform, "isWin", "get").mockReturnValue(false);
		process.env.HOME = "/Users/test";
		expect(getDefaultAntigravityBridgePath()).toBe(
			getAntigravityBridgeCandidates()[0],
		);
	});

	it("lists companion next to the bridge, then ~/.local/bin", () => {
		delete process.env.ANTIGRAVITY_HARNESS_PATH;
		process.env.HOME = "/home/test";
		const candidates = getAntigravityCompanionCandidates(
			`/opt/agy/${ANTIGRAVITY_BRIDGE_FILENAME}`,
		);
		expect(candidates[0]).toBe(`/opt/agy/${ANTIGRAVITY_HARNESS_FILENAME}`);
		expect(candidates).toContain(
			`/home/test/.local/bin/${ANTIGRAVITY_HARNESS_FILENAME}`,
		);
	});

	it("prefers ANTIGRAVITY_HARNESS_PATH from preset env", () => {
		delete process.env.ANTIGRAVITY_HARNESS_PATH;
		const candidates = getAntigravityCompanionCandidates(null, {
			ANTIGRAVITY_HARNESS_PATH: "/custom/localharness_external",
		});
		expect(candidates[0]).toBe("/custom/localharness_external");
	});

	it("treats GEMINI_API_KEY in preset env as present without settings.json", () => {
		const previous = process.env.GEMINI_API_KEY;
		delete process.env.GEMINI_API_KEY;
		try {
			expect(hasGeminiApiKey({ GEMINI_API_KEY: "test-key" })).toBe(true);
			expect(hasGeminiApiKey({ GEMINI_API_KEY: "" })).toBe(false);
			expect(hasGeminiApiKey({})).toBe(false);
		} finally {
			if (previous === undefined) {
				delete process.env.GEMINI_API_KEY;
			} else {
				process.env.GEMINI_API_KEY = previous;
			}
		}
	});
});
