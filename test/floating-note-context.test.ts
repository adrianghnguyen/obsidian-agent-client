import { describe, expect, it } from "vitest";
import {
	cycleFloatingNoteContextMode,
	parseFloatingNoteContextMode,
	shouldAttachActiveNote,
	showFloatingNoteContextControl,
	floatingNoteContextIcon,
	composerShowsFloatingNoteChip,
} from "../src/services/floating-note-context";

const base = {
	globalAutoMention: true,
	floatingNoteContextMode: "first" as const,
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
			}),
		).toBe(false);
	});

	it("floating first mode attaches only when the session is empty", () => {
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
				messageCount: 2,
			}),
		).toBe(false);
	});

	it("floating always mode attaches on later messages", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				floatingNoteContextMode: "always",
				messageCount: 4,
				globalAutoMention: false,
			}),
		).toBe(true);
	});

	it("floating off mode never attaches", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				floatingNoteContextMode: "off",
				messageCount: 0,
			}),
		).toBe(false);
	});

	it("badge dismiss disables attach for the current send", () => {
		expect(
			shouldAttachActiveNote({
				...base,
				variant: "floating",
				floatingNoteContextMode: "always",
				isAutoMentionDisabled: true,
			}),
		).toBe(false);
	});
});

describe("cycleFloatingNoteContextMode", () => {
	it("cycles first, always, off", () => {
		expect(cycleFloatingNoteContextMode("first")).toBe("always");
		expect(cycleFloatingNoteContextMode("always")).toBe("off");
		expect(cycleFloatingNoteContextMode("off")).toBe("first");
	});
});

describe("parseFloatingNoteContextMode", () => {
	it("reads the enum and maps the legacy boolean", () => {
		expect(parseFloatingNoteContextMode("always")).toBe("always");
		expect(parseFloatingNoteContextMode(undefined, false)).toBe("off");
		expect(parseFloatingNoteContextMode(undefined, true)).toBe("first");
		expect(parseFloatingNoteContextMode("nope")).toBe("first");
	});
});

describe("floatingNoteContextIcon", () => {
	it("uses file+1, file infinity, and x", () => {
		expect(floatingNoteContextIcon("off")).toBe("x");
		expect(floatingNoteContextIcon("first")).toBe("file-plus-one");
		expect(floatingNoteContextIcon("always")).toBe("file-infinity");
	});
});

describe("composerShowsFloatingNoteChip", () => {
	it("shows the active note while first or always will attach it", () => {
		expect(
			composerShowsFloatingNoteChip({
				hasActiveNote: true,
				floatingNoteContextMode: "first",
				messageCount: 0,
			}),
		).toBe(true);
		expect(
			composerShowsFloatingNoteChip({
				hasActiveNote: true,
				floatingNoteContextMode: "first",
				messageCount: 2,
			}),
		).toBe(false);
		expect(
			composerShowsFloatingNoteChip({
				hasActiveNote: true,
				floatingNoteContextMode: "always",
				messageCount: 4,
			}),
		).toBe(true);
		expect(
			composerShowsFloatingNoteChip({
				hasActiveNote: true,
				floatingNoteContextMode: "off",
				messageCount: 0,
			}),
		).toBe(false);
		expect(
			composerShowsFloatingNoteChip({
				hasActiveNote: false,
				floatingNoteContextMode: "always",
				messageCount: 0,
			}),
		).toBe(false);
	});
});

describe("showFloatingNoteContextControl", () => {
	it("only shows for floating variant", () => {
		expect(showFloatingNoteContextControl("floating")).toBe(true);
		expect(showFloatingNoteContextControl("sidebar")).toBe(false);
	});
});
