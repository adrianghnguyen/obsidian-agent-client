import { describe, it, expect } from "vitest";
import {
	resolveFloatingChatEntry,
	needsFloatingChatEntryMigration,
} from "../src/services/settings-normalizer";

describe("resolveFloatingChatEntry", () => {
	it("uses a valid floatingChatEntry value", () => {
		expect(
			resolveFloatingChatEntry({ floatingChatEntry: "status-bar" }),
		).toBe("status-bar");
		expect(
			resolveFloatingChatEntry({ floatingChatEntry: "commands" }),
		).toBe("commands");
		expect(resolveFloatingChatEntry({ floatingChatEntry: "button" })).toBe(
			"button",
		);
		expect(resolveFloatingChatEntry({ floatingChatEntry: "off" })).toBe(
			"off",
		);
	});

	it("ignores invalid floatingChatEntry and falls back to legacy / default", () => {
		expect(resolveFloatingChatEntry({ floatingChatEntry: "nope" })).toBe(
			"off",
		);
		expect(
			resolveFloatingChatEntry({
				floatingChatEntry: "nope",
				enableFloatingChat: true,
			}),
		).toBe("button");
	});

	it("migrates enableFloatingChat true to button", () => {
		expect(resolveFloatingChatEntry({ enableFloatingChat: true })).toBe(
			"button",
		);
	});

	it("migrates showFloatingButton true to button", () => {
		expect(resolveFloatingChatEntry({ showFloatingButton: true })).toBe(
			"button",
		);
	});

	it("prefers floatingChatEntry over legacy booleans", () => {
		expect(
			resolveFloatingChatEntry({
				floatingChatEntry: "commands",
				enableFloatingChat: true,
				showFloatingButton: true,
			}),
		).toBe("commands");
	});

	it("defaults to off when no entry and no legacy enable", () => {
		expect(resolveFloatingChatEntry({})).toBe("off");
		expect(
			resolveFloatingChatEntry({
				enableFloatingChat: false,
				showFloatingButton: false,
			}),
		).toBe("off");
	});
});

describe("needsFloatingChatEntryMigration", () => {
	it("is true only when legacy keys exist and floatingChatEntry is missing", () => {
		expect(
			needsFloatingChatEntryMigration({ enableFloatingChat: true }),
		).toBe(true);
		expect(
			needsFloatingChatEntryMigration({ showFloatingButton: false }),
		).toBe(true);
		expect(
			needsFloatingChatEntryMigration({
				floatingChatEntry: "button",
				enableFloatingChat: true,
			}),
		).toBe(false);
		expect(needsFloatingChatEntryMigration({})).toBe(false);
	});
});
