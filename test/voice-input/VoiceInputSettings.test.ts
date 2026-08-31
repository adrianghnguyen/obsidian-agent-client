import { describe, it, expect } from "vitest";
import {
	DEFAULT_VOICE_INPUT,
	normalizeVoiceInputSettings,
	VOICE_INPUT_SECRET_ID,
	type VoiceInputSettings,
} from "../../src/voice-input/VoiceInputSettings";

describe("VoiceInputSettings", () => {
	it("defaults have the expected shape", () => {
		expect(DEFAULT_VOICE_INPUT).toEqual({
			enabled: false,
			geminiApiKeySecretId: "",
			model: "gemini-3.5-transcribe-live",
			transcriptionMode: "smart",
			languageCodes: "",
			customVocabulary: "",
			audioDeviceId: "default",
		});
	});

	it("defaults satisfy the VoiceInputSettings interface", () => {
		const s: VoiceInputSettings = DEFAULT_VOICE_INPUT;
		expect(typeof s.enabled).toBe("boolean");
		expect(typeof s.geminiApiKeySecretId).toBe("string");
		expect(typeof s.model).toBe("string");
		expect(s.transcriptionMode === "smart" || s.transcriptionMode === "verbatim").toBe(true);
		expect(typeof s.languageCodes).toBe("string");
		expect(typeof s.customVocabulary).toBe("string");
		expect(typeof s.audioDeviceId).toBe("string");
	});

	it("normalizeVoiceInputSettings returns defaults for undefined input", () => {
		expect(normalizeVoiceInputSettings(undefined)).toEqual(DEFAULT_VOICE_INPUT);
	});

	it("normalizeVoiceInputSettings returns defaults for empty object", () => {
		expect(normalizeVoiceInputSettings({})).toEqual(DEFAULT_VOICE_INPUT);
	});

	it("normalizeVoiceInputSettings preserves valid fields", () => {
		const result = normalizeVoiceInputSettings({
			enabled: true,
			model: "gemini-3.0-flash-live",
			transcriptionMode: "verbatim",
			audioDeviceId: "dev-123",
		} as Partial<VoiceInputSettings>);

		expect(result.enabled).toBe(true);
		expect(result.model).toBe("gemini-3.0-flash-live");
		expect(result.transcriptionMode).toBe("verbatim");
		expect(result.audioDeviceId).toBe("dev-123");
	});

	it("coerces invalid values back to defaults", () => {
		const result = normalizeVoiceInputSettings({
			enabled: "yes" as unknown as boolean,
			model: "   ",
			transcriptionMode: "nonsense" as unknown as VoiceInputSettings["transcriptionMode"],
		} as Partial<VoiceInputSettings>);

		expect(result.enabled).toBe(false);
		expect(result.model).toBe("gemini-3.5-transcribe-live");
		expect(result.transcriptionMode).toBe("smart");
	});

	it("trims the model value", () => {
		const result = normalizeVoiceInputSettings({ model: "  my-model  " });
		expect(result.model).toBe("my-model");
	});

	it("uses the expected secret id", () => {
		expect(VOICE_INPUT_SECRET_ID).toBe("agent-client-gemini-live-api-key");
	});
});