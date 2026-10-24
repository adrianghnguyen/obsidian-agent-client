import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import {
	basenameMatchesMentionTitle,
	createSimpleSearchFilter,
	matchSpansEntireText,
} from "../src/utils/simple-search";
import { extractMentionedNotes } from "../src/utils/mention-parser";

describe("matchSpansEntireText", () => {
	it("accepts a single range covering the full string", () => {
		expect(matchSpansEntireText([[0, 4]], 4)).toBe(true);
	});

	it("rejects partial coverage", () => {
		expect(matchSpansEntireText([[1, 4]], 4)).toBe(false);
	});
});

describe("createSimpleSearchFilter", () => {
	it("matches accent-insensitively (stub folds like Obsidian 1.15)", () => {
		const match = createSimpleSearchFilter("cafe");
		expect(match("Café")).toBe(true);
		expect(match("Thé")).toBe(false);
	});

	it("returns all candidates for an empty query", () => {
		const match = createSimpleSearchFilter("   ");
		expect(match("anything")).toBe(true);
	});
});

describe("basenameMatchesMentionTitle", () => {
	it("matches exact basenames", () => {
		expect(basenameMatchesMentionTitle("Notes", "Notes")).toBe(true);
	});

	it("matches folded basenames but not partial titles", () => {
		expect(basenameMatchesMentionTitle("Café", "cafe")).toBe(true);
		expect(basenameMatchesMentionTitle("Café Shop", "cafe")).toBe(false);
	});
});

describe("extractMentionedNotes", () => {
	const files = [
		new TFile("Café.md", "Café"),
		new TFile("Plain.md", "Plain"),
	];

	it("resolves unaccented @[[title]] to accented basename", () => {
		const result = extractMentionedNotes("Hello @[[cafe]]", {
			getAllFiles: () => files,
		});
		expect(result).toHaveLength(1);
		expect(result[0].file?.basename).toBe("Café");
	});

	it("prefers exact basename when both exist", () => {
		const dupFiles = [
			new TFile("cafe.md", "cafe"),
			new TFile("Café.md", "Café"),
		];
		const result = extractMentionedNotes("@[[cafe]]", {
			getAllFiles: () => dupFiles,
		});
		expect(result[0].file?.basename).toBe("cafe");
	});
});
