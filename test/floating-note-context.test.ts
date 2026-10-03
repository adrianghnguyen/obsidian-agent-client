import { describe, expect, it } from "vitest";
import type { AttachedFile } from "../src/types/chat";
import {
	cycleFloatingNoteContextMode,
	parseFloatingNoteContextMode,
	shouldAttachActiveNote,
	resolveActiveNoteAttach,
	showFloatingNoteContextControl,
	shouldShowStandaloneNoteContextGlyph,
	floatingNoteContextIcon,
	composerShowsActiveNoteChip,
	selectionForcesAttach,
	floatingComposerContextChipLabels,
} from "../src/services/floating-note-context";

const base = {
	globalAutoMention: true,
	floatingNoteContextMode: "first" as const,
	messageCount: 0,
};

describe("shouldAttachActiveNote (mode/selection default layer)", () => {
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

describe("resolveActiveNoteAttach (chip override always wins)", () => {
	it("default falls through to the mode decision", () => {
		expect(
			resolveActiveNoteAttach({
				...base,
				override: "default",
				variant: "floating",
				floatingNoteContextMode: "off",
			}),
		).toBe(false);
		expect(
			resolveActiveNoteAttach({
				...base,
				override: "default",
				variant: "floating",
				floatingNoteContextMode: "always",
				messageCount: 9,
				globalAutoMention: false,
			}),
		).toBe(true);
	});

	it("remove wins over the mode and a live selection", () => {
		expect(
			resolveActiveNoteAttach({
				...base,
				override: "remove",
				variant: "floating",
				floatingNoteContextMode: "always",
				hasSelection: true,
			}),
		).toBe(false);
		expect(
			resolveActiveNoteAttach({
				...base,
				override: "remove",
				variant: "sidebar",
				globalAutoMention: true,
				hasSelection: true,
			}),
		).toBe(false);
	});

	it("attach forces the note on even in don't-attach modes", () => {
		expect(
			resolveActiveNoteAttach({
				...base,
				override: "attach",
				variant: "floating",
				floatingNoteContextMode: "off",
			}),
		).toBe(true);
		expect(
			resolveActiveNoteAttach({
				...base,
				override: "attach",
				variant: "sidebar",
				globalAutoMention: false,
			}),
		).toBe(true);
	});
});

describe("composerShowsActiveNoteChip", () => {
	it("shows the chip whenever a note is open, in every mode", () => {
		expect(composerShowsActiveNoteChip({ hasActiveNote: true })).toBe(true);
		expect(composerShowsActiveNoteChip({ hasActiveNote: false })).toBe(
			false,
		);
	});
});

describe("showFloatingNoteContextControl", () => {
	it("only shows for floating variant", () => {
		expect(showFloatingNoteContextControl("floating")).toBe(true);
		expect(showFloatingNoteContextControl("sidebar")).toBe(false);
	});
});

describe("shouldShowStandaloneNoteContextGlyph", () => {
	it("shows the standalone glyph only when no note is open", () => {
		expect(
			shouldShowStandaloneNoteContextGlyph({
				variant: "floating",
				hasActiveNote: false,
			}),
		).toBe(true);
		expect(
			shouldShowStandaloneNoteContextGlyph({
				variant: "floating",
				hasActiveNote: true,
			}),
		).toBe(false);
	});

	it("never shows the glyph outside floating chat", () => {
		expect(
			shouldShowStandaloneNoteContextGlyph({
				variant: "sidebar",
				hasActiveNote: false,
			}),
		).toBe(false);
	});
});

describe("selectionForcesAttach", () => {
	it("is true only when the note has a selection", () => {
		expect(
			selectionForcesAttach({
				selection: { from: { line: 1, ch: 0 }, to: { line: 2, ch: 0 } },
			}),
		).toBe(true);
		expect(selectionForcesAttach({})).toBe(false);
		expect(selectionForcesAttach(null)).toBe(false);
		expect(selectionForcesAttach(undefined)).toBe(false);
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

	it("keeps attached files when there is no active note", () => {
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

	it("includes the active note chip with its selection range", () => {
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
