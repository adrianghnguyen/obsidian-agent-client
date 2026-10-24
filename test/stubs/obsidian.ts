/**
 * Lightweight `obsidian` stub for unit tests.
 *
 * The real `obsidian` module only exists inside the Obsidian runtime, so
 * `vitest.config.mts` aliases the bare `obsidian` import to this file.
 *
 * Exports provided:
 * - `Platform`: flags read at call time by `src/utils/platform.ts` /
 *   `src/utils/paths.ts`. Tests mutate these to exercise platform branches.
 * - `parseYaml`: YAML parser used by `src/utils/agent-block-parser.ts`,
 *   delegated to the `yaml` package.
 * - `requestUrl`: network stand-in that always rejects (see below).
 */

import { parse as parseYamlImpl } from "yaml";

export const Platform = {
	isWin: false,
	isMacOS: false,
	isLinux: false,
	isDesktopApp: true,
};

/**
 * Minimal `TFile` stand-in for tests that resolve wikilinks. Only the fields
 * the resolver reads (`path`, `basename`) plus real-class identity so that
 * `resolved instanceof TFile` works with fixtures.
 */
export class TFile {
	path: string;
	basename: string;
	constructor(path: string, basename: string) {
		this.path = path;
		this.basename = basename;
	}
}

/**
 * Parse a YAML document. Mirrors Obsidian's `parseYaml`, which is a thin
 * wrapper over the `yaml` package.
 */
export function parseYaml(content: string): unknown {
	return parseYamlImpl(content);
}

/**
 * Split a linktext into path + subpath. Mirrors Obsidian's `parseLinktext`:
 * the subpath keeps its leading '#' and is '' when absent.
 */
export function parseLinktext(linktext: string): {
	path: string;
	subpath: string;
} {
	const hash = linktext.indexOf("#");
	if (hash === -1) return { path: linktext, subpath: "" };
	return { path: linktext.slice(0, hash), subpath: linktext.slice(hash) };
}

/**
 * Network stand-in. Always rejects: unit tests must not reach the npm
 * registry, and update-checker treats a network failure as "no result",
 * which keeps version-check paths deterministic in tests.
 */
export function requestUrl(): Promise<never> {
	return Promise.reject(new Error("requestUrl is not available in tests"));
}

/**
 * Stub for Obsidian's Notice.
 */
export class Notice {
	constructor(message: string) {
		// no-op in tests
	}
}

/**
 * Stub for Obsidian's setIcon.
 */
export function setIcon(el: HTMLElement, icon: string): void {
	// no-op in tests
}

/** Strip combining marks — approximates Obsidian 1.15 Latin folding in unit tests. */
function foldForSearch(text: string): string {
	return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export interface SearchResult {
	score: number;
	matches: [number, number][];
}

function simpleSearchMatch(
	query: string,
	text: string,
): SearchResult | null {
	const words = query.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) {
		return { score: 1, matches: [[0, text.length]] };
	}
	const foldedText = foldForSearch(text);
	let from = 0;
	const matches: [number, number][] = [];
	for (const word of words) {
		const foldedWord = foldForSearch(word);
		const idx = foldedText.indexOf(foldedWord, from);
		if (idx === -1) {
			return null;
		}
		matches.push([idx, idx + foldedWord.length]);
		from = idx + foldedWord.length;
	}
	return { score: 1, matches };
}

export function prepareSimpleSearch(
	query: string,
): (text: string) => SearchResult | null {
	return (text: string) => simpleSearchMatch(query, text);
}

export function prepareFuzzySearch(
	query: string,
): (text: string) => SearchResult | null {
	return prepareSimpleSearch(query);
}
