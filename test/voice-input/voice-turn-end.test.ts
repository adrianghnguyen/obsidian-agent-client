import { describe, it, expect } from "vitest";
import { VoiceTranscriptAccumulator } from "../../src/voice-input/transcript-accumulation";
import { captureVoiceMessageForSend } from "../../src/voice-input/format-voice-duration";
import {
	endVoiceTranscriptTurn,
	isCurrentVoiceSink,
} from "../../src/voice-input/voice-turn-end";

describe("endVoiceTranscriptTurn", () => {
	it("clears the accumulator so discardInterim and late finals do not restore the sent utterance", () => {
		const acc = new VoiceTranscriptAccumulator();
		const sinkGeneration = { current: 0 };
		acc.begin("");
		const sinkId = ++sinkGeneration.current;

		acc.applyFinal("hello world");
		expect(acc.getPreview()).toBe("hello world");

		const messageToSend = captureVoiceMessageForSend(acc.getPreview());
		endVoiceTranscriptTurn(acc, sinkGeneration);

		expect(messageToSend).toBe("hello world");
		expect(isCurrentVoiceSink(sinkGeneration, sinkId)).toBe(false);
		expect(acc.discardInterim()).toBe("");
		expect(acc.getPreview()).toBe("");
	});

	it("ignores late Gemini callbacks after send while listening", () => {
		const acc = new VoiceTranscriptAccumulator();
		const sinkGeneration = { current: 0 };
		acc.begin("");
		const sinkId = ++sinkGeneration.current;

		acc.applyInterim("hello");
		acc.applyFinal("hello");

		endVoiceTranscriptTurn(acc, sinkGeneration);

		if (isCurrentVoiceSink(sinkGeneration, sinkId)) {
			acc.applyFinal("hello extra");
		}
		expect(acc.getPreview()).toBe("");
		expect(acc.discardInterim()).toBe("");

		const nextSinkId = ++sinkGeneration.current;
		acc.begin("");
		expect(isCurrentVoiceSink(sinkGeneration, nextSinkId)).toBe(true);
		expect(acc.applyFinal("next turn")).toBe("next turn");
	});
});
