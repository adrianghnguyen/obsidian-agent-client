/**
 * In-page settings search for the Agent Client settings tab.
 *
 * Pure functions — no React, no Obsidian. The tab builds the index from the
 * rendered DOM (so every `Setting` row is searchable with no per-row
 * registration); these helpers only score and filter.
 */

export interface SettingsSearchEntry {
	/** Stable key: section chain + row name. */
	id: string;
	/** Setting row name (the bold label). */
	name: string;
	/** Setting description, if any. */
	description: string;
	/** Innermost section title shown to the user. */
	sectionTitle: string;
	/**
	 * Callout ids from outermost to innermost, so a jump can expand every
	 * ancestor the row is nested under.
	 */
	path: readonly string[];
}

/** Character positions of `query` as a subsequence of `text`, or null. */
function subsequencePositions(text: string, query: string): number[] | null {
	const positions: number[] = [];
	let qi = 0;
	for (let i = 0; i < text.length && qi < query.length; i++) {
		if (text[i] === query[qi]) {
			positions.push(i);
			qi++;
		}
	}
	return qi === query.length ? positions : null;
}

interface ScoredEntry {
	entry: SettingsSearchEntry;
	score: number;
}

/**
 * Score one entry against a normalized query. Higher is better; 0 means no
 * match. Substring matches rank above subsequence (fuzzy) matches.
 */
function scoreEntry(
	entry: SettingsSearchEntry,
	query: string,
): number {
	const name = entry.name.toLowerCase();
	const description = entry.description.toLowerCase();
	const section = entry.sectionTitle.toLowerCase();

	if (name.startsWith(query)) return 1000;
	if (name.includes(query)) return 800;
	if (description.includes(query)) return 500;
	if (section.includes(query)) return 300;

	// Fuzzy fallback across name then section, so "ftca" still finds
	// "Failed tool call analysis".
	const nameSub = subsequencePositions(name, query);
	if (nameSub) {
		// Prefer tighter matches (smaller span) and earlier first hits.
		const span = nameSub[nameSub.length - 1] - nameSub[0];
		return 200 - span;
	}
	if (subsequencePositions(section, query)) return 100;
	return 0;
}

/**
 * Filter and rank entries for a query. An empty query returns nothing (the
 * caller hides the results panel rather than listing every setting).
 */
export function filterSettingsSearchEntries(
	query: string,
	entries: readonly SettingsSearchEntry[],
	limit = 12,
): SettingsSearchEntry[] {
	const normalized = query.trim().toLowerCase();
	if (normalized.length === 0) return [];

	const scored: ScoredEntry[] = [];
	for (const entry of entries) {
		const score = scoreEntry(entry, normalized);
		if (score > 0) scored.push({ entry, score });
	}

	scored.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.entry.name.localeCompare(b.entry.name);
	});

	return scored.slice(0, limit).map((s) => s.entry);
}
