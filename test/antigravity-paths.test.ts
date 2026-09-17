import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "obsidian";
import {
	ANTIGRAVITY_BRIDGE_FILENAME,
	ANTIGRAVITY_PRESET_ID,
	getAntigravityBridgeCandidates,
	getDefaultAntigravityBridgePath,
} from "../src/services/antigravity-paths";

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
});
