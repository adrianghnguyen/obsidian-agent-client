import { describe, it, expect } from "vitest";
import {
	filterSettingsSearchEntries,
	type SettingsSearchEntry,
} from "../src/services/settings-search";

function entry(
	name: string,
	sectionTitle: string,
	description = "",
	path: readonly string[] = ["settings:appearance"],
): SettingsSearchEntry {
	return {
		id: `${path.join(">")}#${name}`,
		name,
		description,
		sectionTitle,
		path,
	};
}

const ENTRIES: SettingsSearchEntry[] = [
	entry("Verbosity level", "Appearance", "Controls tool detail."),
	entry("Chat font size", "Appearance", "Adjust chat font size."),
	entry("Failed tool call analysis", "Appearance", "Lenient or strict."),
	entry("Show emojis", "Appearance", "Icons in tool calls."),
	entry("Node.js path", "Behavior", "Leave blank to auto-resolve."),
];

describe("filterSettingsSearchEntries", () => {
	it("returns nothing for an empty query", () => {
		expect(filterSettingsSearchEntries("", ENTRIES)).toEqual([]);
		expect(filterSettingsSearchEntries("   ", ENTRIES)).toEqual([]);
	});

	it("finds a setting by exact name substring", () => {
		const names = filterSettingsSearchEntries("font size", ENTRIES).map(
			(e) => e.name,
		);
		expect(names).toContain("Chat font size");
	});

	it("ranks name matches above description matches", () => {
		const names = filterSettingsSearchEntries("emojis", ENTRIES).map(
			(e) => e.name,
		);
		expect(names[0]).toBe("Show emojis");
	});

	it("matches on description text", () => {
		const names = filterSettingsSearchEntries("strict", ENTRIES).map(
			(e) => e.name,
		);
		expect(names).toContain("Failed tool call analysis");
	});

	it("matches on section title", () => {
		const names = filterSettingsSearchEntries("behavior", ENTRIES).map(
			(e) => e.name,
		);
		expect(names).toContain("Node.js path");
	});

	it("falls back to fuzzy subsequence on the name", () => {
		const names = filterSettingsSearchEntries("ftca", ENTRIES).map(
			(e) => e.name,
		);
		expect(names).toContain("Failed tool call analysis");
	});

	it("is case-insensitive", () => {
		expect(
			filterSettingsSearchEntries("VERBOSITY", ENTRIES).map((e) => e.name),
		).toContain("Verbosity level");
	});

	it("respects the result limit", () => {
		expect(filterSettingsSearchEntries("e", ENTRIES, 2)).toHaveLength(2);
	});

	it("returns an empty list when nothing matches", () => {
		expect(filterSettingsSearchEntries("zzzzqqq", ENTRIES)).toEqual([]);
	});
});
