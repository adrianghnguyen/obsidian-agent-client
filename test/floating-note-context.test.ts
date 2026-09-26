import { describe, expect, it } from "vitest";
import type { AttachedFile } from "../src/types/chat";
import {
	cycleFloatingNoteContextMode,
	parseFloatingNoteContextMode,
	shouldAttachActiveNote,
	showFloatingNoteContextControl,
	floatingNoteContextIcon,
	composerShowsFloatingNoteChip,
	floatingComposerContextChipLabels,
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

function fileAttachment(name: string, id = name): AttachedFile {
	return {
		id,
		kind: "file",
		mimeType: "text/markdown",
		name,
		path: `/vault/${name}.md`,
	};
}

describe("floatingComposerContextChipLabels", () => {
	it("renders one @ chip per attached file", () => {
		expect(
			floatingComposerContextChipLabels({
				showActiveNoteChip: false,
				activeNote: null,
				attachedFiles: [
					fileAttachment("file-A"),
					fileAttachment("file-B"),
					fileAttachment("file-C"),
				],
			}),
		).toEqual(["@file-A", "@file-B", "@file-C"]);
	});

	it("leaves two chips after one attached file is removed", () => {
		const attachedFiles = [
			fileAttachment("file-A"),
			fileAttachment("file-B"),
			fileAttachment("file-C"),
		];
		attachedFiles.splice(1, 1);
		expect(
			floatingComposerContextChipLabels({
				showActiveNoteChip: false,
				activeNote: null,
				attachedFiles,
			}),
		).toEqual(["@file-A", "@file-C"]);
	});

	it("omits the active note in don't-attach mode but keeps attached files", () => {
		expect(
			floatingComposerContextChipLabels({
				showActiveNoteChip: false,
				activeNote: {
					path: "Notes/Active.md",
					name: "Active",
					extension: "md",
					created: 0,
					modified: 0,
				},
				attachedFiles: [
					fileAttachment("file-A"),
					fileAttachment("file-B"),
				],
			}),
		).toEqual(["@file-A", "@file-B"]);
	});

	it("includes the active note chip when first-message mode will attach it", () => {
		expect(
			floatingComposerContextChipLabels({
				showActiveNoteChip: true,
				activeNote: {
					path: "Notes/Active.md",
					name: "Active",
					extension: "md",
					created: 0,
					modified: 0,
					selection: {
						from: { line: 4, ch: 0 },
						to: { line: 9, ch: 0 },
					},
				},
				attachedFiles: [fileAttachment("file-A")],
			}),
		).toEqual(["@Active:5-10", "@file-A"]);
	});
});
