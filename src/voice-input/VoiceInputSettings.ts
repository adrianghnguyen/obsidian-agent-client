export type VoiceTranscriptionMode = "smart" | "verbatim";

/** Gemini Live `automaticActivityDetection.startOfSpeechSensitivity`. */
export type StartOfSpeechSensitivity =
	| "START_SENSITIVITY_HIGH"
	| "START_SENSITIVITY_LOW";

/** Gemini Live `automaticActivityDetection.endOfSpeechSensitivity`. */
export type EndOfSpeechSensitivity =
	| "END_SENSITIVITY_LOW"
	| "END_SENSITIVITY_HIGH";

/**
 * Settings for the voice input (Gemini Live) feature.
 * Lives inside AgentClientPluginSettings as `voiceInput`.
 */
export interface VoiceInputSettings {
	/** Master toggle for the feature. */
	enabled: boolean;
	/** Obsidian secretStorage id holding the Gemini API key (never plaintext). */
	geminiApiKeySecretId: string;
	/** Gemini Live model id (e.g. `gemini-3.5-transcribe-live`). */
	model: string;
	/** Transcription mode: smart or verbatim. */
	transcriptionMode: VoiceTranscriptionMode;
	/** Optional extra language codes, comma-separated. */
	languageCodes: string;
	/** Custom vocabulary terms (comma- or newline-separated). */
	customVocabulary: string;
	/** Audio input device id; "default" uses the system mic. */
	audioDeviceId: string;
	/**
	 * How long the Live API waits through silence before ending a speech
	 * turn (`silenceDurationMs`). Higher values tolerate thinking pauses.
	 */
	silenceDurationMs: number;
	/** Ms to wait after stop before closing the WebSocket (final transcript flush). */
	flushDelayMs: number;
	/** Audio included before detected speech start (`prefixPaddingMs`). */
	prefixPaddingMs: number;
	startOfSpeechSensitivity: StartOfSpeechSensitivity;
	endOfSpeechSensitivity: EndOfSpeechSensitivity;
}

export const DEFAULT_VOICE_INPUT: VoiceInputSettings = {
	enabled: false,
	geminiApiKeySecretId: "",
	model: "gemini-3.5-transcribe-live",
	transcriptionMode: "smart",
	languageCodes: "",
	customVocabulary: "",
	audioDeviceId: "default",
	silenceDurationMs: 2000,
	flushDelayMs: 1000,
	prefixPaddingMs: 300,
	startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
	endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
};

/** Obsidian secret id used by the Voice Input settings tab. */
export const VOICE_INPUT_SECRET_ID = "agent-client-gemini-live-api-key";

const SILENCE_MS_MIN = 500;
const SILENCE_MS_MAX = 8000;
const FLUSH_MS_MIN = 0;
const FLUSH_MS_MAX = 5000;
const PREFIX_MS_MIN = 0;
const PREFIX_MS_MAX = 2000;

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
	if (typeof value !== "number" || !Number.isFinite(value)) {
		return fallback;
	}
	const rounded = Math.round(value);
	return Math.min(max, Math.max(min, rounded));
}

function normalizeStartSensitivity(
	raw: unknown,
): StartOfSpeechSensitivity {
	return raw === "START_SENSITIVITY_LOW"
		? "START_SENSITIVITY_LOW"
		: DEFAULT_VOICE_INPUT.startOfSpeechSensitivity;
}

function normalizeEndSensitivity(raw: unknown): EndOfSpeechSensitivity {
	return raw === "END_SENSITIVITY_HIGH"
		? "END_SENSITIVITY_HIGH"
		: DEFAULT_VOICE_INPUT.endOfSpeechSensitivity;
}

/** Split comma- or newline-separated vocabulary / term lists. */
export function parseVoiceTermList(raw: string): string[] {
	return raw
		.split(/[,\n]+/)
		.map((term) => term.trim())
		.filter(Boolean);
}

/** Normalize a raw (possibly partial) voiceInput value to a full settings object. */
export function normalizeVoiceInputSettings(
	raw: Partial<VoiceInputSettings> | undefined,
): VoiceInputSettings {
	const r = raw ?? {};
	return {
		enabled: typeof r.enabled === "boolean" ? r.enabled : DEFAULT_VOICE_INPUT.enabled,
		geminiApiKeySecretId:
			typeof r.geminiApiKeySecretId === "string"
				? r.geminiApiKeySecretId
				: DEFAULT_VOICE_INPUT.geminiApiKeySecretId,
		model:
			typeof r.model === "string" && r.model.trim() !== ""
				? r.model.trim()
				: DEFAULT_VOICE_INPUT.model,
		transcriptionMode:
			r.transcriptionMode === "smart" || r.transcriptionMode === "verbatim"
				? r.transcriptionMode
				: DEFAULT_VOICE_INPUT.transcriptionMode,
		languageCodes:
			typeof r.languageCodes === "string"
				? r.languageCodes
				: DEFAULT_VOICE_INPUT.languageCodes,
		customVocabulary:
			typeof r.customVocabulary === "string"
				? r.customVocabulary
				: DEFAULT_VOICE_INPUT.customVocabulary,
		audioDeviceId:
			typeof r.audioDeviceId === "string"
				? r.audioDeviceId
				: DEFAULT_VOICE_INPUT.audioDeviceId,
		silenceDurationMs: clampInt(
			r.silenceDurationMs,
			SILENCE_MS_MIN,
			SILENCE_MS_MAX,
			DEFAULT_VOICE_INPUT.silenceDurationMs,
		),
		flushDelayMs: clampInt(
			r.flushDelayMs,
			FLUSH_MS_MIN,
			FLUSH_MS_MAX,
			DEFAULT_VOICE_INPUT.flushDelayMs,
		),
		prefixPaddingMs: clampInt(
			r.prefixPaddingMs,
			PREFIX_MS_MIN,
			PREFIX_MS_MAX,
			DEFAULT_VOICE_INPUT.prefixPaddingMs,
		),
		startOfSpeechSensitivity: normalizeStartSensitivity(
			r.startOfSpeechSensitivity,
		),
		endOfSpeechSensitivity: normalizeEndSensitivity(r.endOfSpeechSensitivity),
	};
}
