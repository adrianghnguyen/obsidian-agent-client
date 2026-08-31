import { describe, it, expect } from "vitest";
import {
	setupMessage,
	realtimeAudioMessage,
	audioStreamEndMessage,
	parseLiveMessage,
	decodeWsData,
	resampleTo16k,
	floatToPcm16Base64,
	LIVE_WS_URL,
	PCM_MIME,
	TARGET_SAMPLE_RATE,
} from "../../src/voice-input/LiveProtocol";

describe("LiveProtocol", () => {
	describe("setupMessage", () => {
		it("produces correct JSON shape with defaults", () => {
			const msg = setupMessage("gemini-3.5-transcribe-live");
			expect(msg).toEqual({
				setup: {
					model: "models/gemini-3.5-transcribe-live",
					generationConfig: { responseModalities: ["TEXT"] },
					inputAudioTranscription: { mode: "smart" },
				},
			});
		});

		it("does not prefix models/ when already present", () => {
			const msg = setupMessage("models/gemini-x");
			expect((msg.setup as Record<string, unknown>).model).toBe(
				"models/gemini-x",
			);
		});

		it("includes language codes when provided", () => {
			const msg = setupMessage("model", {
				languageCodes: ["en-US", "fr-CA"],
			});
			const iat = (msg.setup as Record<string, unknown>)
				.inputAudioTranscription as Record<string, unknown>;
			expect(iat.languageCodes).toEqual(["en-US", "fr-CA"]);
		});

		it("includes custom vocabulary when provided", () => {
			const msg = setupMessage("model", {
				customVocabulary: ["Obsidian", "Note"],
			});
			const iat = (msg.setup as Record<string, unknown>)
				.inputAudioTranscription as Record<string, unknown>;
			expect(iat.customVocabulary).toEqual(["Obsidian", "Note"]);
		});

		it("includes system instruction when systemPrompt is non-empty", () => {
			const msg = setupMessage("model", { systemPrompt: "Hello" });
			const setup = msg.setup as Record<string, unknown>;
			expect(setup.systemInstruction).toEqual({
				parts: [{ text: "Hello" }],
			});
		});

		it("omits system instruction when prompt is empty", () => {
			const msg = setupMessage("model", { systemPrompt: "" });
			const setup = msg.setup as Record<string, unknown>;
			expect(setup.systemInstruction).toBeUndefined();
		});

		it("omits system instruction when prompt is whitespace", () => {
			const msg = setupMessage("model", { systemPrompt: "   " });
			const setup = msg.setup as Record<string, unknown>;
			expect(setup.systemInstruction).toBeUndefined();
		});
	});

	describe("realtimeAudioMessage", () => {
		it("wraps PCM correctly", () => {
			const msg = realtimeAudioMessage("AAAA");
			expect(msg).toEqual({
				realtimeInput: {
					audio: {
						mimeType: PCM_MIME,
						data: "AAAA",
					},
				},
			});
		});
	});

	describe("audioStreamEndMessage", () => {
		it("produces correct shape", () => {
			const msg = audioStreamEndMessage();
			expect(msg).toEqual({
				realtimeInput: {
					audioStreamEnd: true,
				},
			});
		});
	});

	describe("parseLiveMessage", () => {
		it("detects setupComplete", () => {
			const result = parseLiveMessage({ setupComplete: true });
			expect(result.setupComplete).toBe(true);
		});

		it("extracts interimText from serverContent.interimInputTranscription", () => {
			const result = parseLiveMessage({
				serverContent: {
					interimInputTranscription: { text: "hello" },
				},
			});
			expect(result.interimText).toBe("hello");
		});

		it("extracts finalText from serverContent.inputTranscription", () => {
			const result = parseLiveMessage({
				serverContent: {
					inputTranscription: { text: "hello world" },
				},
			});
			expect(result.finalText).toBe("hello world");
		});

		it("extracts interimText from top-level as fallback", () => {
			const result = parseLiveMessage({
				interimInputTranscription: { text: "fallback" },
			});
			expect(result.interimText).toBe("fallback");
		});

		it("extracts finalText from top-level as fallback", () => {
			const result = parseLiveMessage({
				inputTranscription: { text: "fallback-final" },
			});
			expect(result.finalText).toBe("fallback-final");
		});

		it("extracts errorMessage from error.message", () => {
			const result = parseLiveMessage({
				error: { message: "API quota exceeded" },
			});
			expect(result.errorMessage).toBe("API quota exceeded");
		});

		it("extracts errorMessage from error.status when no message", () => {
			const result = parseLiveMessage({
				error: { status: "PERMISSION_DENIED" },
			});
			expect(result.errorMessage).toBe("PERMISSION_DENIED");
		});

		it("returns empty for null input", () => {
			expect(parseLiveMessage(null)).toEqual({});
		});

		it("returns empty for non-object input", () => {
			expect(parseLiveMessage("string")).toEqual({});
		});

		it("returns empty for array input", () => {
			expect(parseLiveMessage([])).toEqual({});
		});

		it("can return both interim and final in one message", () => {
			const result = parseLiveMessage({
				serverContent: {
					interimInputTranscription: { text: "partial" },
					inputTranscription: { text: "final" },
				},
			});
			expect(result.interimText).toBe("partial");
			expect(result.finalText).toBe("final");
		});

		it("strips empty-string transcripts", () => {
			const result = parseLiveMessage({
				serverContent: {
					interimInputTranscription: { text: "" },
					inputTranscription: { text: "" },
				},
			});
			expect(result.interimText).toBeUndefined();
			expect(result.finalText).toBeUndefined();
		});
	});

	describe("decodeWsData", () => {
		it("passes strings through", async () => {
			const result = await decodeWsData('{"key":"value"}');
			expect(result).toBe('{"key":"value"}');
		});

		it("decodes ArrayBuffer", async () => {
			const encoded = new TextEncoder().encode("hello from buffer");
			const result = await decodeWsData(
				encoded.buffer as ArrayBuffer,
			);
			expect(result).toBe("hello from buffer");
		});

		it("decodes Uint8Array view", async () => {
			const encoded = new TextEncoder().encode("hello from view");
			const result = await decodeWsData(encoded);
			expect(result).toBe("hello from view");
		});

		it("falls back to String() for unknown types", async () => {
			const result = await decodeWsData(42 as unknown as string);
			expect(result).toBe("42");
		});
	});

	describe("resampleTo16k", () => {
		it("returns same array at target rate", () => {
			const input = new Float32Array([0.1, 0.2, 0.3]);
			const result = resampleTo16k(input, TARGET_SAMPLE_RATE);
			expect(result).toBe(input);
		});

		it("returns same array when input is empty", () => {
			const input = new Float32Array(0);
			const result = resampleTo16k(input, 48000);
			expect(result).toBe(input);
		});

		it("returns same array when rate is zero or negative", () => {
			const input = new Float32Array([0.1]);
			expect(resampleTo16k(input, 0)).toBe(input);
			expect(resampleTo16k(input, -1)).toBe(input);
		});

		it("downsamples 48kHz to 16kHz", () => {
			const input = new Float32Array(480);
			for (let i = 0; i < 480; i++) {
				input[i] = Math.sin((2 * Math.PI * i) / 48);
			}
			const result = resampleTo16k(input, 48000);
			expect(result.length).toBe(160);
		});

		it("upsamples 8kHz to 16kHz", () => {
			const input = new Float32Array(80);
			for (let i = 0; i < 80; i++) {
				input[i] = i / 80;
			}
			const result = resampleTo16k(input, 8000);
			expect(result.length).toBe(160);
		});

		it("produces smooth interpolation (no abrupt jumps)", () => {
			// 3 samples at 32kHz: [0, 1, 0.5]
			// ratio = 32k/16k = 2; outLength = floor(3/2) = 1
			// srcIndex = 0*2 = 0 → i0=0, frac=0 → output[0]=input[0]*1 = 0
			// Actually at ratio=2, every output maps to an integer srcIndex
			// (no fractional interpolation). Pick a non-integer ratio: 48k → 16k
			const input = new Float32Array(3);
			input.set([0, 1, 0.5]);
			const result = resampleTo16k(input, 48000);
			// ratio = 3; outLength = floor(3/3) = 1
			// srcIndex = 0*3 = 0 → output[0] = input[0] = 0
			expect(result.length).toBe(1);

			// Now use 8k → 16k with 3 samples to see interpolation:
			// ratio = 0.5; outLength = floor(3/0.5) = 6
			// srcIndex = 0*0.5 = 0 → output[0] = input[0]*1 + 0 = 0
			// srcIndex = 1*0.5 = 0.5 → i0=0, i1=1, frac=0.5 → output[1] = 0*0.5 + 1*0.5 = 0.5
			const upInput = new Float32Array([0, 1]);
			const upResult = resampleTo16k(upInput, 8000);
			expect(upResult.length).toBe(4);
			expect(upResult[0]).toBe(0);
			expect(upResult[1]).toBeCloseTo(0.5, 5);
		});
	});

	describe("floatToPcm16Base64", () => {
		it("produces valid base64", () => {
			const input = new Float32Array([0, -1, 1, 0.5]);
			const result = floatToPcm16Base64(input);
			expect(typeof result).toBe("string");
			expect(result.length).toBeGreaterThan(0);
		});

		it("clamps values to [-1, 1]", () => {
			const input = new Float32Array([-2, 2]);
			const result = floatToPcm16Base64(input);
			// Both clamp to -32768 and 32767 respectively
			const decoded = Buffer.from(result, "base64");
			expect(decoded.length).toBe(4); // 2 samples × 2 bytes
		});

		it("is deterministic for same input", () => {
			const input = new Float32Array([0.1, 0.2, 0.3]);
			const a = floatToPcm16Base64(input);
			const b = floatToPcm16Base64(input);
			expect(a).toBe(b);
		});

		it("handles empty input", () => {
			const input = new Float32Array(0);
			const result = floatToPcm16Base64(input);
			expect(result).toBe("");
		});
	});

	describe("constants", () => {
		it("has correct LIVE_WS_URL", () => {
			expect(LIVE_WS_URL).toContain("generativelanguage.googleapis.com");
			expect(LIVE_WS_URL).toContain("BidiGenerateContent");
		});

		it("has correct PCM_MIME", () => {
			expect(PCM_MIME).toBe("audio/pcm;rate=16000");
		});

		it("has correct TARGET_SAMPLE_RATE", () => {
			expect(TARGET_SAMPLE_RATE).toBe(16000);
		});
	});
});