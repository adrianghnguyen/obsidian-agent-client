import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_REPO_URL,
	buildManifestBanner,
	parseChangelogSections,
	releasesUrlFromRepo,
} from "../src/services/changelog-banner";

const SAMPLE = `# Changelog

Intro paragraph ignored.

## [Unreleased]

### Added
- **Floating lock** — keeps the window opaque.
- Another unreleased fix.

## 0.21.0

### Added
- Verbosity level in the toolbar.
- Session history lists every local chat.

### Fixed
- Floating chat default window size.

## 0.20.0

- Older item that should not appear when the pool is full.
`;

describe("parseChangelogSections", () => {
	it("skips the intro and collects bullets under each heading", () => {
		const sections = parseChangelogSections(SAMPLE);
		expect(sections.map((section) => section.title)).toEqual([
			"Unreleased",
			"0.21.0",
			"0.20.0",
		]);
		expect(sections[0].items).toEqual([
			"Floating lock — keeps the window opaque.",
			"Another unreleased fix.",
		]);
		expect(sections[1].items).toHaveLength(3);
	});

	it("normalizes keep-a-changelog titles with a date suffix", () => {
		const sections = parseChangelogSections(
			"## [0.21.0] - 2026-04-01\n- Shipped feature.\n",
		);
		expect(sections[0].title).toBe("0.21.0");
		expect(sections[0].items).toEqual(["Shipped feature."]);
	});

	it("treats CRLF the same as LF", () => {
		const sections = parseChangelogSections(
			"## [Unreleased]\r\n- Windows line.\r\n",
		);
		expect(sections[0].items).toEqual(["Windows line."]);
	});

	it("strips inline markdown from bullets", () => {
		const sections = parseChangelogSections(
			"## 1.0.0\n- See [docs](https://example.com) and `code`.\n",
		);
		expect(sections[0].items).toEqual(["See docs and code."]);
	});
});

describe("buildManifestBanner", () => {
	it("prefers unreleased bullets and fills from the latest version", () => {
		const banner = buildManifestBanner("0.21.0", SAMPLE, { limit: 4 });
		expect(banner.label).toBe("v0.21.0");
		expect(banner.heading).toBe("Recent changes");
		expect(banner.items).toEqual([
			"Floating lock — keeps the window opaque.",
			"Another unreleased fix.",
			"Verbosity level in the toolbar.",
			"Session history lists every local chat.",
		]);
		expect(banner.moreCount).toBe(1);
		expect(banner.releasesUrl).toBe(`${DEFAULT_REPO_URL}/releases`);
	});

	it("falls back to the latest versioned section when Unreleased is empty", () => {
		const banner = buildManifestBanner(
			"0.21.0",
			"## [Unreleased]\n\n## 0.21.0\n- Shipped only.\n",
		);
		expect(banner.heading).toBe("What's new in 0.21.0");
		expect(banner.items).toEqual(["Shipped only."]);
		expect(banner.moreCount).toBe(0);
	});

	it("keeps a version prefix already present on the label", () => {
		expect(buildManifestBanner("v1.2.3", "").label).toBe("v1.2.3");
	});

	it("returns an empty item list for a changelog with no bullets", () => {
		const banner = buildManifestBanner(
			"0.1.0",
			"# Changelog\n\nNo sections.\n",
		);
		expect(banner.items).toEqual([]);
		expect(banner.heading).toBe("Recent changes");
		expect(banner.moreCount).toBe(0);
	});
});

describe("releasesUrlFromRepo", () => {
	it("appends /releases and strips a trailing slash", () => {
		expect(releasesUrlFromRepo("https://github.com/acme/plugin/")).toBe(
			"https://github.com/acme/plugin/releases",
		);
	});

	it("falls back to the fork repo when authorUrl is missing", () => {
		expect(releasesUrlFromRepo(undefined)).toBe(
			`${DEFAULT_REPO_URL}/releases`,
		);
		expect(releasesUrlFromRepo("   ")).toBe(`${DEFAULT_REPO_URL}/releases`);
	});
});

describe("repo CHANGELOG.md", () => {
	it("parses and has at least one recent bullet", () => {
		const markdown = readFileSync(
			resolve(fileURLToPath(new URL("../CHANGELOG.md", import.meta.url))),
			"utf8",
		);
		const banner = buildManifestBanner("0.21.0", markdown);
		expect(banner.items.length).toBeGreaterThan(0);
		expect(banner.items[0].length).toBeGreaterThan(0);
	});
});
