/**
 * Gemini Live WebSocket message helpers.
 *
 * The Live API requires setupComplete before any realtimeInput, and
 * realtime audio must use `audio` (mediaChunks is deprecated).
 */

export const LIVE_WS_URL =
	"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent";

export const PCM_MIME = "audio/pcm;rate=16000";
export const TARGET_SAMPLE_RATE = 16000;

export type GeminiTranscriptionMode = "smart" | "verbatim";

export interface LiveTranscript {
	setupComplete?: boolean;
	interimText?: string;
	finalText?: string;
	errorMessage?: string;
}

export interface LiveSetupOptions {
	languageCodes?: string[];
	transcriptionMode?: GeminiTranscriptionMode;
	customVocabulary?: string[];
	systemPrompt?: string;
	/** Pause tolerance before the server ends a speech turn (ms). Default 2000. */
	silenceDurationMs?: number;
}

/** Hybrid VAD tuned for natural pauses during dictation (see whisper fork RCA). */
export const DEFAULT_SILENCE_DURATION_MS = 2000;

export function setupMessage(
	model: string,
	options: LiveSetupOptions = {},
): Record<string, unknown> {
	const modelId = model.startsWith("models/") ? model : `models/${model}`;
	const inputAudioTranscription: Record<string, unknown> = {
		mode: options.transcriptionMode ?? "smart",
	};
	if (options.languageCodes?.length) {
		inputAudioTranscription.languageCodes = options.languageCodes;
	}
	if (options.customVocabulary?.length) {
		inputAudioTranscription.customVocabulary = options.customVocabulary;
	}

	const setup: Record<string, unknown> = {
		model: modelId,
		generationConfig: {
			responseModalities: ["TEXT"],
		},
		inputAudioTranscription,
		realtimeInputConfig: {
			automaticActivityDetection: {
				disabled: false,
				startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
				endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
				silenceDurationMs:
					options.silenceDurationMs ?? DEFAULT_SILENCE_DURATION_MS,
				prefixPaddingMs: 300,
			},
		},
	};

	const prompt = options.systemPrompt?.trim();
	if (prompt) {
		setup.systemInstruction = {
			parts: [{ text: prompt }],
		};
	}

	return { setup };
}

export function realtimeAudioMessage(
	base64Pcm: string,
): Record<string, unknown> {
	return {
		realtimeInput: {
			audio: {
				mimeType: PCM_MIME,
				data: base64Pcm,
			},
		},
	};
}

export function audioStreamEndMessage(): Record<string, unknown> {
	return {
		realtimeInput: {
			audioStreamEnd: true,
		},
	};
}

export function parseLiveMessage(msg: unknown): LiveTranscript {
	if (!msg || typeof msg !== "object") {
		return {};
	}
	const m = msg as Record<string, unknown>;
	const result: LiveTranscript = {};

	if (m.setupComplete) {
		result.setupComplete = true;
	}

	if (m.error && typeof m.error === "object") {
		const err = m.error as Record<string, unknown>;
		result.errorMessage =
			(err.message as string) ||
			(err.status as string) ||
			JSON.stringify(m.error);
	}

	const sc = m.serverContent as Record<string, unknown> | undefined;
	const interim =
		(sc?.interimInputTranscription as Record<string, unknown> | undefined)
			?.text ?? (m.interimInputTranscription as Record<string, unknown> | undefined)?.text;
	const final =
		(sc?.inputTranscription as Record<string, unknown> | undefined)
			?.text ?? (m.inputTranscription as Record<string, unknown> | undefined)?.text;

	if (typeof interim === "string" && interim) {
		result.interimText = interim;
	}
	if (typeof final === "string" && final) {
		result.finalText = final;
	}

	return result;
}

export async function decodeWsData(data: unknown): Promise<string> {
	if (typeof data === "string") {
		return data;
	}
	if (typeof Blob !== "undefined" && data instanceof Blob) {
		return data.text();
	}
	if (data instanceof ArrayBuffer) {
		return new TextDecoder().decode(data);
	}
	if (ArrayBuffer.isView(data)) {
		return new TextDecoder().decode(data);
	}
	return String(data);
}

/**
 * Synchronous version of decodeWsData for the hot path.
 * Throws on Blob (which requires async) but handles strings, ArrayBuffer,
 * and ArrayBufferView synchronously.
 */
export function decodeWsDataSync(data: unknown): string {
	if (typeof data === "string") {
		return data;
	}
	if (data instanceof ArrayBuffer) {
		return new TextDecoder().decode(data);
	}
	if (ArrayBuffer.isView(data)) {
		return new TextDecoder().decode(data);
	}
	if (typeof Blob !== "undefined" && data instanceof Blob) {
		throw new Error("Cannot decode Blob synchronously");
	}
	return String(data);
}

/** Linear resample to 16 kHz. No-op when already at the target rate. */
export function resampleTo16k(
	input: Float32Array,
	inputRate: number,
): Float32Array {
	if (!input.length || inputRate === TARGET_SAMPLE_RATE) {
		return input;
	}
	if (inputRate <= 0) {
		return input;
	}
	const ratio = inputRate / TARGET_SAMPLE_RATE;
	const outLength = Math.max(1, Math.floor(input.length / ratio));
	const output = new Float32Array(outLength);
	for (let i = 0; i < outLength; i++) {
		const srcIndex = i * ratio;
		const i0 = Math.min(Math.floor(srcIndex), input.length - 1);
		const i1 = Math.min(i0 + 1, input.length - 1);
		const frac = srcIndex - i0;
		output[i] = input[i0] * (1 - frac) + input[i1] * frac;
	}
	return output;
}

export function floatToPcm16Base64(samples: Float32Array): string {
	const pcm = new Int16Array(samples.length);
	for (let i = 0; i < samples.length; i++) {
		const s = Math.max(-1, Math.min(1, samples[i]));
		pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
	}
	const bytes = new Uint8Array(pcm.buffer);
	if (typeof btoa === "function") {
		let binary = "";
		for (let i = 0; i < bytes.length; i++) {
			binary += String.fromCharCode(bytes[i]);
		}
		return btoa(binary);
	}
	return Buffer.from(bytes).toString("base64");
}