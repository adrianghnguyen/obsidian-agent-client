import { describe, it, expect, beforeEach } from "vitest";
import {
	DEFAULT_AGENT_LOCAL_KEY,
	applyDefaultAgentLocalOverlay,
	parseDefaultAgentLocalId,
	readDefaultAgentLocalId,
	settingsForSyncedSave,
	writeDefaultAgentLocalId,
} from "../src/services/default-agent-local-storage";
import type { FloatingWindowLocalStorageAccess } from "../src/services/floating-window-local-storage";
import { DEFAULT_SETTINGS } from "../src/services/default-settings";

function createMemoryAccess(): FloatingWindowLocalStorageAccess & {
	store: Map<string, unknown>;
} {
	const store = new Map<string, unknown>();
	return {
		store,
		load: (key) => store.get(key) ?? null,
		save: (key, data) => {
			if (data === null) store.delete(key);
			else store.set(key, data);
		},
	};
}

describe("default-agent-local-storage", () => {
	let access: ReturnType<typeof createMemoryAccess>;

	beforeEach(() => {
		access = createMemoryAccess();
	});

	it("round-trips an agent id", () => {
		writeDefaultAgentLocalId(access, "codex-acp");
		expect(readDefaultAgentLocalId(access)).toBe("codex-acp");
		expect(access.store.get(DEFAULT_AGENT_LOCAL_KEY)).toEqual({
			agentId: "codex-acp",
		});
	});

	it("parses a legacy string payload", () => {
		expect(parseDefaultAgentLocalId("  cursor-acp  ")).toBe("cursor-acp");
		expect(parseDefaultAgentLocalId({ agentId: "opencode" })).toBe(
			"opencode",
		);
		expect(parseDefaultAgentLocalId({})).toBeNull();
		expect(parseDefaultAgentLocalId("")).toBeNull();
	});

	it("clears the key when writing an empty id", () => {
		writeDefaultAgentLocalId(access, "codex-acp");
		writeDefaultAgentLocalId(access, "  ");
		expect(readDefaultAgentLocalId(access)).toBeNull();
	});
});

describe("applyDefaultAgentLocalOverlay", () => {
	it("uses the synced id when per-device is off", () => {
		expect(
			applyDefaultAgentLocalOverlay({
				perDevice: false,
				syncedId: "claude-code-acp",
				localId: "codex-acp",
			}),
		).toEqual({ runtimeId: "claude-code-acp", seedLocal: false });
	});

	it("uses local when per-device is on and a local id exists", () => {
		expect(
			applyDefaultAgentLocalOverlay({
				perDevice: true,
				syncedId: "claude-code-acp",
				localId: "codex-acp",
			}),
		).toEqual({ runtimeId: "codex-acp", seedLocal: false });
	});

	it("seeds local from synced when per-device is on and local is empty", () => {
		expect(
			applyDefaultAgentLocalOverlay({
				perDevice: true,
				syncedId: "claude-code-acp",
				localId: null,
			}),
		).toEqual({ runtimeId: "claude-code-acp", seedLocal: true });
	});
});

describe("settingsForSyncedSave", () => {
	it("leaves defaultAgentId alone when per-device is off", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			defaultAgentPerDevice: false,
			defaultAgentId: "codex-acp",
		};
		expect(settingsForSyncedSave(settings, "claude-code-acp")).toBe(
			settings,
		);
	});

	it("writes the vault-wide id when per-device is on", () => {
		const settings = {
			...DEFAULT_SETTINGS,
			defaultAgentPerDevice: true,
			defaultAgentId: "codex-acp",
		};
		expect(settingsForSyncedSave(settings, "claude-code-acp")).toEqual({
			...settings,
			defaultAgentId: "claude-code-acp",
		});
	});
});
