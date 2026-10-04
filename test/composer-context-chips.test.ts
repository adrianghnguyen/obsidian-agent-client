// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { ComposerContextRow } from "../src/ui/ComposerContextRow";

afterEach(cleanup);

function renderRow(message: string, attached: Parameters<
	typeof ComposerContextRow
>[0]["attachedFiles"] = []) {
	return render(
		React.createElement(ComposerContextRow, {
			variant: "sidebar",
			activeNote: null,
			showActiveNoteChip: false,
			isAttached: false,
			floatingNoteContextMode: "first",
			onRemoveActiveNote: vi.fn(),
			onAttachActiveNote: vi.fn(),
			attachedFiles: attached,
			onRemoveFile: vi.fn(),
			message,
			onRemoveMention: vi.fn(),
		}),
	);
}

describe("ComposerContextRow @[[note]] chips", () => {
	it("renders one context chip per mention in the message", () => {
		renderRow("compare @[[Welcome]] and @[[Alpha]] please");
		const chips = document.querySelectorAll(".agent-client-context-chip");
		expect(chips.length).toBe(2);
		expect(chips[0].textContent).toContain("@Welcome");
		expect(chips[1].textContent).toContain("@Alpha");
	});

	it("exposes the full name via the title tooltip", () => {
		renderRow("@[[A Very Long Referenced Note Name That Truncates]]");
		const chip = document.querySelector(".agent-client-context-chip");
		expect(chip?.getAttribute("title")).toBe(
			"A Very Long Referenced Note Name That Truncates",
		);
	});

	it("fires onRemoveMention when the chip × is clicked", () => {
		const onRemoveMention = vi.fn();
		render(
			React.createElement(ComposerContextRow, {
				variant: "sidebar",
				activeNote: null,
				showActiveNoteChip: false,
				isAttached: false,
				floatingNoteContextMode: "first",
				onRemoveActiveNote: vi.fn(),
				onAttachActiveNote: vi.fn(),
				attachedFiles: [],
				onRemoveFile: vi.fn(),
				message: "@[[Welcome]]",
				onRemoveMention,
			}),
		);
		screen.getByRole("button").click();
		expect(onRemoveMention).toHaveBeenCalledWith("Welcome");
	});

	it("still renders attached-file chips", () => {
		renderRow("@[[Welcome]]", [
			{
				id: "f1",
				kind: "file",
				mimeType: "text/markdown",
				name: "report.md",
				path: "/vault/report.md",
			},
		]);
		const chips = document.querySelectorAll(".agent-client-context-chip");
		expect(chips.length).toBe(2);
		expect(chips[1].getAttribute("title")).toBe("report.md");
	});
});
