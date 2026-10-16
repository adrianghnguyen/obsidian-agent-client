// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TFile } from "obsidian";
import { MessageVaultRefsRow } from "../src/ui/MessageVaultRefsRow";
import type { MessageVaultRef } from "../src/utils/message-vault-refs";
import type AgentClientPlugin from "../src/plugin";

afterEach(cleanup);

function mentioned(
	label: string,
	extras: Partial<MessageVaultRef> = {},
): MessageVaultRef {
	return {
		key: `link:${label.toLowerCase()}`,
		label,
		linkText: label,
		kind: "mentioned",
		...extras,
	};
}

function makePlugin() {
	const openLinkText = vi.fn();
	const files: Record<string, TFile> = {
		"Notes/Alpha.md": new TFile("Notes/Alpha.md", "Alpha"),
		"Notes/Beta.md": new TFile("Notes/Beta.md", "Beta"),
		"Notes/Gamma.md": new TFile("Notes/Gamma.md", "Gamma"),
		"Notes/Delta.md": new TFile("Notes/Delta.md", "Delta"),
	};
	const plugin = {
		app: {
			vault: {
				adapter: {},
				getAbstractFileByPath: (path: string) => files[path] ?? null,
			},
			metadataCache: {
				getFirstLinkpathDest: (link: string) => {
					const hit = Object.values(files).find(
						(file) =>
							file.path === link ||
							file.basename === link ||
							file.path.endsWith(`/${link}`),
					);
					return hit ?? null;
				},
			},
			workspace: { openLinkText },
		},
	} as unknown as AgentClientPlugin;
	return { plugin, openLinkText };
}

describe("MessageVaultRefsRow", () => {
	it("renders resolved pills and opens the note on click", () => {
		const { plugin, openLinkText } = makePlugin();
		render(
			React.createElement(MessageVaultRefsRow, {
				plugin,
				refs: [
					mentioned("Alpha"),
					mentioned("Beta", {
						kind: "edited",
						path: "Notes/Beta.md",
					}),
				],
			}),
		);
		expect(screen.getByLabelText("Open Alpha")).toBeTruthy();
		expect(screen.getByLabelText("Open Beta")).toBeTruthy();
		fireEvent.click(screen.getByLabelText("Open Alpha"));
		expect(openLinkText).toHaveBeenCalledWith("Notes/Alpha.md", "");
	});

	it("mutes unresolved titles and does not open them", () => {
		const { plugin, openLinkText } = makePlugin();
		render(
			React.createElement(MessageVaultRefsRow, {
				plugin,
				refs: [mentioned("Missing Note")],
			}),
		);
		expect(screen.queryByLabelText("Open Missing Note")).toBeNull();
		expect(screen.getByText("Missing Note")).toBeTruthy();
		expect(
			document.querySelector(".agent-client-vault-ref-pill.is-missing"),
		).toBeTruthy();
		expect(openLinkText).not.toHaveBeenCalled();
	});

	it("caps visible pills at 3 and expands the rest from +N", () => {
		const { plugin } = makePlugin();
		render(
			React.createElement(MessageVaultRefsRow, {
				plugin,
				refs: [
					mentioned("Alpha"),
					mentioned("Beta"),
					mentioned("Gamma"),
					mentioned("Delta"),
				],
			}),
		);
		expect(screen.getByLabelText("Open Alpha")).toBeTruthy();
		expect(screen.getByLabelText("Open Beta")).toBeTruthy();
		expect(screen.getByLabelText("Open Gamma")).toBeTruthy();
		expect(screen.queryByLabelText("Open Delta")).toBeNull();
		fireEvent.click(screen.getByLabelText("Show 1 more linked notes"));
		expect(screen.getByLabelText("Open Delta")).toBeTruthy();
	});

	it("renders nothing when there are no refs", () => {
		const { plugin } = makePlugin();
		const { container } = render(
			React.createElement(MessageVaultRefsRow, {
				plugin,
				refs: [],
			}),
		);
		expect(
			container.querySelector(".agent-client-message-vault-refs"),
		).toBeNull();
	});
});
