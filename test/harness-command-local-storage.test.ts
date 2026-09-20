import { describe, it, expect, beforeEach } from "vitest";
import {
	HARNESS_COMMAND_LOCAL_KEY,
	applyHarnessCommandOverlay,
	applyHarnessCommandsToSettings,
	isPortableHarnessCommand,
	parseHarnessCommandLocalMap,
	persistHarnessCommandLocals,
	portableHarnessCommand,
	readHarnessCommandLocalMap,
	settingsForSyncedHarnessCommands,
	writeHarnessCommandLocalMap,
} from "../src/services/harness-command-local-storage";
import type { FloatingWindowLocalStorageAccess } from "../src/services/floating-window-local-storage";
import { DEFAULT_SETTINGS } from "../src/services/default-settings";
import { ANTIGRAVITY_BRIDGE_PAR } from "../src/harnesses/antigravity/paths";
import type { AgentClientPluginSettings } from "../src/types/settings";
import type { PresetAgentUserSettings } from "../src/types/agent";

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

function existsSet(paths: string[]): (path: string) => boolean {
	const set = new Set(paths);
	return (path) => set.has(path);
}

function preset(
	partial: Partial<PresetAgentUserSettings> & { id: string },
): PresetAgentUserSettings {
	return {
		displayName: partial.id,
		command: "cmd",
		args: [],
		env: [],
		apiKeySecretId: "",
		enabled: true,
		...partial,
	};
}

function settingsWithCommands(
	commands: Record<string, string>,
): AgentClientPluginSettings {
	const presetAgents = { ...DEFAULT_SETTINGS.presetAgents };
	for (const [id, command] of Object.entries(commands)) {
		const current = presetAgents[id] ?? preset({ id, command });
		presetAgents[id] = { ...current, command };
	}
	return { ...DEFAULT_SETTINGS, presetAgents };
}

describe("portableHarnessCommand", () => {
	it("is OS-agnostic so data.json does not store Mac vs Windows paths", () => {
		expect(portableHarnessCommand("cursor")).toBe("agent");
		expect(portableHarnessCommand("antigravity")).toBe(
			ANTIGRAVITY_BRIDGE_PAR,
		);
		expect(isPortableHarnessCommand("cursor", "agent")).toBe(true);
		expect(isPortableHarnessCommand("cursor", "")).toBe(true);
		expect(
			isPortableHarnessCommand("cursor", "/opt/homebrew/bin/agent"),
		).toBe(false);
		expect(
			isPortableHarnessCommand("antigravity", ANTIGRAVITY_BRIDGE_PAR),
		).toBe(true);
		expect(
			isPortableHarnessCommand("antigravity", "agy_acp_server.exe"),
		).toBe(true);
		expect(
			isPortableHarnessCommand(
				"antigravity",
				"/Users/a/Library/agy-acp-server/agy_acp_server.par",
			),
		).toBe(false);
	});
});

describe("harness-command-local-storage round-trip", () => {
	let access: ReturnType<typeof createMemoryAccess>;

	beforeEach(() => {
		access = createMemoryAccess();
	});

	it("round-trips per-preset paths", () => {
		writeHarnessCommandLocalMap(access, {
			cursor: "/opt/homebrew/bin/agent",
			antigravity: "/Users/a/Library/agy-acp-server/agy_acp_server.par",
		});
		expect(readHarnessCommandLocalMap(access)).toEqual({
			cursor: "/opt/homebrew/bin/agent",
			antigravity: "/Users/a/Library/agy-acp-server/agy_acp_server.par",
		});
		expect(access.store.get(HARNESS_COMMAND_LOCAL_KEY)).toEqual({
			cursor: "/opt/homebrew/bin/agent",
			antigravity: "/Users/a/Library/agy-acp-server/agy_acp_server.par",
		});
	});

	it("parses unknown keys out", () => {
		expect(
			parseHarnessCommandLocalMap({
				cursor: "  agent  ",
				claude: "/opt/claude",
			}),
		).toEqual({ cursor: "agent" });
	});
});

describe("applyHarnessCommandOverlay per-OS", () => {
	const macBridge =
		"/Users/a/Library/agy-acp-server/agy_acp_server.par";
	const winBridge =
		"C:\\Users\\a\\AppData\\Local\\agy-acp-server\\agy_acp_server.exe";
	const winCursor = "C:\\Users\\a\\AppData\\Local\\cursor-agent\\agent.exe";

	it("ignores a synced Windows absolute path on a Mac (file missing)", () => {
		expect(
			applyHarnessCommandOverlay({
				presetId: "antigravity",
				syncedCommand: winBridge,
				localCommand: null,
				pathExists: existsSet([]),
			}),
		).toEqual({
			runtimeCommand: ANTIGRAVITY_BRIDGE_PAR,
			persistSynced: ANTIGRAVITY_BRIDGE_PAR,
			seedLocal: null,
			clearLocal: false,
		});
	});

	it("ignores a synced Mac absolute path on Windows (file missing)", () => {
		expect(
			applyHarnessCommandOverlay({
				presetId: "cursor",
				syncedCommand: "/Users/a/.local/bin/agent",
				localCommand: null,
				pathExists: existsSet([]),
			}),
		).toEqual({
			runtimeCommand: "agent",
			persistSynced: "agent",
			seedLocal: null,
			clearLocal: false,
		});
	});

	it("seeds overlay from a synced absolute path that exists on this OS", () => {
		expect(
			applyHarnessCommandOverlay({
				presetId: "antigravity",
				syncedCommand: macBridge,
				localCommand: null,
				pathExists: existsSet([macBridge]),
			}),
		).toEqual({
			runtimeCommand: macBridge,
			persistSynced: ANTIGRAVITY_BRIDGE_PAR,
			seedLocal: macBridge,
			clearLocal: false,
		});
	});

	it("keeps a Windows Cursor overlay when that file exists", () => {
		expect(
			applyHarnessCommandOverlay({
				presetId: "cursor",
				syncedCommand: "agent",
				localCommand: winCursor,
				pathExists: existsSet([winCursor]),
			}),
		).toEqual({
			runtimeCommand: winCursor,
			persistSynced: "agent",
			seedLocal: null,
			clearLocal: false,
		});
	});
});

