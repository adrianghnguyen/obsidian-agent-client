import { describe, it, expect } from "vitest";
import { VoiceTranscriptAccumulator } from "../../src/voice-input/transcript-accumulation";
import { captureVoiceMessageForSend } from "../../src/voice-input/format-voice-duration";
import { endVoiceTranscriptTurn } from "../../src/voice-input/voice-turn-end";
import {
	resolveVoiceComposerBuffer,
	shouldCommitVoiceTurnOnEnter,
} from "../../src/voice-input/voice-enter-commit";

function enter(
	overrides: Partial<{
		shiftKey: boolean;
		metaKey: boolean;
		ctrlKey: boolean;
		isComposing: boolean;
		key: string;
	}> = {},
) {
	return {
		key: "Enter" as const,
		shiftKey: false,
		...overrides,
	};
}

describe("shouldCommitVoiceTurnOnEnter", () => {
	it("sends on Enter while dictation is active", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter(), { isVoiceListening: true }),
		).toBe(true);
	});

	it("does not send when dictation is off", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter(), { isVoiceListening: false }),
		).toBe(false);
	});

	it("keeps Shift+Enter as newline during dictation", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter({ shiftKey: true }), {
				isVoiceListening: true,
			}),
		).toBe(false);
	});

	it("still sends on Cmd/Ctrl+Enter during dictation", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter({ metaKey: true }), {
				isVoiceListening: true,
			}),
		).toBe(true);
		expect(
			shouldCommitVoiceTurnOnEnter(enter({ ctrlKey: true }), {
				isVoiceListening: true,
			}),
		).toBe(true);
	});

	it("does not steal Enter from mention or slash suggestions", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter(), {
				isVoiceListening: true,
				suggestionOpen: true,
			}),
		).toBe(false);
	});

	it("ignores IME composition Enter unless Cmd/Ctrl is held", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter({ isComposing: true }), {
				isVoiceListening: true,
			}),
		).toBe(false);
		expect(
			shouldCommitVoiceTurnOnEnter(
				enter({ isComposing: true, ctrlKey: true }),
				{ isVoiceListening: true },
			),
		).toBe(true);
	});

	it("ignores keys other than Enter", () => {
		expect(
			shouldCommitVoiceTurnOnEnter(enter({ key: "Escape" }), {
				isVoiceListening: true,
			}),
		).toBe(false);
	});
});

describe("resolveVoiceComposerBuffer", () => {
	it("prefers a longer live preview over a stale textarea", () => {
		expect(
			resolveVoiceComposerBuffer("hello", "hello world", "hello"),
		).toBe("hello world");
	});

	it("prefers typed composer text over a shorter accumulator", () => {
		expect(
			resolveVoiceComposerBuffer(
				"typed plus dictation extra",
				"typed plus dictation",
				"typed plus dictation extra",
			),
		).toBe("typed plus dictation extra");
	});
});

describe("Enter during STT commits composer then clears the accumulator", () => {
	it("sends typed text plus live preview, then endVoiceTranscriptTurn drops the buffer", () => {
		const acc = new VoiceTranscriptAccumulator();
		const sinkGeneration = { current: 0 };
		acc.begin("typed note: ");
		acc.applyInterim("buy milk");

		const listening = true;
		expect(
			shouldCommitVoiceTurnOnEnter(enter(), {
				isVoiceListening: listening,
			}),
		).toBe(true);

		const messageToSend = captureVoiceMessageForSend(acc.getPreview());
		endVoiceTranscriptTurn(acc, sinkGeneration);

		expect(messageToSend).toBe("typed note: buy milk");
		expect(acc.getPreview()).toBe("");
		expect(acc.discardInterim()).toBe("");
	});

	it("does not send when Enter should not commit (Shift+Enter)", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		acc.applyFinal("keep listening");

		const shouldSend = shouldCommitVoiceTurnOnEnter(
			enter({ shiftKey: true }),
			{ isVoiceListening: true },
		);
		expect(shouldSend).toBe(false);
		expect(acc.getPreview()).toBe("keep listening");
	});
});
