import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	ensureMicrophoneLabels,
	listAudioInputDevices,
} from "../../src/voice-input/audio-input-devices";

function installMediaDevices(overrides: {
	enumerateDevices?: () => Promise<MediaDeviceInfo[]>;
	getUserMedia?: () => Promise<MediaStream>;
}): void {
	Object.defineProperty(globalThis, "navigator", {
		value: {
			mediaDevices: {
				enumerateDevices:
					overrides.enumerateDevices ?? vi.fn(async () => []),
				getUserMedia:
					overrides.getUserMedia ??
					vi.fn(async () => ({ getTracks: () => [] }) as unknown as MediaStream),
			},
		},
		configurable: true,
		writable: true,
	});
}

function device(partial: Partial<MediaDeviceInfo>): MediaDeviceInfo {
	return {
		deviceId: partial.deviceId ?? "id",
		groupId: partial.groupId ?? "group",
		kind: partial.kind ?? "audioinput",
		label: partial.label ?? "",
		toJSON: () => ({}),
	} as MediaDeviceInfo;
}

const originalNavigator = globalThis.navigator;

afterEach(() => {
	Object.defineProperty(globalThis, "navigator", {
		value: originalNavigator,
		configurable: true,
		writable: true,
	});
});

describe("listAudioInputDevices", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("returns only audioinput devices", async () => {
		installMediaDevices({
			enumerateDevices: async () => [
				device({ deviceId: "mic-1", kind: "audioinput", label: "Built-in" }),
				device({ deviceId: "cam", kind: "videoinput", label: "Camera" }),
				device({ deviceId: "spk", kind: "audiooutput", label: "Speaker" }),
			],
		});
		const devices = await listAudioInputDevices();
		expect(devices).toEqual([
			{ deviceId: "mic-1", groupId: "group", label: "Built-in" },
		]);
	});

	it("falls back to a numbered label when the device reports none", async () => {
		installMediaDevices({
			enumerateDevices: async () => [
				device({ deviceId: "a", label: "" }),
				device({ deviceId: "b", label: "   " }),
			],
		});
		const devices = await listAudioInputDevices("Microphone");
		expect(devices.map((d) => d.label)).toEqual([
			"Microphone 1",
			"Microphone 2",
		]);
	});

	it("returns an empty list when enumeration fails", async () => {
		installMediaDevices({
			enumerateDevices: async () => {
				throw new Error("denied");
			},
		});
		expect(await listAudioInputDevices()).toEqual([]);
	});
});

describe("ensureMicrophoneLabels", () => {
	it("opens and immediately stops a stream to unlock labels", async () => {
		const stop = vi.fn();
		const getUserMedia = vi.fn(async () => ({
			getTracks: () => [{ stop }],
		}) as unknown as MediaStream);
		installMediaDevices({ getUserMedia });

		await ensureMicrophoneLabels();

		expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
		expect(stop).toHaveBeenCalled();
	});

	it("swallows permission errors", async () => {
		installMediaDevices({
			getUserMedia: async () => {
				throw new Error("NotAllowedError");
			},
		});
		await expect(ensureMicrophoneLabels()).resolves.toBeUndefined();
	});
});
