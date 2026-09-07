import { describe, it, expect, vi, beforeEach } from "vitest";
import { AudioCapture } from "../../src/voice-input/AudioCapture";
import { createFakeMediaStream } from "./fixtures";

interface FakeAudioContextBundle {
	ctx: AudioContext;
	frequencySnapshot: Uint8Array;
	analyser: AnalyserNode & { disconnect: ReturnType<typeof vi.fn> };
	processor: ScriptProcessorNode;
	/** Sync analyser bins from the last PCM buffer (simulates live metering). */
	syncLevelFromPcm: (samples: Float32Array) => void;
}

/**
 * AudioContext stub with AnalyserNode whose frequency data tracks PCM energy.
 */
function createFakeAudioContext(): FakeAudioContextBundle {
	const frequencySnapshot = new Uint8Array(128);

	const syncLevelFromPcm = (samples: Float32Array) => {
		let sum = 0;
		for (let i = 0; i < samples.length; i++) {
			sum += samples[i] * samples[i];
		}
		const rms = samples.length ? Math.sqrt(sum / samples.length) : 0;
		const byte = Math.min(255, Math.round(rms * 255 * 1.5));
		frequencySnapshot.fill(byte);
	};

	const processor = {
		onaudioprocess: null as unknown as (event: AudioProcessingEvent) => void,
		disconnect: vi.fn(),
		connect: vi.fn(),
	} as unknown as ScriptProcessorNode;

	const analyser = {
		fftSize: 256,
		smoothingTimeConstant: 0.7,
		frequencyBinCount: 128,
		getByteFrequencyData: vi.fn((out: Uint8Array) => {
			out.set(frequencySnapshot.subarray(0, out.length));
		}),
		disconnect: vi.fn(),
		connect: vi.fn(),
	} as unknown as AnalyserNode & { disconnect: ReturnType<typeof vi.fn> };

	const gain: Partial<GainNode> = {
		gain: { value: 0 } as unknown as AudioParam,
		disconnect: vi.fn(),
		connect: vi.fn(),
	};

	const source: Partial<MediaStreamAudioSourceNode> = {
		disconnect: vi.fn(),
		connect: vi.fn((dest: AudioNode) => dest),
	};

	const ctx = {
		sampleRate: 16000,
		state: "running",
		createMediaStreamSource: vi.fn(() => source as MediaStreamAudioSourceNode),
		createScriptProcessor: vi.fn(() => processor),
		createAnalyser: vi.fn(() => analyser),
		createGain: vi.fn(() => gain as GainNode),
		resume: vi.fn(async () => undefined),
		close: vi.fn(async () => undefined),
		destination: {} as AudioDestinationNode,
	} as unknown as AudioContext;

	return { ctx, frequencySnapshot, analyser, processor, syncLevelFromPcm };
}

function fireProcess(
	bundle: FakeAudioContextBundle,
	channelData: Float32Array,
): void {
	bundle.syncLevelFromPcm(channelData);
	const event = {
		inputBuffer: {
			getChannelData: vi.fn(() => channelData),
			numberOfChannels: 1,
			sampleRate: 16000,
		},
		outputBuffer: {
			getChannelData: vi.fn(() => new Float32Array(channelData.length)),
		},
	} as unknown as AudioProcessingEvent;
	bundle.processor.onaudioprocess(event);
}

function makeSine(amplitude: number, length = 512): Float32Array {
	const data = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		data[i] = Math.sin((i / length) * Math.PI * 8) * amplitude;
	}
	return data;
}

