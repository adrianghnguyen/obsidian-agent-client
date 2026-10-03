/**
 * Audio input device enumeration for the voice-input microphone picker.
 *
 * Kept free of Obsidian imports so it is unit-testable; it only talks to
 * `navigator.mediaDevices`.
 */

/** One selectable microphone in the settings dropdown. */
export interface AudioInputDevice {
	deviceId: string;
	label: string;
	/** Stable per device, but not across devices/reinstalls. */
	groupId: string;
}

/**
 * Labels are empty until the page has microphone permission, which makes a
 * device list useless. Requesting a stream once (and immediately stopping it)
 * unlocks them. This is the only reason the picker touches getUserMedia.
 */
export async function ensureMicrophoneLabels(): Promise<void> {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: true,
		});
		stream.getTracks().forEach((track) => track.stop());
	} catch {
		// Denied or unavailable: callers still get ids without labels.
	}
}

/**
 * List audio inputs. `fallbackLabel` names devices that report no label.
 * Returns an empty array when the API is unavailable or enumeration fails.
 */
export async function listAudioInputDevices(
	fallbackLabel = "Microphone",
): Promise<AudioInputDevice[]> {
	if (
		typeof navigator === "undefined" ||
		!navigator.mediaDevices?.enumerateDevices
	) {
		return [];
	}
	try {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((device) => device.kind === "audioinput")
			.map((device, index) => {
				const label = device.label.trim();
				return {
					deviceId: device.deviceId,
					groupId: device.groupId,
					label: label || `${fallbackLabel} ${index + 1}`,
				};
			});
	} catch {
		return [];
	}
}
