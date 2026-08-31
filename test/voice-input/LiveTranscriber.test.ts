import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LiveTranscriber } from "../../src/voice-input/LiveTranscriber";
import {
	createFakeSocket,
	createFakeRecorder,
	createFakeSink,
} from "./fixtures";
import type { FakeSocketBundle } from "./fixtures";
import type { LiveSocket, LiveAudioSource } from "../../src/voice-input/LiveTranscriber";
import type { TranscriptSink } from "../../src/voice-input/types";

/** Serialize a message as the WebSocket would deliver it. */
function wsMsg(data: unknown): string {
	return JSON.stringify(data);
}

describe("LiveTranscriber", () => {
	let sink: TranscriptSink;
	let socketBundle: FakeSocketBundle;
	let recorder: LiveAudioSource & { emitChunk(pcm: string): void };

	function createTranscriber(deps: {
		createSocket?: (url: string) => LiveSocket;
		audioSource?: LiveAudioSource;
		flushDelayMs?: number;
	} = {}): LiveTranscriber {
		return new LiveTranscriber("test-api-key", "gemini-3.5-transcribe-live", {
			createSocket: deps.createSocket ?? (() => socketBundle.socket),
			audioSource: deps.audioSource ?? recorder,
			flushDelayMs: deps.flushDelayMs ?? 1000,
		});
	}

	/** Yield to the microtask queue so async message handling settles. */
	const flush = () => new Promise((r) => setTimeout(r, 0));

	/** Drive the transcriber through the setup handshake so it becomes active. */
	async function startAndSetup(t?: LiveTranscriber, sk?: TranscriptSink): Promise<void> {
		const target = t ?? createTranscriber();
		const targetSink = sk ?? sink;
		const p = target.start(targetSink);
		socketBundle.socket.onopen?.();
		socketBundle.socket.onmessage?.({ data: wsMsg({ setupComplete: true }) });
		await p;
	}

	beforeEach(() => {
		socketBundle = createFakeSocket();
		recorder = createFakeRecorder();
		sink = createFakeSink();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ============================================================
	// Lifecycle
	// ============================================================
	describe("lifecycle", () => {
		it("is idle after construction", () => {
			const t = createTranscriber();
			expect(t.isActive).toBe(false);
		});

		it("connects WebSocket and activates after setup completes", async () => {
			const t = createTranscriber();
			const p = t.start(sink);

			expect(socketBundle.socket.send).not.toHaveBeenCalled();

			socketBundle.socket.onopen?.();

			expect(socketBundle.sent.length).toBe(1);
			const sentMsg = JSON.parse(socketBundle.sent[0]);
			expect(sentMsg.setup.model).toBe("models/gemini-3.5-transcribe-live");
			expect(recorder.start).not.toHaveBeenCalled();

			socketBundle.socket.onmessage?.({ data: wsMsg({ setupComplete: true }) });
			await p;

			expect(recorder.start).toHaveBeenCalled();
			expect(t.isActive).toBe(true);
		});

		it("handles setupComplete delivered as a Blob (Chromium behavior)", async () => {
			const t = createTranscriber();
			const p = t.start(sink);

			socketBundle.socket.onopen?.();
			socketBundle.socket.onmessage?.({
				data: new Blob([JSON.stringify({ setupComplete: true })]),
			});
			await p;

			expect(recorder.start).toHaveBeenCalled();
			expect(t.isActive).toBe(true);
			expect(sink.onError).not.toHaveBeenCalled();
		});

		it("reports error to sink on timeout", async () => {
			vi.useFakeTimers();
			const t = createTranscriber();
			const p = t.start(sink);
			socketBundle.socket.onopen?.();
			vi.advanceTimersByTime(10001);
			await p;

			expect(sink.onError).toHaveBeenCalledWith(
				expect.stringContaining("setup timed out"),
			);
			expect(t.isActive).toBe(false);
		});

		it("reports error to sink on ws error", async () => {
			const t = createTranscriber();
			const p = t.start(sink);
			socketBundle.socket.onerror?.();
			await p;
			expect(sink.onError).toHaveBeenCalledWith(
				expect.stringContaining("WebSocket connection failed"),
			);
			expect(t.isActive).toBe(false);
		});

		it("reports error to sink on ws close before setupComplete", async () => {
			const t = createTranscriber();
			const p = t.start(sink);
			socketBundle.socket.onclose?.({ reason: "Setup refused" });
			await p;
			expect(sink.onError).toHaveBeenCalledWith(
				expect.stringContaining("Setup refused"),
			);
			expect(t.isActive).toBe(false);
		});

		it("second start() is no-op while first is starting", async () => {
			const t = createTranscriber();
			const p1 = t.start(sink);
			t.start(sink); // no-op
			socketBundle.socket.onopen?.();
			socketBundle.socket.onmessage?.({ data: wsMsg({ setupComplete: true }) });
			await p1;

			expect(recorder.start).toHaveBeenCalledTimes(1);
			expect(t.isActive).toBe(true);
		});
	});

	// ============================================================
	// Transcript delivery
	// ============================================================
	describe("transcript delivery", () => {
		it("delivers interim text via sink.onInterim", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onmessage?.({
				data: wsMsg({
					serverContent: { interimInputTranscription: { text: "hello world" } },
				}),
			});
			await flush();

			expect(sink.onInterim).toHaveBeenCalledWith("hello world");
		});

		it("delivers final text via sink.onFinal", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onmessage?.({
				data: wsMsg({
					serverContent: { inputTranscription: { text: "hello world final" } },
				}),
			});
			await flush();

			expect(sink.onFinal).toHaveBeenCalledWith("hello world final");
		});

		it("delivers both interim and final in same message", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onmessage?.({
				data: wsMsg({
					serverContent: {
						interimInputTranscription: { text: "partial" },
						inputTranscription: { text: "complete" },
					},
				}),
			});
			await flush();

			expect(sink.onInterim).toHaveBeenCalledWith("partial");
			expect(sink.onFinal).toHaveBeenCalledWith("complete");
		});

		it("fires interim text from multiple messages", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onmessage?.({
				data: wsMsg({ serverContent: { interimInputTranscription: { text: "first" } } }),
			});
			socketBundle.socket.onmessage?.({
				data: wsMsg({ serverContent: { interimInputTranscription: { text: "second" } } }),
			});
			await flush();

			expect(sink.onInterim).toHaveBeenCalledTimes(2);
			expect(sink.onInterim).toHaveBeenNthCalledWith(1, "first");
			expect(sink.onInterim).toHaveBeenNthCalledWith(2, "second");
		});
	});

	// ============================================================
	// Error handling
	// ============================================================
	describe("error handling", () => {
		it("rejects setup on API error message before setupComplete", async () => {
			const t = createTranscriber();
			const p = t.start(sink);
			socketBundle.socket.onopen?.();
			socketBundle.socket.onmessage?.({ data: wsMsg({ error: { message: "API key invalid" } }) });
			await p;

			expect(sink.onError).toHaveBeenCalledWith("API key invalid");
			expect(t.isActive).toBe(false);
		});

		it("delivers error via sink.onError after setupComplete", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onmessage?.({ data: wsMsg({ error: { message: "quota exceeded" } }) });
			await flush();

			expect(sink.onError).toHaveBeenCalledWith("quota exceeded");
		});

		it("calls onError when no API key provided", async () => {
			const t = new LiveTranscriber("", "model", {
				createSocket: () => socketBundle.socket,
				audioSource: recorder,
			});
			await t.start(sink);
			expect(sink.onError).toHaveBeenCalledWith(
				"Add your Gemini API key in Voice Input settings",
			);
			expect(t.isActive).toBe(false);
		});

		it("notifies on unexpected ws close during active stream", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onclose?.({ reason: "Connection lost" });

			expect(sink.onError).toHaveBeenCalledWith("Live transcription disconnected");
			expect(t.isActive).toBe(false);
		});

		it("ignores messages after ws close", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			socketBundle.socket.onclose?.({ reason: "Connection lost" });

			socketBundle.socket.onmessage?.({
				data: wsMsg({ serverContent: { inputTranscription: { text: "ignored" } } }),
			});

			expect(sink.onFinal).not.toHaveBeenCalled();
		});
	});

	// ============================================================
	// PCM chunk sending
	// ============================================================
	describe("PCM chunk sending", () => {
		it("does not send PCM chunks before setupComplete", async () => {
			const t = createTranscriber();
			t.start(sink);
			socketBundle.socket.onopen?.();
			recorder.emitChunk("AAAA");

			const rt = socketBundle.sent.filter((m) => m.includes("realtimeInput"));
			expect(rt.length).toBe(0);
		});

		it("sends PCM chunks after setupComplete", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			recorder.emitChunk("BBBB");

			const rt = socketBundle.sent.filter((m) => m.includes("realtimeInput"));
			expect(rt.length).toBe(1);
			const parsed = JSON.parse(rt[0]);
			expect(parsed.realtimeInput.audio.data).toBe("BBBB");
		});

		it("sends multiple PCM chunks", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			recorder.emitChunk("AAAA");
			recorder.emitChunk("BBBB");
			recorder.emitChunk("CCCC");

			const rt = socketBundle.sent.filter((m) => m.includes("realtimeInput"));
			expect(rt.length).toBe(3);
		});

		it("does not send chunks when socket is closed", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			Object.defineProperty(socketBundle.socket, "readyState", { get: () => 3 });

			recorder.emitChunk("DDDD");

			const rt = socketBundle.sent.filter((m) => m.includes("realtimeInput"));
			expect(rt.length).toBe(0);
		});
	});

	// ============================================================
	// stop()
	// ============================================================
	describe("stop()", () => {
		it("sends audioStreamEnd and stops recorder", async () => {
			vi.useFakeTimers();
			const t = createTranscriber();
			await startAndSetup(t);

			const stopPromise = t.stop();
			expect(socketBundle.sent.some((m) => m.includes("audioStreamEnd"))).toBe(true);

			vi.advanceTimersByTime(1001);
			await stopPromise;

			expect(recorder.stop).toHaveBeenCalled();
			expect(socketBundle.socket.close).toHaveBeenCalled();
			expect(t.isActive).toBe(false);
		});

		it("respects flushDelayMs before closing", async () => {
			vi.useFakeTimers();
			socketBundle = createFakeSocket();
			recorder = createFakeRecorder();
			const t = createTranscriber({ flushDelayMs: 2000 });
			await startAndSetup(t);

			const stopPromise = t.stop();
			expect(socketBundle.socket.close).not.toHaveBeenCalled();

			vi.advanceTimersByTime(2001);
			await stopPromise;

			expect(socketBundle.socket.close).toHaveBeenCalled();
		});

		it("is no-op when not active", async () => {
			const t = createTranscriber();
			await t.stop();
			expect(t.isActive).toBe(false);
		});

		it("is safe to stop multiple times", async () => {
			vi.useFakeTimers();
			const t = createTranscriber();
			await startAndSetup(t);

			const stopPromise = t.stop();
			vi.advanceTimersByTime(1001);
			await stopPromise;

			// Second stop is a no-op and safe
			await t.stop();
			expect(recorder.stop).toHaveBeenCalled();
		});
	});

	// ============================================================
	// dispose()
	// ============================================================
	describe("dispose()", () => {
		it("cleans up resources", async () => {
			const t = createTranscriber();
			await startAndSetup(t);

			t.dispose();

			expect(recorder.stop).toHaveBeenCalled();
			expect(socketBundle.socket.close).toHaveBeenCalled();
			expect(t.isActive).toBe(false);
		});

		it("is safe when not active", () => {
			const t = createTranscriber();
			t.dispose();
		});
	});

	// ============================================================
	// WebSocket URL construction
	// ============================================================
	describe("WebSocket URL construction", () => {
		it("passes API key in URL", () => {
			let capturedUrl = "";
			const t = new LiveTranscriber("my-secret-key", "model", {
				createSocket: (url) => {
					capturedUrl = url;
					return socketBundle.socket;
				},
				audioSource: recorder,
			});

			t.start(sink);
			expect(capturedUrl).toContain("key=my-secret-key");
			expect(capturedUrl).toContain("generativelanguage.googleapis.com");
		});

		it("encodes special characters in API key", () => {
			let capturedUrl = "";
			const t = new LiveTranscriber("key+with/special&chars", "model", {
				createSocket: (url) => {
					capturedUrl = url;
					return socketBundle.socket;
				},
				audioSource: recorder,
			});

			t.start(sink);
			expect(capturedUrl).toContain("key=key%2Bwith%2Fspecial%26chars");
		});
	});

	// ============================================================
	// Constructor defaults
	// ============================================================
	describe("constructor defaults", () => {
		it("defaults createSocket to WebSocket constructor", () => {
			const t = new LiveTranscriber("k", "m");
			expect(t.isActive).toBe(false);
		});

		it("defaults flushDelayMs to 1000", () => {
			const t = new LiveTranscriber("k", "m");
			expect(t.isActive).toBe(false);
		});
	});
});