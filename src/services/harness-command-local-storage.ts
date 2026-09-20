/**
 * Per-device Path overlay for Cursor and Antigravity.
 *
 * Absolute binary paths stay in vault- and device-scoped localStorage
 * (Obsidian loadLocalStorage / saveLocalStorage). Synced data.json only
 * keeps a portable command (`agent` / `agy_acp_server.par`) so Mac/Windows
 * and two Macs with different installs do not overwrite each other.
 */

import { statSync } from "fs";
import type { AgentClientPluginSettings } from "../types/settings";
import type { FloatingWindowLocalStorageAccess } from "./floating-window-local-storage";
import { isAbsolutePath } from "../utils/paths";
import {
	ANTIGRAVITY_BRIDGE_EXE,
	ANTIGRAVITY_BRIDGE_PAR,
	ANTIGRAVITY_PRESET_ID,
} from "../harnesses/antigravity/paths";
import { CURSOR_PRESET_ID } from "../harnesses/cursor/preset";

/** Vault- and device-scoped localStorage key (namespaced by Obsidian). */
export const HARNESS_COMMAND_LOCAL_KEY = "harness-command-paths-v1";

export const PER_DEVICE_COMMAND_PRESET_IDS = [
	CURSOR_PRESET_ID,
	ANTIGRAVITY_PRESET_ID,
] as const;

export type PerDeviceCommandPresetId =
	(typeof PER_DEVICE_COMMAND_PRESET_IDS)[number];

export type HarnessCommandLocalMap = Partial<
	Record<PerDeviceCommandPresetId, string>
>;

export function isPerDeviceCommandPreset(
	id: string,
): id is PerDeviceCommandPresetId {
	return (PER_DEVICE_COMMAND_PRESET_IDS as readonly string[]).includes(id);
}

export function portableHarnessCommand(
	presetId: PerDeviceCommandPresetId,
): string {
	return presetId === ANTIGRAVITY_PRESET_ID
		? ANTIGRAVITY_BRIDGE_PAR
		: "agent";
}

export function isPortableHarnessCommand(
	presetId: PerDeviceCommandPresetId,
	command: string,
): boolean {
	const trimmed = command.trim();
	if (!trimmed) return true;
	if (presetId === CURSOR_PRESET_ID) return trimmed === "agent";
	return (
		trimmed === ANTIGRAVITY_BRIDGE_PAR || trimmed === ANTIGRAVITY_BRIDGE_EXE
	);
}

export function pathIsExistingFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
}

export function parseHarnessCommandLocalMap(
	raw: unknown,
): HarnessCommandLocalMap {
	if (!raw || typeof raw !== "object") return {};
	const record = raw as Record<string, unknown>;
	const result: HarnessCommandLocalMap = {};
	for (const id of PER_DEVICE_COMMAND_PRESET_IDS) {
		const value = record[id];
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) result[id] = trimmed;
	}
	return result;
}

export function readHarnessCommandLocalMap(
	access: FloatingWindowLocalStorageAccess,
): HarnessCommandLocalMap {
	return parseHarnessCommandLocalMap(
		access.load(HARNESS_COMMAND_LOCAL_KEY),
	);
}

export function writeHarnessCommandLocalMap(
	access: FloatingWindowLocalStorageAccess,
	map: HarnessCommandLocalMap,
): void {
	const payload: Record<string, string> = {};
	for (const id of PER_DEVICE_COMMAND_PRESET_IDS) {
		const value = map[id]?.trim();
		if (value) payload[id] = value;
	}
	access.save(
		HARNESS_COMMAND_LOCAL_KEY,
		Object.keys(payload).length > 0 ? payload : null,
	);
}

export interface ApplyHarnessCommandOverlayArgs {
	presetId: PerDeviceCommandPresetId;
	syncedCommand: string;
	localCommand: string | null;
	pathExists: (path: string) => boolean;
}

export interface ApplyHarnessCommandOverlayResult {
	runtimeCommand: string;
	/** Always the portable token written to data.json. */
	persistSynced: string;
	seedLocal: string | null;
	clearLocal: boolean;
}

