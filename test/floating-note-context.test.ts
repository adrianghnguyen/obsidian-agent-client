import { describe, expect, it } from "vitest";
import {
	cycleFloatingNoteContextMode,
	parseFloatingNoteContextMode,
	shouldAttachActiveNote,
	showFloatingNoteContextControl,
	floatingNoteContextIcon,
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
	it("uses x for off", () => {
		expect(floatingNoteContextIcon("off")).toBe("x");
		expect(floatingNoteContextIcon("first")).toBe("file-plus");
		expect(floatingNoteContextIcon("always")).toBe("file-check");
	});
});

describe("showFloatingNoteContextControl", () => {
	it("only shows for floating variant", () => {
		expect(showFloatingNoteContextControl("floating")).toBe(true);
		expect(showFloatingNoteContextControl("sidebar")).toBe(false);
	});
});
