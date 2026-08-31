import { vi } from "vitest";
import type {
	LiveSocket,
	LiveAudioSource,
	TranscriptSink,
} from "../../src/voice-input/LiveTranscriber";

export interface FakeSocketBundle {
	socket: LiveSocket;
	sent: string[];
	fireOpen: () => void;
	fireMessage: (data: unknown) => void;
	fireError: () => void;
	fireClose: (reason?: string) => void;
}

export function createFakeSocket(bundle?: Partial<FakeSocketBundle>): FakeSocketBundle {
	let _onopen: ((ev?: unknown) => void) | null = null;
	let _onmessage: ((ev: { data: unknown }) => void) | null = null;
	let _onerror: ((ev?: unknown) => void) | null = null;
	let _onclose: ((ev: { reason?: string }) => void) | null = null;
	const sent: string[] = [];

	const socket: LiveSocket = {
		readyState: 1, // WS_OPEN
		send: vi.fn((d: string) => sent.push(d)),
		close: vi.fn(),
		get onopen() {
			return _onopen;
		},
		set onopen(f) {
			_onopen = f;
		},
		get onmessage() {
			return _onmessage;
		},
		set onmessage(f) {
			_onmessage = f;
		},
		get onerror() {
			return _onerror;
		},
		set onerror(f) {
			_onerror = f;
		},
		get onclose() {
			return _onclose;
		},
		set onclose(f) {
			_onclose = f;
		},
	};

	return {
		socket,
		sent,
		fireOpen: () => _onopen?.(),
		fireMessage: (data) =>
			_onmessage?.({ data: typeof data === "string" ? data : JSON.stringify(data) }),
		fireError: () => _onerror?.(),
		fireClose: (reason) =>
			_onclose?.({ reason: reason ?? "" }),
		...bundle,
	};
}

export function createFakeRecorder(): LiveAudioSource & { emitChunk(pcm: string): void } {
	let _onChunk: ((base64Pcm: string) => void) | null = null;
	return {
		setDeviceId: vi.fn(),
		start: vi.fn(async (cb: (base64Pcm: string) => void) => {
			_onChunk = cb;
		}),
		stop: vi.fn(),
		emitChunk: (pcm: string) => _onChunk?.(pcm),
	};
}

export function createFakeSink(): TranscriptSink {
	return {
		onInterim: vi.fn(),
		onFinal: vi.fn(),
		onError: vi.fn(),
	};
}

/**
 * Create a fake MediaStream with a single audio track.
 * Used to stub getUserMedia in AudioCapture tests.
 */
export function createFakeMediaStream(): MediaStream {
	const audioTrack = {
		kind: "audio",
		stop: vi.fn(),
		enabled: true,
		label: "Fake mic",
		id: "fake-track-id",
	} as unknown as MediaStreamTrack;
	const stream = {
		getTracks: vi.fn(() => [audioTrack]),
		getAudioTracks: vi.fn(() => [audioTrack]),
	} as unknown as MediaStream;
	return stream;
}

/**
 * Fake AudioProcessingEvent for ScriptProcessorNode tests.
 */
export function createFakeAudioEvent(
	channelData: Float32Array,
	rate = 48000,
): AudioProcessingEvent {
	const buffer = {
		getChannelData: vi.fn(() => channelData),
		numberOfChannels: 1,
		sampleRate: rate,
		duration: channelData.length / rate,
	} as unknown as AudioBuffer;

	return {
		inputBuffer: buffer,
		outputBuffer: {
			getChannelData: vi.fn(() => new Float32Array(channelData.length)),
		},
		playbackTime: 0,
	} as unknown as AudioProcessingEvent;
}