import { describe, it, expect } from "vitest";
import {
	ANTIGRAVITY_CONNECTING_COPY,
	ANTIGRAVITY_COLD_START_ISSUE_URL,
	ANTIGRAVITY_SLOW_BOOT_COPY,
	ANTIGRAVITY_SLOW_BOOT_WARN_MS,
	resolveConnectingCopy,
} from "../src/harnesses/antigravity/cold-start";

describe("antigravity cold-start copy", () => {
	it("uses the generic connect copy for other agents", () => {
		const copy = resolveConnectingCopy({
			agentId: "cursor",
			agentLabel: "Cursor",
			elapsedMs: 999_999,
		});
		expect(copy.text).toBe("Connecting to Cursor...");
		expect(copy.showWarn).toBe(false);
		expect(copy.link).toBeUndefined();
	});

	it("uses the Antigravity connect copy before the threshold", () => {
		const copy = resolveConnectingCopy({
			agentId: "antigravity",
			agentLabel: "Antigravity",
			elapsedMs: ANTIGRAVITY_SLOW_BOOT_WARN_MS - 1,
		});
		expect(copy.text).toBe(ANTIGRAVITY_CONNECTING_COPY);
		expect(copy.showWarn).toBe(false);
		expect(copy.link).toBeUndefined();
	});

	it("escalates Antigravity to the slow-boot note at the threshold", () => {
		const copy = resolveConnectingCopy({
			agentId: "antigravity",
			agentLabel: "Antigravity",
			elapsedMs: ANTIGRAVITY_SLOW_BOOT_WARN_MS,
		});
		expect(copy.text).toBe(ANTIGRAVITY_SLOW_BOOT_COPY);
		expect(copy.showWarn).toBe(true);
		expect(copy.link?.url).toBe(ANTIGRAVITY_COLD_START_ISSUE_URL);
	});

	it("treats a missing agentId as a non-Antigravity connect", () => {
		const copy = resolveConnectingCopy({
			agentId: undefined,
			agentLabel: "Antigravity",
			elapsedMs: 60_000,
		});
		expect(copy.showWarn).toBe(false);
		expect(copy.text).toBe("Connecting to Antigravity...");
	});
});
