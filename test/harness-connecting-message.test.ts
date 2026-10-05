import { describe, expect, it } from "vitest";

import { ANTIGRAVITY_CONNECTING_COPY } from "../src/harnesses/antigravity";
import { formatHarnessConnectingEmptyState } from "../src/services/harness-connecting-message";

describe("formatHarnessConnectingEmptyState", () => {
	it("appends elapsed to default agent connecting copy", () => {
		expect(
			formatHarnessConnectingEmptyState({
				agentId: "cursor",
				agentLabel: "Cursor",
				elapsedMs: 5000,
			}),
		).toBe("Connecting to Cursor... (0:05)");
	});

	it("appends elapsed to Antigravity copy", () => {
		expect(
			formatHarnessConnectingEmptyState({
				agentId: "antigravity",
				agentLabel: "Antigravity",
				elapsedMs: 125_000,
			}),
		).toBe(`${ANTIGRAVITY_CONNECTING_COPY} (2:05)`);
	});
});