describe("applyHarnessCommandOverlay per-device (two Macs, same data.json)", () => {
	const macA = "/Users/a/.local/bin/agent";
	const macB = "/opt/homebrew/bin/agent";
	const synced = settingsWithCommands({
		cursor: "agent",
		antigravity: ANTIGRAVITY_BRIDGE_PAR,
	});

	it("gives each device its own Cursor path against the same synced snapshot", () => {
		const deviceA = createMemoryAccess();
		const deviceB = createMemoryAccess();
		writeHarnessCommandLocalMap(deviceA, { cursor: macA });
		writeHarnessCommandLocalMap(deviceB, { cursor: macB });

		const appliedA = applyHarnessCommandsToSettings(
			synced,
			readHarnessCommandLocalMap(deviceA),
			existsSet([macA]),
		);
		const appliedB = applyHarnessCommandsToSettings(
			synced,
			readHarnessCommandLocalMap(deviceB),
			existsSet([macB]),
		);

		expect(appliedA.settings.presetAgents.cursor.command).toBe(macA);
		expect(appliedB.settings.presetAgents.cursor.command).toBe(macB);

		persistHarnessCommandLocals(deviceA, appliedA.settings);
		persistHarnessCommandLocals(deviceB, appliedB.settings);

		expect(settingsForSyncedHarnessCommands(appliedA.settings)).toEqual(
			settingsForSyncedHarnessCommands(appliedB.settings),
		);
		expect(
			settingsForSyncedHarnessCommands(appliedA.settings).presetAgents
				.cursor.command,
		).toBe("agent");
		expect(readHarnessCommandLocalMap(deviceA).cursor).toBe(macA);
		expect(readHarnessCommandLocalMap(deviceB).cursor).toBe(macB);
	});

	it("does not seed Mac B from Mac A's synced absolute path", () => {
		const staleSynced = settingsWithCommands({ cursor: macA });
		const deviceB = applyHarnessCommandsToSettings(
			staleSynced,
			{},
			existsSet([macB]),
		);
		expect(deviceB.settings.presetAgents.cursor.command).toBe("agent");
		expect(deviceB.localMap.cursor).toBeUndefined();
		expect(deviceB.stripSyncedAbsolutes).toBe(true);
	});

	it("seeds Mac A from a synced absolute that exists here", () => {
		const staleSynced = settingsWithCommands({ cursor: macA });
		const deviceA = applyHarnessCommandsToSettings(
			staleSynced,
			{},
			existsSet([macA]),
		);
		expect(deviceA.settings.presetAgents.cursor.command).toBe(macA);
		expect(deviceA.localMap.cursor).toBe(macA);
	});

	it("clears a dead overlay and falls back to portable", () => {
		expect(
			applyHarnessCommandOverlay({
				presetId: "cursor",
				syncedCommand: "agent",
				localCommand: macA,
				pathExists: existsSet([]),
			}),
		).toEqual({
			runtimeCommand: "agent",
			persistSynced: "agent",
			seedLocal: null,
			clearLocal: true,
		});
	});

	it("empty overlays on both devices stay on the portable default", () => {
		const a = applyHarnessCommandsToSettings(synced, {}, existsSet([]));
		const b = applyHarnessCommandsToSettings(synced, {}, existsSet([]));
		expect(a.settings.presetAgents.cursor.command).toBe("agent");
		expect(b.settings.presetAgents.cursor.command).toBe("agent");
		expect(a.settings.presetAgents.antigravity.command).toBe(
			ANTIGRAVITY_BRIDGE_PAR,
		);
		expect(b.settings.presetAgents.antigravity.command).toBe(
			ANTIGRAVITY_BRIDGE_PAR,
		);
	});
});

describe("settingsForSyncedHarnessCommands", () => {
	it("never writes an absolute path for Cursor or Antigravity", () => {
		const settings = settingsWithCommands({
			cursor: "/opt/homebrew/bin/agent",
			antigravity:
				"/Users/a/Library/agy-acp-server/agy_acp_server.par",
			"claude-code-acp": "/opt/claude-agent-acp",
		});
		const synced = settingsForSyncedHarnessCommands(settings);
		expect(synced.presetAgents.cursor.command).toBe("agent");
		expect(synced.presetAgents.antigravity.command).toBe(
			ANTIGRAVITY_BRIDGE_PAR,
		);
		expect(synced.presetAgents["claude-code-acp"].command).toBe(
			"/opt/claude-agent-acp",
		);
	});
});
