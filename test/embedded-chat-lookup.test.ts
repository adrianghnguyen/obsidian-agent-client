import { describe, it, expect } from "vitest";
import { findNearestEmbeddedChat } from "../src/services/embedded-chat-lookup";

describe("findNearestEmbeddedChat", () => {
	const note = "Note.md";
	const other = "Other.md";

	it("returns null when there are no embeds", () => {
		expect(findNearestEmbeddedChat([], note, 10)).toBeNull();
	});

	it("ignores embeds in other notes", () => {
		expect(
			findNearestEmbeddedChat(
				[{ viewId: "e1", sourcePath: other, lineStart: 5 }],
				note,
				10,
			),
		).toBeNull();
	});

	it("prefers the closest chat at or above the target line", () => {
		const embeds = [
			{ viewId: "far-above", sourcePath: note, lineStart: 1 },
			{ viewId: "near-above", sourcePath: note, lineStart: 8 },
			{ viewId: "below", sourcePath: note, lineStart: 20 },
		];
		expect(findNearestEmbeddedChat(embeds, note, 10)).toBe("near-above");
	});

	it("falls back to the earliest chat below when none are above", () => {
		const embeds = [
			{ viewId: "b2", sourcePath: note, lineStart: 30 },
			{ viewId: "b1", sourcePath: note, lineStart: 15 },
		];
		expect(findNearestEmbeddedChat(embeds, note, 10)).toBe("b1");
	});

	it("treats an exact line match as above (distance 0)", () => {
		const embeds = [
			{ viewId: "exact", sourcePath: note, lineStart: 10 },
			{ viewId: "below", sourcePath: note, lineStart: 12 },
		];
		expect(findNearestEmbeddedChat(embeds, note, 10)).toBe("exact");
	});
});
