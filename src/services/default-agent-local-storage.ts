import { obj, str } from "./settings-normalizer";
import type { AgentClientPluginSettings } from "../types/settings";
import type { FloatingWindowLocalStorageAccess } from "./floating-window-local-storage";

/** Vault- and device-scoped localStorage key (namespaced by Obsidian). */
export const DEFAULT_AGENT_LOCAL_KEY = "default-agent-id-v1";

export function parseDefaultAgentLocalId(raw: unknown): string | null {
	if (typeof raw === "string") {
		const id = raw.trim();
		return id || null;
	}
	const o = obj(raw);
	if (!o) return null;
	const id = str(o.agentId, "").trim();
	return id || null;
}

export function readDefaultAgentLocalId(
	access: FloatingWindowLocalStorageAccess,
): string | null {
	return parseDefaultAgentLocalId(access.load(DEFAULT_AGENT_LOCAL_KEY));
}

export function writeDefaultAgentLocalId(
	access: FloatingWindowLocalStorageAccess,
	agentId: string,
): void {
	const id = agentId.trim();
	if (!id) {
		access.save(DEFAULT_AGENT_LOCAL_KEY, null);
		return;
	}
	access.save(DEFAULT_AGENT_LOCAL_KEY, { agentId: id });
}

/**
 * When per-device default is on, persist the vault-wide id separately so
 * Sync does not last-writer-win this computer's pick.
 */
export function settingsForSyncedSave(
	settings: AgentClientPluginSettings,
	syncedDefaultAgentId: string,
): AgentClientPluginSettings {
	if (!settings.defaultAgentPerDevice) {
		return settings;
	}
	return {
		...settings,
		defaultAgentId: syncedDefaultAgentId,
	};
}

export function applyDefaultAgentLocalOverlay(args: {
	perDevice: boolean;
	syncedId: string;
	localId: string | null;
}): { runtimeId: string; seedLocal: boolean } {
	if (!args.perDevice) {
		return { runtimeId: args.syncedId, seedLocal: false };
	}
	if (args.localId) {
		return { runtimeId: args.localId, seedLocal: false };
	}
	return { runtimeId: args.syncedId, seedLocal: true };
}
