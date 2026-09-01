import { describe, it, expect } from "vitest";
import { classifyUnexpectedExit } from "../src/utils/process-exit";

const LABEL = "Claude Code (claude-code)";

describe("classifyUnexpectedExit", () => {
	it("returns agent_exited ProcessError for non-zero exit while initialized", () => {
		const result = classifyUnexpectedExit(1, null, true, "claude-code", LABEL);
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.type).toBe("agent_exited");
		expect(result.agentId).toBe("claude-code");
		expect(result.exitCode).toBe(1);
		expect(result.title).toBe("Agent Exited Unexpectedly");
		expect(result.message).toContain(`${LABEL} process exited (code 1)`);
		expect(result.suggestion).toBeTruthy();
	});

	it("returns null for code 127 (handled as command_not_found elsewhere)", () => {
		expect(
			classifyUnexpectedExit(127, null, true, "claude-code", LABEL),
		).toBeNull();
	});

	it("returns null when not initialized (user-initiated disconnect)", () => {
		expect(
			classifyUnexpectedExit(137, null, false, "claude-code", LABEL),
		).toBeNull();
		expect(
			classifyUnexpectedExit(null, "SIGTERM", false, "claude-code", LABEL),
		).toBeNull();
	});

	it("returns null for clean exit (code 0)", () => {
		expect(
			classifyUnexpectedExit(0, null, true, "claude-code", LABEL),
		).toBeNull();
	});

	it("returns ProcessError for fatal signal (e.g. SIGSEGV) while initialized", () => {
		const result = classifyUnexpectedExit(null, "SIGSEGV", true, "codex", "Codex (codex)");
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.type).toBe("agent_exited");
		expect(result.exitCode).toBeUndefined();
		expect(result.message).toContain("code n/a, SIGSEGV");
	});

	it("returns null for benign SIGTERM (sent by our own killProcessTree)", () => {
		expect(
			classifyUnexpectedExit(null, "SIGTERM", true, "claude-code", LABEL),
		).toBeNull();
	});

	it("returns ProcessError for non-zero code even with null signal", () => {
		const result = classifyUnexpectedExit(139, null, true, "codex", "Codex (codex)");
		expect(result).not.toBeNull();
		if (!result) return;
		expect(result.type).toBe("agent_exited");
		expect(result.exitCode).toBe(139);
	});
});
