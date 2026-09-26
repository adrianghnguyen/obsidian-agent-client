import { describe, expect, it } from "vitest";
import {
	shouldAttachActiveNote,
	showFloatingNoteContextToggle,
	isFloatingNoteContextToggleLocked,
} from "../src/services/floating-note-context";

const base = {
	globalAutoMention: true,
	floatingSessionToggle: true,
	messageCount: 0,
	isAutoMentionDisabled: false,
};

describe("shouldAttachActiveNote", () => {
	it("sidebar follows global auto-mention on every message", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "sidebar",
				messageCount: 5,
			}),
		).toBe(true);
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "sidebar",
				globalAutoMention: false,
				messageCount: 0,
			}),
		).toBe(false);
	});

	it("floating attaches only on first message when session toggle is on", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				globalAutoMention: false,
			}),
		).toBe(true);
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				messageCount: 1,
				globalAutoMention: true,
			}),
		).toBe(false);
	});

	it("floating respects session toggle off even when global is on", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				floatingSessionToggle: false,
			}),
		).toBe(false);
	});

	it("badge dismiss disables attach for current send", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				isAutoMentionDisabled: true,
			}),
		).toBe(false);
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "sidebar",
				isAutoMentionDisabled: true,
			}),
		).toBe(false);
	});

	it("embedded follows global like sidebar", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "embedded",
				messageCount: 3,
			}),
		).toBe(true);
	});
});

describe("showFloatingNoteContextToggle", () => {
	it("only shows for floating variant", () => {
		expect(showFloatingNoteContextToggle("floating")).toBe(true);
		expect(showFloatingNoteContextToggle("sidebar")).toBe(false);
		expect(showFloatingNoteContextToggle("embedded")).toBe(false);
	});
});

describe("isFloatingNoteContextToggleLocked", () => {
	it("locks after first message", () => {
		expect(isFloatingNoteContextToggleLocked(0)).toBe(false);
		expect(isFloatingNoteContextToggleLocked(1)).toBe(true);
	});
});
