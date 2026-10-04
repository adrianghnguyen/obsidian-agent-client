import { describe, expect, it } from "vitest";
import {
	extractMentionTitles,
	removeMentionFromText,
} from "../src/utils/mention-parser";

describe("extractMentionTitles", () => {
	it("returns referenced note titles in first-seen order", () => {
		expect(
			extractMentionTitles("check @[[Alpha]] and @[[Beta]] please"),
		).toEqual(["Alpha", "Beta"]);
	});

	it("de-duplicates repeated mentions", () => {
		expect(
			extractMentionTitles("@[[Alpha]] then @[[Alpha]] again"),
		).toEqual(["Alpha"]);
	});

	it("ignores selection range suffixes", () => {
		expect(extractMentionTitles("@[[Alpha]]:3-8")).toEqual(["Alpha"]);
	});

	it("returns an empty array when there are no mentions", () => {
		expect(extractMentionTitles("just a plain message")).toEqual([]);
	});
});

describe("removeMentionFromText", () => {
	it("removes a mention and tidies surrounding whitespace", () => {
		expect(removeMentionFromText("check @[[Alpha]] now", "Alpha")).toBe(
			"check now",
		);
	});

	it("removes a mention with a selection range", () => {
		expect(
			removeMentionFromText(
				"@[[Alpha]]:3-8 and more",
				"Alpha",
			),
		).toBe("and more");
	});

	it("removes every occurrence of the same note", () => {
		expect(
			removeMentionFromText("@[[Alpha]] @[[Alpha]] done", "Alpha"),
		).toBe("done");
	});

	it("leaves other mentions intact", () => {
		expect(
			removeMentionFromText("@[[Alpha]] @[[Beta]]", "Alpha"),
		).toBe("@[[Beta]]");
	});

	it("treats regex metacharacters in the title literally", () => {
		expect(
			removeMentionFromText("@[[a.b]] kept", "a.b"),
		).toBe("kept");
	});
});
