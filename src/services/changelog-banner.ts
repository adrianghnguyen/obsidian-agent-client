/**
 * Parse CHANGELOG.md into the settings-tab manifest banner.
 * UI stays free of markdown parsing; this module is pure and unit-tested.
 */

export const DEFAULT_RECENT_CHANGE_LIMIT = 5;

export const DEFAULT_REPO_URL =
	"https://github.com/adrianghnguyen/obsidian-agent-client";

export interface ChangelogSection {
	title: string;
	items: string[];
}

export interface ManifestBannerModel {
	version: string;
	label: string;
	heading: string;
	items: string[];
	moreCount: number;
	releasesUrl: string;
}

export interface ManifestBannerOptions {
	repoUrl?: string;
	limit?: number;
}

/**
 * Split keep-a-changelog markdown into heading + bullet sections.
 * Understands `## [Unreleased]`, `## 0.21.0`, and `## [0.21.0] - date`.
 */
export function parseChangelogSections(markdown: string): ChangelogSection[] {
	const sections: ChangelogSection[] = [];
	let current: ChangelogSection | null = null;

	for (const rawLine of markdown.replace(/\r\n/g, "\n").split("\n")) {
		const line = rawLine.trimEnd();
		const heading = line.match(/^##\s+(.+)$/);
		if (heading) {
			current = { title: normalizeSectionTitle(heading[1]), items: [] };
			sections.push(current);
			continue;
		}
		if (!current) {
			continue;
		}
		const bullet = line.match(/^[-*]\s+(.+)$/);
		if (bullet) {
			const text = stripInlineMarkdown(bullet[1]);
			if (text.length > 0) {
				current.items.push(text);
			}
		}
	}

	return sections;
}

export function buildManifestBanner(
	version: string,
	markdown: string,
	options: ManifestBannerOptions = {},
): ManifestBannerModel {
	const limit = options.limit ?? DEFAULT_RECENT_CHANGE_LIMIT;
	const sections = parseChangelogSections(markdown);
	const unreleased = sections.find(
		(section) => section.title.toLowerCase() === "unreleased",
	);
	const versioned = sections.filter(
		(section) => section.title.toLowerCase() !== "unreleased",
	);

	const pool: string[] = [];
	const usedUnreleased = Boolean(unreleased && unreleased.items.length > 0);
	if (usedUnreleased && unreleased) {
		pool.push(...unreleased.items);
	}
	if (versioned[0]) {
		pool.push(...versioned[0].items);
	}

	const items = pool.slice(0, limit);
	const moreCount = Math.max(0, pool.length - items.length);
	const heading = usedUnreleased
		? "Recent changes"
		: versioned[0]
			? `What's new in ${versioned[0].title}`
			: "Recent changes";

	return {
		version,
		label: formatVersionLabel(version),
		heading,
		items,
		moreCount,
		releasesUrl: releasesUrlFromRepo(options.repoUrl),
	};
}

export function releasesUrlFromRepo(repoUrl?: string): string {
	const base = (repoUrl?.trim() || DEFAULT_REPO_URL).replace(/\/+$/, "");
	return `${base}/releases`;
}

function formatVersionLabel(version: string): string {
	const trimmed = version.trim();
	if (trimmed.length === 0) {
		return "";
	}
	return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

function normalizeSectionTitle(raw: string): string {
	const trimmed = raw.trim();
	const bracketed = trimmed.match(/^\[([^\]]+)\](?:\s*[-–].*)?$/);
	return (bracketed ? bracketed[1] : trimmed).trim();
}

function stripInlineMarkdown(text: string): string {
	return text
		.replace(/\*\*(.+?)\*\*/g, "$1")
		.replace(/`([^`]+)`/g, "$1")
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.trim();
}
