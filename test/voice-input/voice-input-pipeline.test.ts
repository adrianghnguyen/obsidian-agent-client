import { describe, it, expect, vi, beforeEach } from "vitest";
import { LiveTranscriber } from "../../src/voice-input/LiveTranscriber";
import { VoiceTranscriptAccumulator } from "../../src/voice-input/transcript-accumulation";
import {
	createFakeSocket,
	createFakeRecorder,
} from "./fixtures";
import type { TranscriptSink } from "../../src/voice-input/types";

/** Serialize a message as the WebSocket would deliver it. */
function wsMsg(data: unknown): string {
	return JSON.stringify(data);
}

/**
 * Pressure test: LiveTranscriber segment passthrough + VoiceTranscriptAccumulator
 * must produce readable multi-segment dictation without duplication or truncation.
 */
describe("voice input pipeline (transcriber + accumulator)", () => {
	let socketBundle: ReturnType<typeof createFakeSocket>;
	let recorder: ReturnType<typeof createFakeRecorder>;
	let accumulator: VoiceTranscriptAccumulator;
	let inputValue: string;
	let sink: TranscriptSink;

	const flush = () => new Promise((r) => setTimeout(r, 0));

	beforeEach(() => {
		socketBundle = createFakeSocket();
		recorder = createFakeRecorder();
		accumulator = new VoiceTranscriptAccumulator();
		inputValue = "Explain ";
		accumulator.begin(inputValue);
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

	it("renders multi-segment dictation without duplicating earlier segments", async () => {
		await startTranscriber();

		// Segment 1: interim refinements then final
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { interimInputTranscription: { text: "this" } },
			}),
		});
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { interimInputTranscription: { text: "this bug" } },
			}),
		});
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { inputTranscription: { text: "this bug" } },
			}),
		});
		await flush();
		expect(inputValue).toBe("Explain this bug");

		// Pause, then segment 2 after server VAD re-arms
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { interimInputTranscription: { text: "in" } },
			}),
		});
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: {
					interimInputTranscription: { text: "in detail" },
				},
			}),
		});
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { inputTranscription: { text: "in detail" } },
			}),
		});
		await flush();

		expect(inputValue).toBe("Explain this bug in detail");
		expect(inputValue).not.toContain("this bug this bug");
		expect(inputValue).not.toContain("in detail in detail");
	});

	it("replaces interim with final within a segment without leaving stale text", async () => {
		await startTranscriber();

		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: {
					interimInputTranscription: { text: "hel" },
				},
			}),
		});
		await flush();
		expect(inputValue).toBe("Explain hel");

		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: {
					interimInputTranscription: { text: "hello" },
					inputTranscription: { text: "hello" },
				},
			}),
		});
		await flush();

		expect(inputValue).toBe("Explain hello");
	});

	it("stop discards trailing interim but keeps finalized segments", async () => {
		await startTranscriber();

		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { inputTranscription: { text: "done" } },
			}),
		});
		socketBundle.socket.onmessage?.({
			data: wsMsg({
				serverContent: { interimInputTranscription: { text: "partial" } },
			}),
		});
		await flush();
		expect(inputValue).toBe("Explain done partial");

		inputValue = accumulator.discardInterim();
		expect(inputValue).toBe("Explain done");
	});
});
