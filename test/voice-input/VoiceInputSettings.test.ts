import { describe, it, expect } from "vitest";
import {
	DEFAULT_VOICE_INPUT,
	normalizeVoiceInputSettings,
	parseVoiceTermList,
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
			silenceDurationMs: 2000,
			flushDelayMs: 1000,
			prefixPaddingMs: 300,
			startOfSpeechSensitivity: "START_SENSITIVITY_HIGH",
			endOfSpeechSensitivity: "END_SENSITIVITY_LOW",
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
		expect(typeof s.silenceDurationMs).toBe("number");
		expect(typeof s.flushDelayMs).toBe("number");
		expect(typeof s.prefixPaddingMs).toBe("number");
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
			silenceDurationMs: 2500,
			flushDelayMs: 500,
			prefixPaddingMs: 400,
			startOfSpeechSensitivity: "START_SENSITIVITY_LOW",
			endOfSpeechSensitivity: "END_SENSITIVITY_HIGH",
		});

		expect(result.enabled).toBe(true);
		expect(result.model).toBe("gemini-3.0-flash-live");
		expect(result.transcriptionMode).toBe("verbatim");
		expect(result.audioDeviceId).toBe("dev-123");
		expect(result.silenceDurationMs).toBe(2500);
		expect(result.flushDelayMs).toBe(500);
		expect(result.prefixPaddingMs).toBe(400);
		expect(result.startOfSpeechSensitivity).toBe("START_SENSITIVITY_LOW");
		expect(result.endOfSpeechSensitivity).toBe("END_SENSITIVITY_HIGH");
	});

	it("coerces invalid values back to defaults", () => {
		const result = normalizeVoiceInputSettings({
			enabled: "yes" as unknown as boolean,
			model: "   ",
			transcriptionMode: "nonsense" as unknown as VoiceInputSettings["transcriptionMode"],
			silenceDurationMs: 50,
			flushDelayMs: -1,
			prefixPaddingMs: 99999,
			startOfSpeechSensitivity: "bad" as VoiceInputSettings["startOfSpeechSensitivity"],
			endOfSpeechSensitivity: "bad" as VoiceInputSettings["endOfSpeechSensitivity"],
		});

		expect(result.enabled).toBe(false);
		expect(result.model).toBe("gemini-3.5-transcribe-live");
		expect(result.transcriptionMode).toBe("smart");
		expect(result.silenceDurationMs).toBe(500);
		expect(result.flushDelayMs).toBe(0);
		expect(result.prefixPaddingMs).toBe(2000);
		expect(result.startOfSpeechSensitivity).toBe("START_SENSITIVITY_HIGH");
		expect(result.endOfSpeechSensitivity).toBe("END_SENSITIVITY_LOW");
	});

	it("trims the model value", () => {
		const result = normalizeVoiceInputSettings({ model: "  my-model  " });
		expect(result.model).toBe("my-model");
	});

	it("uses the expected secret id", () => {
		expect(VOICE_INPUT_SECRET_ID).toBe("agent-client-gemini-live-api-key");
	});
});

describe("parseVoiceTermList", () => {
	it("splits on commas and newlines", () => {
		expect(parseVoiceTermList("Obsidian, Note\nGemini")).toEqual([
			"Obsidian",
			"Note",
			"Gemini",
		]);
	});

	it("trims and drops empty segments", () => {
		expect(parseVoiceTermList("  a , , b  ")).toEqual(["a", "b"]);
	});
});
