import { describe, it, expect } from "vitest";
import { VoiceTranscriptAccumulator } from "../../src/voice-input/transcript-accumulation";

describe("VoiceTranscriptAccumulator", () => {
	it("starts empty and previews only the interim", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		expect(acc.getPreview()).toBe("");
		expect(acc.applyInterim("hello")).toBe("hello");
		expect(acc.getPreview()).toBe("hello");
	});

	it("ignores unchanged interim", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		acc.applyInterim("hello");
		expect(acc.applyInterim("hello")).toBeNull();
	});

	it("interim updates replace the previous interim, not append", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		expect(acc.applyInterim("hel")).toBe("hel");
		expect(acc.applyInterim("hello")).toBe("hello");
		expect(acc.applyInterim("hello w")).toBe("hello w");
	});

	it("final appends to pre-existing prompt text instead of replacing it", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("Explain ");
		expect(acc.applyInterim("this")).toBe("Explain this");
		expect(acc.applyFinal("this")).toBe("Explain this");
	});

	it("final appends with a boundary space when the prompt has no trailing space", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("Explain");
		expect(acc.applyInterim("this")).toBe("Explain this");
		expect(acc.applyFinal("this")).toBe("Explain this");
	});

	it("multiple segments append to each other with a space at the seam", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");

		expect(acc.applyInterim("first")).toBe("first");
		expect(acc.applyFinal("first")).toBe("first");

		expect(acc.applyInterim("second")).toBe("first second");
		expect(acc.applyFinal("second")).toBe("first second");
	});

	it("does not double-space when a segment already ends with punctuation and space", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		expect(acc.applyFinal("First chunk.")).toBe("First chunk.");
		expect(acc.applyFinal("Second chunk")).toBe("First chunk. Second chunk");
	});

	it("does not double-space when the pre-voice input ends with a space", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("Hello, ");
		expect(acc.applyFinal("world")).toBe("Hello, world");
	});

	it("does not double-space when a segment starts with a space", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		expect(acc.applyFinal("first")).toBe("first");
		expect(acc.applyFinal("  second")).toBe("first second");
	});

	it("interim after a final previews on top of the committed text", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		acc.applyFinal("one two");
		expect(acc.applyInterim("three")).toBe("one two three");
	});

	it("does not commit whitespace-only finals", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("base");
		expect(acc.applyFinal("   ")).toBeNull();
		expect(acc.getPreview()).toBe("base");
	});

	it("discards interim but keeps committed finals", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("base ");
		acc.applyFinal("done");
		acc.applyInterim("partia");
		expect(acc.discardInterim()).toBe("base done");
		expect(acc.getPreview()).toBe("base done");
	});

	it("discardInterim with no committed finals keeps the pre-voice input", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("keep me");
		acc.applyInterim("dictated");
		expect(acc.discardInterim()).toBe("keep me");
	});

	it("begin resets the accumulation for a new session", () => {
		const acc = new VoiceTranscriptAccumulator();
		acc.begin("");
		acc.applyFinal("old");
		acc.begin("fresh");
		expect(acc.getPreview()).toBe("fresh");
		expect(acc.applyFinal("new")).toBe("fresh new");
	});
});
