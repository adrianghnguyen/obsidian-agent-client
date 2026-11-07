// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SearchableModelDropdown } from "../src/ui/SearchableModelDropdown";
import type { ModelSelectItem } from "../src/utils/model-select-search";

afterEach(cleanup);

const items: ModelSelectItem[] = Array.from({ length: 12 }, (_, i) => ({
	value: `model-${i}`,
	label: i === 3 ? "Claude Sonnet" : i === 4 ? "Claude Opus" : `Model ${i}`,
	groupName: i < 6 ? "Anthropic" : "Other",
}));

function renderDropdown(onChange = vi.fn(), currentValue = "model-0") {
	return {
		onChange,
		...render(
			React.createElement(SearchableModelDropdown, {
				label: "Model 0",
				title: "Model",
				items,
				currentValue,
				onChange,
			}),
		),
	};
}

describe("SearchableModelDropdown", () => {
	it("autofocuses the search field at the top of the open list", () => {
		renderDropdown();
		fireEvent.click(screen.getByTitle("Model"));
		const input = screen.getByLabelText("Search models");
		expect(input).toBe(document.activeElement);
		expect(screen.getByRole("listbox").firstElementChild).toBe(input);
	});

	it("removes non-matching rows and highlights substrings without innerHTML", () => {
		renderDropdown();
		fireEvent.click(screen.getByTitle("Model"));
		fireEvent.change(screen.getByLabelText("Search models"), {
			target: { value: "claude" },
		});
		const options = screen.getAllByRole("option");
		expect(options).toHaveLength(2);
		expect(options.some((el) => el.textContent?.includes("Model 1"))).toBe(
			false,
		);
		const marks = document.querySelectorAll(
			".agent-client-model-search-match",
		);
		expect(marks.length).toBeGreaterThan(0);
		for (const mark of Array.from(marks)) {
			expect(mark.innerHTML).toBe("Claude");
			expect(mark.childNodes.length).toBe(1);
			expect(mark.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
		}
	});

	it("ANDs a second token and shows an empty state for garbage", () => {
		renderDropdown();
		fireEvent.click(screen.getByTitle("Model"));
		const input = screen.getByLabelText("Search models");
		fireEvent.change(input, { target: { value: "claude opus" } });
		expect(screen.getAllByRole("option")).toHaveLength(1);
		fireEvent.change(input, { target: { value: "zzzz-nope" } });
		expect(screen.getByText("No models match “zzzz-nope”")).toBeTruthy();
		expect(screen.queryAllByRole("option")).toHaveLength(0);
	});

	it("selects a single remaining match with Enter and restores an empty query next open", () => {
		const { onChange } = renderDropdown();
		fireEvent.click(screen.getByTitle("Model"));
		const input = screen.getByLabelText("Search models");
		fireEvent.change(input, { target: { value: "opus" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(onChange).toHaveBeenCalledWith("model-4");
		expect(screen.queryByLabelText("Search models")).toBeNull();
		expect(
			document.querySelector(".agent-client-toolbar-dropdown-label")
				?.textContent,
		).toBe("Claude Opus");
		fireEvent.click(screen.getByTitle("Model"));
		expect(screen.getByLabelText("Search models")).toHaveProperty(
			"value",
			"",
		);
	});

	it("does nothing on Enter when several rows remain unhighlighted", () => {
		const { onChange } = renderDropdown();
		fireEvent.click(screen.getByTitle("Model"));
		fireEvent.keyDown(screen.getByLabelText("Search models"), {
			key: "Enter",
		});
		expect(onChange).not.toHaveBeenCalled();
	});

	it("closes on Escape without selecting", () => {
		const { onChange } = renderDropdown();
		fireEvent.click(screen.getByTitle("Model"));
		fireEvent.keyDown(screen.getByLabelText("Search models"), {
			key: "Escape",
		});
		expect(onChange).not.toHaveBeenCalled();
		expect(screen.queryByLabelText("Search models")).toBeNull();
	});
});
