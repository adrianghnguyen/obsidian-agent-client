/**
 * Live smoke (manual / pre-release). Skipped unless GEMINI_API_KEY is set.
 *
 *   GEMINI_API_KEY=... npm run smoke:voice
 */
import { describe, it, expect } from "vitest";
import { LiveTranscriber } from "../../src/voice-input/LiveTranscriber";
import {
	ensureSampleSpeechWav,
	loadWavAsPcmChunks,
	SAMPLE_SPEECH_WAV,
} from "./wav-fixture";
import type { LiveAudioSource } from "../../src/voice-input/LiveTranscriber";

const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const timeoutMs = Number(process.env.SMOKE_VOICE_TIMEOUT_MS || 45000);

describe.skipIf(!apiKey)("smoke:voice (live Gemini)", () => {
	it(
		"transcribes sample-speech.wav via Gemini Live",
		async () => {
			ensureSampleSpeechWav(SAMPLE_SPEECH_WAV);
			const chunks = loadWavAsPcmChunks(SAMPLE_SPEECH_WAV);
			expect(chunks.length).toBeGreaterThan(0);

			const audioSource: LiveAudioSource = {
				setDeviceId() {},
				async start(onChunk) {
					for (const c of chunks) onChunk(c);
				},
				stop() {},
				getLevel: () => 0.5,
			};

			const model =
				process.env.GEMINI_LIVE_MODEL || "gemini-3.5-transcribe-live";
			const finals: string[] = [];
			const interims: string[] = [];

			const t = new LiveTranscriber(apiKey!, model, {
				audioSource,
				flushDelayMs: 1500,
			});

			await new Promise<void>((resolve, reject) => {
				const timer = setTimeout(() => {
					reject(
						new Error(
							`Timed out after ${timeoutMs}ms. Interims: ${JSON.stringify(interims)}`,
						),
					);
				}, timeoutMs);

				void t
					.start({
						onInterim(text) {
							interims.push(text);
						},
						onFinal(text) {
							finals.push(text);
							clearTimeout(timer);
							resolve();
						},
						onError(err) {
							clearTimeout(timer);
							reject(new Error(err));
						},
					})
					.catch((err) => {
						clearTimeout(timer);
						reject(err);
					});
			});

			await t.stop();
			expect(finals.join(" ").trim().length).toBeGreaterThan(0);
		},
		timeoutMs + 5000,
	);
});
