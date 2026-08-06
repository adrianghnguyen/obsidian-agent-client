/**
 * Tests for the update checker's package-migration rules.
 *
 * Only the local (no-network) migration branch is meaningful here: the
 * stubbed `requestUrl` always rejects, so version-check paths resolve to
 * null through checkAgentUpdate's catch — deterministically, offline.
 */

import { describe, it, expect } from "vitest";
import { checkAgentUpdate } from "../src/services/update-checker";

describe("checkAgentUpdate — package migration rules", () => {
	it("flags the renamed Claude adapter at any version", async () => {
		const result = await checkAgentUpdate({
			name: "@zed-industries/claude-code-acp",
		});
		expect(result?.title).toBe("Package Migration Required");
		expect(result?.suggestion).toBe(
			"npm uninstall -g @zed-industries/claude-code-acp && npm install -g @agentclientprotocol/claude-agent-acp",
		);
	});

	it("flags codex-acp below 1.0.0 and targets the old npm package", async () => {
		const result = await checkAgentUpdate({
			name: "codex-acp",
			version: "0.16.0",
		});
		expect(result?.title).toBe("Package Migration Required");
		expect(result?.message).toContain("@zed-industries/codex-acp");
		expect(result?.suggestion).toBe(
			"npm uninstall -g @zed-industries/codex-acp && npm install -g @agentclientprotocol/codex-acp",
		);
	});

	it("does not flag codex-acp 1.x (the successor package)", async () => {
		expect(
			await checkAgentUpdate({ name: "codex-acp", version: "1.1.9" }),
		).toBeNull();
	});

	it("does not flag codex-acp when the version cannot prove the old package", async () => {
		expect(await checkAgentUpdate({ name: "codex-acp" })).toBeNull();
		expect(
			await checkAgentUpdate({ name: "codex-acp", version: "unknown" }),
		).toBeNull();
	});

	it("returns null for unknown agents", async () => {
		expect(
			await checkAgentUpdate({ name: "some-agent", version: "1.0.0" }),
		).toBeNull();
	});
});
