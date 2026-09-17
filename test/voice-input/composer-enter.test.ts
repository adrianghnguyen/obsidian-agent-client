import { describe, it, expect } from "vitest";
import { composerEnterShouldSend } from "../../src/voice-input/composer-enter";

function enter(
	overrides: Partial<{
		shiftKey: boolean;
		metaKey: boolean;
		ctrlKey: boolean;
		isComposing: boolean;
		key: string;
	}> = {},
) {
	return {
		key: "Enter" as const,
		shiftKey: false,
		metaKey: false,
		ctrlKey: false,
		isComposing: false,
		...overrides,
	};
}

describe("composerEnterShouldSend", () => {
	it("sends on Enter while listening would be active (enter shortcut)", () => {
		expect(composerEnterShouldSend(enter(), "enter")).toBe(true);
	});

	it("does not send on Shift+Enter (newline)", () => {
		expect(
			composerEnterShouldSend(enter({ shiftKey: true }), "enter"),
		).toBe(false);
	});

	it("sends on unmodified Enter even when not listening (same composer path)", () => {
		expect(composerEnterShouldSend(enter(), "enter")).toBe(true);
	});

	it("in cmd-enter mode sends only with Cmd or Ctrl", () => {
		expect(composerEnterShouldSend(enter(), "cmd-enter")).toBe(false);
		expect(
			composerEnterShouldSend(enter({ metaKey: true }), "cmd-enter"),
		).toBe(true);
		expect(
			composerEnterShouldSend(enter({ ctrlKey: true }), "cmd-enter"),
		).toBe(true);
		expect(
			composerEnterShouldSend(
				enter({ shiftKey: true, metaKey: true }),
				"cmd-enter",
			),
		).toBe(true);
	});

	it("ignores IME composition Enter unless Cmd/Ctrl is held", () => {
		expect(
			composerEnterShouldSend(enter({ isComposing: true }), "enter"),
		).toBe(false);
		expect(
			composerEnterShouldSend(
				enter({ isComposing: true, ctrlKey: true }),
				"enter",
			),
		).toBe(true);
	});

	it("does not treat Escape or other keys as send (stop-without-send stays on the Stop control)", () => {
		expect(
			composerEnterShouldSend(enter({ key: "Escape" }), "enter"),
		).toBe(false);
		expect(composerEnterShouldSend(enter({ key: " " }), "enter")).toBe(
			false,
		);
	});
});
