import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioCapture } from "../../src/voice-input/AudioCapture";
import { createFakeMediaStream } from "./fixtures";

/**
 * Minimal AudioContext stub for tests.
 */
function createFakeAudioContext(): AudioContext {
	const processor: Partial<ScriptProcessorNode> = {
		onaudioprocess: null as unknown as (event: AudioProcessingEvent) => void,
		disconnect: vi.fn(),
		connect: vi.fn(),
	};

	const gain: Partial<GainNode> = {
		gain: { value: 0 } as unknown as AudioParam,
		disconnect: vi.fn(),
		connect: vi.fn(),
	};

	const source: Partial<MediaStreamAudioSourceNode> = {
		disconnect: vi.fn(),
		connect: vi.fn((dest: AudioNode) => dest),
	};

	return {
		sampleRate: 16000,
		state: "running",
		createMediaStreamSource: vi.fn(() => source as MediaStreamAudioSourceNode),
		createScriptProcessor: vi.fn(
			() => processor as ScriptProcessorNode,
		),
		createGain: vi.fn(() => gain as GainNode),
		resume: vi.fn(async () => undefined),
		close: vi.fn(async () => undefined),
		destination: {} as AudioDestinationNode,
	} as unknown as AudioContext;
}

describe("AudioCapture", () => {
	let audioCapture: AudioCapture;
	let fakeMediaStream: MediaStream;
	let fakeAudioContext: AudioContext;

	beforeEach(() => {
		audioCapture = new AudioCapture();

		fakeMediaStream = createFakeMediaStream();
		fakeAudioContext = createFakeAudioContext();

		// Mock navigator.mediaDevices.getUserMedia
		const mediaDevices = {
			getUserMedia: vi.fn(async () => fakeMediaStream),
		};
		Object.defineProperty(globalThis, "navigator", {
			value: { mediaDevices },
			configurable: true,
			writable: true,
		});

		// Mock AudioContext as a plain constructor function (AudioContext not available in Node)
		const OriginalAudioContext = (globalThis as unknown as Record<string, unknown>).AudioContext;
		(globalThis as unknown as Record<string, unknown>).AudioContext =
			function () {
				return fakeAudioContext;
			} as unknown as typeof AudioContext;
	});

	it("is idle after construction", () => {
		expect(audioCapture.isActive).toBe(false);
	});

	it("starts recording and calls getUserMedia", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);

		expect(audioCapture.isActive).toBe(true);
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: true,
		});
	});

	it("calls getUserMedia with device constraint when deviceId is set", async () => {
		audioCapture.setDeviceId("specific-mic-id");
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);

		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: { deviceId: { ideal: "specific-mic-id" } },
		});
	});

it("uses default constraint when deviceId is null or 'default'", async () => {
			audioCapture.setDeviceId(null);
			const onChunk = vi.fn();
			await audioCapture.start(onChunk);
			expect(navigator.mediaDevices.getUserMedia).toHaveBeenNthCalledWith(
				1,
				{ audio: true },
			);
			audioCapture.stop();

			audioCapture.setDeviceId("default");
			await audioCapture.start(onChunk);
			expect(navigator.mediaDevices.getUserMedia).toHaveBeenNthCalledWith(
				2,
				{ audio: true },
			);
			audioCapture.stop();
		});

	it("creates AudioContext and ScriptProcessor", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);

		expect(fakeAudioContext.createScriptProcessor).toHaveBeenCalledWith(
			4096,
			1,
			1,
		);
	});

	it("calls onChunk with base64 PCM when onaudioprocess fires", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);

		const channelData = new Float32Array([0.1, -0.2, 0.3]);
		const event = {
			inputBuffer: {
				getChannelData: vi.fn(() => channelData),
				numberOfChannels: 1,
				sampleRate: 16000,
			},
			outputBuffer: {
				getChannelData: vi.fn(() => new Float32Array(3)),
			},
		} as unknown as AudioProcessingEvent;

		const processor = (
			fakeAudioContext as ReturnType<typeof createFakeAudioContext>
		).createScriptProcessor.mock
			.results[0]?.value as ScriptProcessorNode;
		processor.onaudioprocess(event);

		expect(onChunk).toHaveBeenCalledWith(expect.any(String));
		expect(onChunk.mock.calls[0][0]).toBeTruthy();
	});

	it("stops recording and releases resources", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);
		expect(audioCapture.isActive).toBe(true);

		audioCapture.stop();

		expect(audioCapture.isActive).toBe(false);
		for (const track of fakeMediaStream.getTracks()) {
			expect(track.stop).toHaveBeenCalled();
		}
		expect(fakeAudioContext.close).toHaveBeenCalled();
	});

	it("second start() is a no-op when already recording", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);
		expect(audioCapture.isActive).toBe(true);

		// This should not create a second AudioContext or getUserMedia call
		const getUserMediaCalls = (
			navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>
		).mock.calls.length;
		await audioCapture.start(onChunk);
		expect(
			(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>)
				.mock.calls.length,
		).toBe(getUserMediaCalls);
	});

	it("setDeviceId persists across start/stop cycles", async () => {
		audioCapture.setDeviceId("persistent-id");
		const onChunk = vi.fn();

		await audioCapture.start(onChunk);
		audioCapture.stop();

		await audioCapture.start(onChunk);
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: { deviceId: { ideal: "persistent-id" } },
		});
	});

	it("stop() is safe when not recording", () => {
		expect(() => audioCapture.stop()).not.toThrow();
	});
});