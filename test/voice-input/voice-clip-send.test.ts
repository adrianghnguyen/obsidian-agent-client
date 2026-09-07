import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveTranscriber } from "../../src/voice-input/LiveTranscriber";
import { VoiceTranscriptAccumulator } from "../../src/voice-input/transcript-accumulation";
import { captureVoiceMessageForSend } from "../../src/voice-input/format-voice-duration";
import {
	createFakeSocket,
	createFakeRecorder,
} from "./fixtures";
import { loadWavAsPcmChunks } from "./wav-fixture";
import type { TranscriptSink } from "../../src/voice-input/types";

function wsMsg(data: unknown): string {
	return JSON.stringify(data);
}

/**
 * CI smoke: voice clip → fake recorder chunks → transcript → stop+send payload.
 * No network; Gemini responses are simulated via the fake socket.
 */
describe("voice clip → transcript → stop+send", () => {
	let socketBundle: ReturnType<typeof createFakeSocket>;
	let recorder: ReturnType<typeof createFakeRecorder>;
	let accumulator: VoiceTranscriptAccumulator;
	let inputValue: string;
	let sink: TranscriptSink;
	let sentMessages: string[];

	const flush = () => new Promise((r) => setTimeout(r, 0));

	beforeEach(() => {
		socketBundle = createFakeSocket();
		recorder = createFakeRecorder();
		accumulator = new VoiceTranscriptAccumulator();
		inputValue = "";
		sentMessages = [];
		accumulator.begin("");
		sink = {
			onInterim: (text) => {
				const preview = accumulator.applyInterim(text);
				if (preview !== null) inputValue = preview;
			},
			onFinal: (text) => {
				const committed = accumulator.applyFinal(text);
				if (committed !== null) inputValue = committed;
			},
			onError: vi.fn(),
		};
	});

	async function startTranscriber(): Promise<LiveTranscriber> {
		const t = new LiveTranscriber("key", "gemini-3.5-transcribe-live", {
			createSocket: () => socketBundle.socket,
			audioSource: recorder,
			flushDelayMs: 0,
		});
		const p = t.start(sink);
		socketBundle.socket.onopen?.();
		socketBundle.socket.onmessage?.({
			data: wsMsg({ setupComplete: true }),
		});
		await p;
		return t;
	}

	it("replays a WAV fixture, accumulates transcript, and stop+send captures it", async () => {
		const transcriber = await startTranscriber();
		const chunks = loadWavAsPcmChunks();
		expect(chunks.length).toBeGreaterThan(0);

		for (const chunk of chunks) {
			recorder.emitChunk(chunk);
		}

		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: {
					interimInputTranscription: { text: "hello" },
				},
			}),
		});
		await flush();
		expect(inputValue).toContain("hello");

		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: {
					inputTranscription: { text: "hello world" },
				},
			}),
		});
		await flush();
		expect(inputValue).toBe("hello world");

		const messageToSend = captureVoiceMessageForSend(inputValue);
		await transcriber.stop();
		inputValue = accumulator.discardInterim();

		expect(messageToSend).toBe("hello world");
		sentMessages.push(messageToSend);
		expect(sentMessages).toEqual(["hello world"]);
	});

	it("stop+send keeps interim preview in the captured message", async () => {
		await startTranscriber();
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: {
					interimInputTranscription: { text: "partial phrase" },
				},
			}),
		});
		await flush();

		const messageToSend = captureVoiceMessageForSend(inputValue);
		expect(messageToSend).toBe("partial phrase");
	});
});
