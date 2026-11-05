/**
 * Substring search for the model picker (lists with more than 10 models).
 * Not fuzzy: keep rows whose display name, model id, or group name contain
 * every whitespace-separated token (case-insensitive AND).
 */

export const MODEL_SEARCH_THRESHOLD = 10;

export interface ModelSelectItem {
	value: string;
	label: string;
	description?: string;
	groupName?: string;
}

export type ModelMenuRow =
	| { kind: "header"; name: string }
	| { kind: "option"; item: ModelSelectItem };

export type ModelSearchKeyAction =
	| { type: "none" }
	| { type: "close" }
	| { type: "select"; value: string }
	| { type: "highlight"; value: string };

export function shouldSearchModelList(
	isModelSelect: boolean,
	flatCount: number,
): boolean {
	return isModelSelect && flatCount > MODEL_SEARCH_THRESHOLD;
}

export function tokenizeModelQuery(query: string): string[] {
	return query
		.trim()
		.toLowerCase()
		.split(/\s+/)
		.filter((token) => token.length > 0);
}

export function modelOptionMatches(
	item: ModelSelectItem,
	tokens: string[],
): boolean {
	if (tokens.length === 0) return true;
	const hay =
		`${item.label}\0${item.value}\0${item.groupName ?? ""}`.toLowerCase();
	return tokens.every((token) => hay.includes(token));
}

export function filterModelOptions(
	items: ModelSelectItem[],
	query: string,
): ModelSelectItem[] {
	const tokens = tokenizeModelQuery(query);
	return items.filter((item) => modelOptionMatches(item, tokens));
}

export function emptyModelMatchMessage(query: string): string {
	return `No models match “${query.trim()}”`;
}

export function mergeHighlightRanges(
	ranges: Array<[number, number]>,
): Array<[number, number]> {
	if (ranges.length === 0) return [];
	const sorted = [...ranges].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
	const merged: Array<[number, number]> = [sorted[0]];
	for (let i = 1; i < sorted.length; i++) {
		const last = merged[merged.length - 1];
		const next = sorted[i];
		if (next[0] <= last[1]) {
			last[1] = Math.max(last[1], next[1]);
		} else {
			merged.push([next[0], next[1]]);
		}
	}
	return merged;
}

/** Case-insensitive substring ranges of each token in `text` (visible label). */
export function findLabelHighlightRanges(
	text: string,
	query: string,
): Array<[number, number]> {
	const tokens = tokenizeModelQuery(query);
	if (tokens.length === 0 || text.length === 0) return [];
	const lower = text.toLowerCase();
	const ranges: Array<[number, number]> = [];
	for (const token of tokens) {
		let from = 0;
		while (from < lower.length) {
			const index = lower.indexOf(token, from);
			if (index < 0) break;
			ranges.push([index, index + token.length]);
			from = index + token.length;
		}
	}
	return mergeHighlightRanges(ranges);
}

export function buildVisibleModelRows(
	items: ModelSelectItem[],
): ModelMenuRow[] {
	const rows: ModelMenuRow[] = [];
	let lastGroup: string | undefined;
	for (const item of items) {
		if (item.groupName && item.groupName !== lastGroup) {
			rows.push({ kind: "header", name: item.groupName });
		}
		lastGroup = item.groupName;
		rows.push({ kind: "option", item });
	}
	return rows;
}

export function visibleModelValues(rows: ModelMenuRow[]): string[] {
	return rows
		.filter(
			(row): row is { kind: "option"; item: ModelSelectItem } =>
				row.kind === "option",
		)
		.map((row) => row.item.value);
}

export function moveHighlight(
	visibleValues: string[],
	highlighted: string | null,
	direction: 1 | -1,
	currentValue?: string,
): string | null {
	if (visibleValues.length === 0) return null;
	if (highlighted === null || !visibleValues.includes(highlighted)) {
		if (direction === 1) {
			if (currentValue && visibleValues.includes(currentValue)) {
				return currentValue;
			}
			return visibleValues[0];
		}
		return visibleValues[visibleValues.length - 1];
	}
	const index = visibleValues.indexOf(highlighted);
	const next =
		(index + direction + visibleValues.length) % visibleValues.length;
	return visibleValues[next];
}

export function resolveEnterSelection(
	visibleValues: string[],
	highlighted: string | null,
): string | null {
	if (highlighted && visibleValues.includes(highlighted)) {
		return highlighted;
	}
	if (visibleValues.length === 1) {
		return visibleValues[0];
	}
	return null;
}

export function handleModelSearchKey(params: {
	key: string;
	visibleValues: string[];
	highlighted: string | null;
	currentValue?: string;
}): ModelSearchKeyAction {
	const { key, visibleValues, highlighted, currentValue } = params;
	if (key === "Escape") return { type: "close" };
	if (key === "ArrowDown") {
		const value = moveHighlight(
			visibleValues,
			highlighted,
			1,
			currentValue,
		);
		return value ? { type: "highlight", value } : { type: "none" };
	}
	if (key === "ArrowUp") {
		const value = moveHighlight(
			visibleValues,
			highlighted,
			-1,
			currentValue,
		);
		return value ? { type: "highlight", value } : { type: "none" };
	}
	if (key === "Enter") {
		const value = resolveEnterSelection(visibleValues, highlighted);
		return value ? { type: "select", value } : { type: "none" };
	}
	return { type: "none" };
}
