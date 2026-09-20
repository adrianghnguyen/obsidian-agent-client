import { describe, it, expect } from "vitest";
import { resolveHarnessSpawnCommand } from "../src/services/harness-spawn-command";
import { ANTIGRAVITY_BRIDGE_PAR } from "../src/harnesses/antigravity/paths";

describe("resolveHarnessSpawnCommand", () => {
	it("keeps Cursor's portable name for login-shell PATH on this device", async () => {
		expect(await resolveHarnessSpawnCommand("cursor", "agent")).toBe(
			"agent",
		);
		expect(await resolveHarnessSpawnCommand("cursor", "")).toBe("agent");
	});

	it("falls back to agent when another device's Cursor path is missing", async () => {
		expect(
			await resolveHarnessSpawnCommand(
				"cursor",
				"C:\\Users\\other\\AppData\\Local\\cursor-agent\\agent.exe",
			),
		).toBe("agent");
		expect(
			await resolveHarnessSpawnCommand(
				"cursor",
				"/Users/other/.local/bin/agent",
			),
		).toBe("agent");
	});

	it("treats Antigravity filename as probe-this-machine, not a relative cwd file", async () => {
		const resolved = await resolveHarnessSpawnCommand(
			"antigravity",
			ANTIGRAVITY_BRIDGE_PAR,
		);
		expect(resolved).toBeTruthy();
		expect(resolved).not.toBe("");
	});

	it("leaves other presets unchanged", async () => {
		expect(
			await resolveHarnessSpawnCommand("claude-code-acp", "claude-agent-acp"),
		).toBe("claude-agent-acp");
	});
});