/**
 * Pick this device's Path. Local overlay wins when the file exists.
 * A synced absolute path is adopted only when that file exists here
 * (migrate this machine's old Auto-detect). Foreign OS / other-Mac
 * paths are ignored.
 */
export function applyHarnessCommandOverlay(
	args: ApplyHarnessCommandOverlayArgs,
): ApplyHarnessCommandOverlayResult {
	const portable = portableHarnessCommand(args.presetId);
	const synced = args.syncedCommand.trim();
	const local = args.localCommand?.trim() || null;

	const localUsable =
		Boolean(local) &&
		(!isAbsolutePath(local!) || args.pathExists(local!));
	if (local && localUsable) {
		return {
			runtimeCommand: local,
			persistSynced: portable,
			seedLocal: null,
			clearLocal: false,
		};
	}

	if (isAbsolutePath(synced) && args.pathExists(synced)) {
		return {
			runtimeCommand: synced,
			persistSynced: portable,
			seedLocal: synced,
			clearLocal: false,
		};
	}

	const runtimeCommand = isPortableHarnessCommand(args.presetId, synced)
		? synced || portable
		: portable;

	return {
		runtimeCommand,
		persistSynced: portable,
		seedLocal: null,
		clearLocal: Boolean(local && isAbsolutePath(local)),
	};
}

/** Strip Cursor/Antigravity absolute paths before writing data.json. */
export function settingsForSyncedHarnessCommands(
	settings: AgentClientPluginSettings,
): AgentClientPluginSettings {
	let changed = false;
	const presetAgents = { ...settings.presetAgents };
	for (const id of PER_DEVICE_COMMAND_PRESET_IDS) {
		const entry = presetAgents[id];
		if (!entry) continue;
		const portable = portableHarnessCommand(id);
		if (entry.command === portable) continue;
		presetAgents[id] = { ...entry, command: portable };
		changed = true;
	}
	return changed ? { ...settings, presetAgents } : settings;
}

/**
 * Persist this device's absolute Paths. Portable names clear the overlay
 * so the next spawn probes this machine.
 */
export function persistHarnessCommandLocals(
	access: FloatingWindowLocalStorageAccess,
	settings: AgentClientPluginSettings,
): void {
	const next: HarnessCommandLocalMap = {};
	for (const id of PER_DEVICE_COMMAND_PRESET_IDS) {
		const command = settings.presetAgents[id]?.command?.trim() ?? "";
		if (command && isAbsolutePath(command)) {
			next[id] = command;
		}
	}
	writeHarnessCommandLocalMap(access, next);
}

export function applyHarnessCommandsToSettings(
	settings: AgentClientPluginSettings,
	localMap: HarnessCommandLocalMap,
	pathExists: (path: string) => boolean = pathIsExistingFile,
): {
	settings: AgentClientPluginSettings;
	localMap: HarnessCommandLocalMap;
	stripSyncedAbsolutes: boolean;
} {
	let changed = false;
	let stripSyncedAbsolutes = false;
	const presetAgents = { ...settings.presetAgents };
	const nextLocal: HarnessCommandLocalMap = { ...localMap };

	for (const id of PER_DEVICE_COMMAND_PRESET_IDS) {
		const entry = presetAgents[id];
		if (!entry) continue;
		if (isAbsolutePath(entry.command.trim())) {
			stripSyncedAbsolutes = true;
		}
		const result = applyHarnessCommandOverlay({
			presetId: id,
			syncedCommand: entry.command,
			localCommand: localMap[id] ?? null,
			pathExists,
		});
		if (entry.command !== result.runtimeCommand) {
			presetAgents[id] = { ...entry, command: result.runtimeCommand };
			changed = true;
		}
		if (result.seedLocal) {
			nextLocal[id] = result.seedLocal;
		} else if (result.clearLocal) {
			delete nextLocal[id];
		}
	}

	return {
		settings: changed ? { ...settings, presetAgents } : settings,
		localMap: nextLocal,
		stripSyncedAbsolutes,
	};
}
