/**
 * Per-device microphone selection for voice input.
 *
 * A `MediaDeviceInfo.deviceId` is stable only on the machine that minted it
 * (and is not stable across Chromium storage clears), so the pick lives in
 * vault- and device-scoped localStorage (Obsidian loadLocalStorage /
 * saveLocalStorage) instead of synced data.json. A synced mic id would
 * silently fall back to the system default on every other machine.
 */

import type { FloatingWindowLocalStorageAccess } from "./floating-window-local-storage";

/** Vault- and device-scoped localStorage key (namespaced by Obsidian). */
export const AUDIO_DEVICE_LOCAL_KEY = "audio-input-device-v1";

/** Sentinel meaning "let the system pick". Never written as a deviceId. */
export const AUDIO_DEVICE_DEFAULT = "default";

type Record_ = Record<string, unknown>;

/** Normalize any stored/typed value to a trimmed string or null. */
export function normalizeAudioDeviceId(raw: unknown): string | null {
	if (typeof raw !== "string") return null;
	const trimmed = raw.trim();
	if (!trimmed || trimmed === AUDIO_DEVICE_DEFAULT) return null;
	return trimmed;
}

/** Read a stored deviceId from a raw localStorage value. */
export function parseAudioDeviceIdLocal(raw: unknown): string | null {
	if (typeof raw === "string") {
		return normalizeAudioDeviceId(raw);
	}
	if (!raw || typeof raw !== "object") return null;
	return normalizeAudioDeviceId((raw as Record_).deviceId);
}

export function readAudioDeviceIdLocal(
	access: FloatingWindowLocalStorageAccess,
): string | null {
	return parseAudioDeviceIdLocal(access.load(AUDIO_DEVICE_LOCAL_KEY));
}

/**
 * Persist the pick. A null/`"default"` id clears the overlay so the device
 * returns to its inherited (or system) selection.
 */
export function writeAudioDeviceIdLocal(
	access: FloatingWindowLocalStorageAccess,
	deviceId: string | null,
): void {
	const normalized = normalizeAudioDeviceId(deviceId);
	access.save(
		AUDIO_DEVICE_LOCAL_KEY,
		normalized ? { deviceId: normalized } : null,
	);
}

/**
 * Pick the id to use at runtime, given the vault-wide synced value and this
 * device's overlay. The local overlay wins; the synced value is only a
 * fallback for legacy settings written before the overlay existed.
 */
export function resolveAudioDeviceId(args: {
	syncedId: string;
	localId: string | null;
}): { runtimeId: string; seedLocal: string | null } {
	const local = normalizeAudioDeviceId(args.localId);
	if (local) {
		return { runtimeId: local, seedLocal: null };
	}
	const synced = normalizeAudioDeviceId(args.syncedId);
	if (synced) {
		return { runtimeId: synced, seedLocal: synced };
	}
	return { runtimeId: AUDIO_DEVICE_DEFAULT, seedLocal: null };
}

/**
 * Voice settings with the synced mic field reset to the default sentinel.
 * data.json is vault-wide; this device's pick belongs in the overlay only.
 */
export function voiceInputSettingsForSyncedSave<
	T extends { audioDeviceId: string },
>(voiceInput: T): T {
	if (!normalizeAudioDeviceId(voiceInput.audioDeviceId)) {
		return voiceInput;
	}
	return { ...voiceInput, audioDeviceId: AUDIO_DEVICE_DEFAULT };
}
