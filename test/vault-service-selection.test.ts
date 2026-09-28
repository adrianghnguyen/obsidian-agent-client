import { describe, expect, it } from "vitest";
import { resolveActiveNotePath } from "../src/services/vault-service";

describe("resolveActiveNotePath", () => {
	it("prefers the active editor file when one is open", () => {
		expect(
			resolveActiveNotePath("Notes/Active.md", "Notes/Selected.md"),
		).toBe("Notes/Active.md");
	});

	it("falls back to the stored selection file when focus leaves the note", () => {
		expect(resolveActiveNotePath(null, "Notes/Selected.md")).toBe(
			"Notes/Selected.md",
		);
		expect(resolveActiveNotePath(undefined, "Notes/Selected.md")).toBe(
			"Notes/Selected.md",
		);
		expect(resolveActiveNotePath("", "Notes/Selected.md")).toBe(
			"Notes/Selected.md",
		);
	});

	it("returns null when there is no active file and no stored selection", () => {
		expect(resolveActiveNotePath(null, null)).toBeNull();
		expect(resolveActiveNotePath(undefined, undefined)).toBeNull();
	});
});