describe("AudioCapture", () => {
	let audioCapture: AudioCapture;
	let fakeMediaStream: MediaStream;
	let bundle: FakeAudioContextBundle;

	beforeEach(() => {
		audioCapture = new AudioCapture();
		fakeMediaStream = createFakeMediaStream();
		bundle = createFakeAudioContext();

		Object.defineProperty(globalThis, "navigator", {
			value: {
				mediaDevices: {
					getUserMedia: vi.fn(async () => fakeMediaStream),
				},
			},
			configurable: true,
			writable: true,
		});

		(globalThis as unknown as Record<string, unknown>).AudioContext =
			function () {
				return bundle.ctx;
			} as unknown as typeof AudioContext;
	});

	it("is idle after construction", () => {
		expect(audioCapture.isActive).toBe(false);
	});

	it("getLevel returns 0 when idle", () => {
		expect(audioCapture.getLevel()).toBe(0);
	});

	it("starts recording and calls getUserMedia", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);

		expect(audioCapture.isActive).toBe(true);
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: true,
		});
	});

	it("wires createAnalyser into the capture graph", async () => {
		await audioCapture.start(vi.fn());
		expect(bundle.ctx.createAnalyser).toHaveBeenCalled();
	});

	it("calls getUserMedia with device constraint when deviceId is set", async () => {
		audioCapture.setDeviceId("specific-mic-id");
		await audioCapture.start(vi.fn());

		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: { deviceId: { ideal: "specific-mic-id" } },
		});
	});

	it("uses default constraint when deviceId is null or 'default'", async () => {
		audioCapture.setDeviceId(null);
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenNthCalledWith(1, {
			audio: true,
		});
		audioCapture.stop();

		audioCapture.setDeviceId("default");
		await audioCapture.start(onChunk);
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenNthCalledWith(2, {
			audio: true,
		});
		audioCapture.stop();
	});

	it("creates AudioContext and ScriptProcessor", async () => {
		await audioCapture.start(vi.fn());
		expect(bundle.ctx.createScriptProcessor).toHaveBeenCalledWith(4096, 1, 1);
	});

	it("calls onChunk with base64 PCM when onaudioprocess fires", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);
		fireProcess(bundle, new Float32Array([0.1, -0.2, 0.3]));
		expect(onChunk).toHaveBeenCalledWith(expect.any(String));
		expect(onChunk.mock.calls[0][0]).toBeTruthy();
	});

	it("getLevel stays near 0 for silence", async () => {
		await audioCapture.start(vi.fn());
		fireProcess(bundle, new Float32Array(512));
		expect(audioCapture.getLevel()).toBeLessThan(0.05);
	});

	it("getLevel exceeds floor for a loud signal", async () => {
		await audioCapture.start(vi.fn());
		fireProcess(bundle, makeSine(0.8));
		expect(audioCapture.getLevel()).toBeGreaterThan(0.1);
	});

	it("getLevel rises with louder PCM", async () => {
		await audioCapture.start(vi.fn());
		fireProcess(bundle, makeSine(0.2));
		const quiet = audioCapture.getLevel();
		fireProcess(bundle, makeSine(0.9));
		const loud = audioCapture.getLevel();
		expect(loud).toBeGreaterThan(quiet);
	});

	it("getLevel returns 0 after stop and disconnects analyser", async () => {
		await audioCapture.start(vi.fn());
		fireProcess(bundle, makeSine(0.8));
		expect(audioCapture.getLevel()).toBeGreaterThan(0.1);

		audioCapture.stop();
		expect(audioCapture.getLevel()).toBe(0);
		expect(bundle.analyser.disconnect).toHaveBeenCalled();
	});

	it("stops recording and releases resources", async () => {
		await audioCapture.start(vi.fn());
		expect(audioCapture.isActive).toBe(true);

		audioCapture.stop();

		expect(audioCapture.isActive).toBe(false);
		for (const track of fakeMediaStream.getTracks()) {
			expect(track.stop).toHaveBeenCalled();
		}
		expect(bundle.ctx.close).toHaveBeenCalled();
	});

	it("second start() is a no-op when already recording", async () => {
		const onChunk = vi.fn();
		await audioCapture.start(onChunk);
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
		await audioCapture.start(vi.fn());
		audioCapture.stop();
		await audioCapture.start(vi.fn());
		expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
			audio: { deviceId: { ideal: "persistent-id" } },
		});
	});

	it("stop() is safe when not recording", () => {
		expect(() => audioCapture.stop()).not.toThrow();
	});
});
