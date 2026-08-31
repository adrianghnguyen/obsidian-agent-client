export type VoiceTranscriptionMode = "smart" | "verbatim";

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
	/** Optional comma-separated custom vocabulary terms. */
	customVocabulary: string;
	/** Audio input device id; "default" uses the system mic. */
	audioDeviceId: string;
}

export const DEFAULT_VOICE_INPUT: VoiceInputSettings = {
	enabled: false,
	geminiApiKeySecretId: "",
	model: "gemini-3.5-transcribe-live",
	transcriptionMode: "smart",
	languageCodes: "",
	customVocabulary: "",
	audioDeviceId: "default",
};

/** Obsidian secret id used by the Voice Input settings tab. */
export const VOICE_INPUT_SECRET_ID = "agent-client-gemini-live-api-key";

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
	};
}