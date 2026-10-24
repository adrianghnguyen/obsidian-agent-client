import { prepareSimpleSearch, type SearchMatchPart } from "obsidian";

/**
 * Returns true when {@link matches} cover the entire string `[0, length)`.
 */
export function matchSpansEntireText(
	matches: SearchMatchPart[],
	length: number,
): boolean {
	if (length === 0 || matches.length === 0) {
		return length === 0;
	}
	const sorted = [...matches].sort((a, b) => a[0] - b[0]);
	if (sorted[0][0] !== 0) {
		return false;
	}
	let covered = 0;
	for (const [start, end] of sorted) {
		if (start > covered) {
			return false;
		}
		covered = Math.max(covered, end);
	}
	return covered >= length;
}

/**
 * Substring filter aligned with Obsidian's simple search (accent folding on 1.15+).
 */
export function createSimpleSearchFilter(
	query: string,
): (candidate: string) => boolean {
	const trimmed = query.trim();
	if (!trimmed) {
		return () => true;
	}
	const search = prepareSimpleSearch(trimmed);
	return (candidate: string) => search(candidate) !== null;
}

/**
 * Accent-aware basename equality for `@[[title]]` resolution (Obsidian 1.15+ folding via
 * {@link prepareSimpleSearch}; on 1.14 behaves like case-insensitive substring equality on
 * the full basename).
 */
export function basenameMatchesMentionTitle(
	basename: string,
	mentionTitle: string,
): boolean {
	if (basename === mentionTitle) {
		return true;
	}
	const searchTitle = prepareSimpleSearch(mentionTitle);
	const titleOnBasename = searchTitle(basename);
	if (
		!titleOnBasename ||
		!matchSpansEntireText(titleOnBasename.matches, basename.length)
	) {
		return false;
	}
	const searchBasename = prepareSimpleSearch(basename);
	const basenameOnTitle = searchBasename(mentionTitle);
	return (
		basenameOnTitle !== null &&
		matchSpansEntireText(basenameOnTitle.matches, mentionTitle.length)
	);
}
