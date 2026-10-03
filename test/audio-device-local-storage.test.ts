import { describe, it, expect } from "vitest";
import {
	AUDIO_DEVICE_DEFAULT,
	AUDIO_DEVICE_LOCAL_KEY,
	normalizeAudioDeviceId,
	parseAudioDeviceIdLocal,
	readAudioDeviceIdLocal,
	resolveAudioDeviceId,
	voiceInputSettingsForSyncedSave,
	writeAudioDeviceIdLocal,
} from "../src/services/audio-device-local-storage";
import type { FloatingWindowLocalStorageAccess } from "../src/services/floating-window-local-storage";

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

describe("normalizeAudioDeviceId", () => {
	it("treats default, empty, and non-strings as no preference", () => {
		expect(normalizeAudioDeviceId("default")).toBeNull();
		expect(normalizeAudioDeviceId("  ")).toBeNull();
		expect(normalizeAudioDeviceId(undefined)).toBeNull();
		expect(normalizeAudioDeviceId(42)).toBeNull();
		expect(normalizeAudioDeviceId("")).toBeNull();
	});

	it("keeps and trims a real device id", () => {
		expect(normalizeAudioDeviceId("mic-123")).toBe("mic-123");
		expect(normalizeAudioDeviceId("  mic-123  ")).toBe("mic-123");
	});
});

describe("parseAudioDeviceIdLocal", () => {
	it("reads both the legacy string and the { deviceId } shape", () => {
		expect(parseAudioDeviceIdLocal("abc")).toBe("abc");
		expect(parseAudioDeviceIdLocal({ deviceId: "abc" })).toBe("abc");
	});

	it("ignores default sentinels and malformed values", () => {
		expect(parseAudioDeviceIdLocal({ deviceId: "default" })).toBeNull();
		expect(parseAudioDeviceIdLocal(null)).toBeNull();
		expect(parseAudioDeviceIdLocal(5)).toBeNull();
	});
});

describe("writeAudioDeviceIdLocal", () => {
	it("round-trips a picked device id", () => {
		const access = createMemoryAccess();
		writeAudioDeviceIdLocal(access, "mic-abc");
		expect(access.load(AUDIO_DEVICE_LOCAL_KEY)).toEqual({
			deviceId: "mic-abc",
		});
		expect(readAudioDeviceIdLocal(access)).toBe("mic-abc");
	});

	it("clears the key when selecting the system default", () => {
		const access = createMemoryAccess();
		writeAudioDeviceIdLocal(access, "mic-abc");
		writeAudioDeviceIdLocal(access, "default");
		expect(access.load(AUDIO_DEVICE_LOCAL_KEY)).toBeNull();
		expect(readAudioDeviceIdLocal(access)).toBeNull();
	});
});

describe("resolveAudioDeviceId", () => {
	it("prefers this device's overlay", () => {
		expect(
			resolveAudioDeviceId({ syncedId: "synced-mic", localId: "local-mic" }),
		).toEqual({ runtimeId: "local-mic", seedLocal: null });
	});

	it("falls back to a synced id and seeds the overlay (legacy migration)", () => {
		expect(
			resolveAudioDeviceId({ syncedId: "synced-mic", localId: null }),
		).toEqual({ runtimeId: "synced-mic", seedLocal: "synced-mic" });
	});

	it("defaults when neither is set", () => {
		expect(
			resolveAudioDeviceId({ syncedId: "default", localId: null }),
		).toEqual({ runtimeId: AUDIO_DEVICE_DEFAULT, seedLocal: null });
	});
});

describe("voiceInputSettingsForSyncedSave", () => {
	it("resets a device id so data.json stays portable", () => {
		const synced = voiceInputSettingsForSyncedSave({
			audioDeviceId: "mic-abc",
			model: "gemini-3.5-transcribe-live",
		});
		expect(synced.audioDeviceId).toBe(AUDIO_DEVICE_DEFAULT);
		expect(synced.model).toBe("gemini-3.5-transcribe-live");
	});

	it("returns the same object when no device is selected", () => {
		const settings = { audioDeviceId: "default" };
		expect(voiceInputSettingsForSyncedSave(settings)).toBe(settings);
	});
});
