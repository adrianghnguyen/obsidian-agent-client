import { describe, it, expect } from "vitest";
import {
	isFocusGatedChatCommandEnabled,
	isObsidianCommandPaletteFocused,
} from "../src/commands/chat-focus-gate";

function mockView(hasFocus: boolean): { hasFocus(): boolean } {
	return { hasFocus: () => hasFocus };
}

function mockEl(selectorMatch: string | null): Element {
	return {
		closest: (selector: string) =>
			selector === ".prompt" && selectorMatch === ".prompt"
				? ({} as Element)
				: null,
	} as Element;
}

describe("isObsidianCommandPaletteFocused", () => {
	it("returns false for null/undefined", () => {
		expect(isObsidianCommandPaletteFocused(null)).toBe(false);
		expect(isObsidianCommandPaletteFocused(undefined)).toBe(false);
	});

	it("returns true when active element is inside .prompt", () => {
		expect(isObsidianCommandPaletteFocused(mockEl(".prompt"))).toBe(true);
	});

	it("returns false when active element is elsewhere", () => {
		expect(isObsidianCommandPaletteFocused(mockEl(null))).toBe(false);
	});
});

describe("isFocusGatedChatCommandEnabled", () => {
	it("is disabled when no chat view is focused in the registry", () => {
		expect(isFocusGatedChatCommandEnabled(null, mockEl(null))).toBe(false);
		expect(
			isFocusGatedChatCommandEnabled(undefined, mockEl(".prompt")),
		).toBe(false);
	});

	it("is enabled when the focused chat has DOM focus", () => {
		expect(
			isFocusGatedChatCommandEnabled(mockView(true), mockEl(null)),
		).toBe(true);
	});

	it("is disabled when a chat is registry-focused but DOM focus is elsewhere", () => {
		expect(
			isFocusGatedChatCommandEnabled(mockView(false), mockEl(null)),
		).toBe(false);
	});

	it("is enabled from the command palette even if chat lost DOM focus", () => {
		expect(
			isFocusGatedChatCommandEnabled(mockView(false), mockEl(".prompt")),
		).toBe(true);
	});
});
