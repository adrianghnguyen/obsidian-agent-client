import { describe, it, expect } from "vitest";
import {
	formatVoiceDuration,
	captureVoiceMessageForSend,
} from "../../src/voice-input/format-voice-duration";

describe("formatVoiceDuration", () => {
	it("formats zero", () => {
		expect(formatVoiceDuration(0)).toBe("0:00");
	});

	it("formats under a minute", () => {
		expect(formatVoiceDuration(10_000)).toBe("0:10");
	});

	it("formats over a minute", () => {
		expect(formatVoiceDuration(70_000)).toBe("1:10");
	});

	it("floors fractional milliseconds", () => {
		expect(formatVoiceDuration(1999)).toBe("0:01");
	});
});

describe("captureVoiceMessageForSend", () => {
	it("trims whitespace", () => {
		expect(captureVoiceMessageForSend("  hello world  ")).toBe("hello world");
	});

	it("returns empty for blank input", () => {
		expect(captureVoiceMessageForSend("   ")).toBe("");
	});
});
