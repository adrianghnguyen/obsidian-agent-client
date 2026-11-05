import { describe, expect, it } from "vitest";
import {
	buildVisibleModelRows,
	emptyModelMatchMessage,
	filterModelOptions,
	findLabelHighlightRanges,
	handleModelSearchKey,
	MODEL_SEARCH_THRESHOLD,
	moveHighlight,
	resolveEnterSelection,
	shouldSearchModelList,
	tokenizeModelQuery,
	type ModelSelectItem,
} from "../src/utils/model-select-search";

const items: ModelSelectItem[] = [
	{ value: "gpt-4.1", label: "GPT 4.1", groupName: "OpenAI" },
	{ value: "gpt-4o", label: "GPT 4o", groupName: "OpenAI" },
	{ value: "claude-sonnet-4", label: "Sonnet 4", groupName: "Anthropic" },
	{ value: "claude-opus-4", label: "Opus 4", groupName: "Anthropic" },
	{ value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", groupName: "Google" },
];

describe("shouldSearchModelList", () => {
	it("is off for non-model selects even with a long list", () => {
		expect(shouldSearchModelList(false, 50)).toBe(false);
	});

	it("is off for model lists at the threshold", () => {
		expect(shouldSearchModelList(true, MODEL_SEARCH_THRESHOLD)).toBe(false);
	});

	it("is on for model lists above 10", () => {
		expect(shouldSearchModelList(true, MODEL_SEARCH_THRESHOLD + 1)).toBe(
			true,
		);
	});
});

describe("tokenizeModelQuery", () => {
	it("splits on spaces and lowercases", () => {
		expect(tokenizeModelQuery("  GPT  4o ")).toEqual(["gpt", "4o"]);
	});

	it("treats whitespace-only as empty", () => {
		expect(tokenizeModelQuery("   ")).toEqual([]);
	});
});

describe("filterModelOptions", () => {
	it("keeps a case-insensitive substring of the display name", () => {
		expect(filterModelOptions(items, "sonnet").map((i) => i.value)).toEqual(
			["claude-sonnet-4"],
		);
	});

	it("keeps a substring of the model id", () => {
		expect(filterModelOptions(items, "4o").map((i) => i.value)).toEqual([
			"gpt-4o",
		]);
	});

	it("keeps options when the group name matches", () => {
		expect(
			filterModelOptions(items, "anthropic").map((i) => i.value),
		).toEqual(["claude-sonnet-4", "claude-opus-4"]);
	});

	it("requires every space-separated token (AND)", () => {
		expect(filterModelOptions(items, "gpt 4o").map((i) => i.value)).toEqual(
			["gpt-4o"],
		);
		expect(filterModelOptions(items, "gpt opus")).toEqual([]);
	});

	it("allows tokens to split across name and id", () => {
		expect(
			filterModelOptions(items, "gemini pro").map((i) => i.value),
		).toEqual(["gemini-2.5-pro"]);
	});

	it("returns the full list for an empty query", () => {
		expect(filterModelOptions(items, "  ")).toHaveLength(items.length);
	});

	it("does not rank or keep near-miss fuzzy hits", () => {
		expect(filterModelOptions(items, "sonnt")).toEqual([]);
	});
});

describe("findLabelHighlightRanges", () => {
	it("marks each matching token on the visible label", () => {
		expect(findLabelHighlightRanges("GPT 4o", "gpt 4o")).toEqual([
			[0, 3],
			[4, 6],
		]);
	});

	it("is case-insensitive and merges overlaps", () => {
		expect(findLabelHighlightRanges("Sonnet 4", "son net")).toEqual([
			[0, 6],
		]);
	});

	it("returns no ranges for an empty query", () => {
		expect(findLabelHighlightRanges("GPT 4o", "")).toEqual([]);
	});
});

describe("buildVisibleModelRows", () => {
	it("inserts group headers and skips them in option values", () => {
		const rows = buildVisibleModelRows(
			filterModelOptions(items, "anthropic"),
		);
		expect(rows).toEqual([
			{ kind: "header", name: "Anthropic" },
			{
				kind: "option",
				item: items[2],
			},
			{
				kind: "option",
				item: items[3],
			},
		]);
	});
});

describe("emptyModelMatchMessage", () => {
	it("uses curly quotes around the query", () => {
		expect(emptyModelMatchMessage("zzz")).toBe("No models match “zzz”");
	});
});

describe("moveHighlight", () => {
	const visible = ["a", "b", "c"];

	it("first Down highlights the current value when it is still visible", () => {
		expect(moveHighlight(visible, null, 1, "b")).toBe("b");
	});

	it("first Down highlights the first visible when current is gone", () => {
		expect(moveHighlight(visible, null, 1, "gone")).toBe("a");
	});

	it("wraps Down and Up among visible values only", () => {
		expect(moveHighlight(visible, "c", 1)).toBe("a");
		expect(moveHighlight(visible, "a", -1)).toBe("c");
	});
});

describe("resolveEnterSelection", () => {
	it("selects a single remaining match with no highlight", () => {
		expect(resolveEnterSelection(["only"], null)).toBe("only");
	});

	it("does nothing when 0 or 2+ are visible and nothing is highlighted", () => {
		expect(resolveEnterSelection([], null)).toBeNull();
		expect(resolveEnterSelection(["a", "b"], null)).toBeNull();
	});

	it("selects the highlighted row even when several are visible", () => {
		expect(resolveEnterSelection(["a", "b"], "b")).toBe("b");
	});
});

describe("handleModelSearchKey", () => {
	it("closes on Escape", () => {
		expect(
			handleModelSearchKey({
				key: "Escape",
				visibleValues: ["a"],
				highlighted: "a",
			}),
		).toEqual({ type: "close" });
	});

	it("does not treat other keys as commands", () => {
		expect(
			handleModelSearchKey({
				key: "g",
				visibleValues: ["a"],
				highlighted: null,
			}),
		).toEqual({ type: "none" });
	});
});
