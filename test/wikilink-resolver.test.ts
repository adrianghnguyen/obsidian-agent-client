import { describe, it, expect } from "vitest";
import { TFile } from "obsidian";
import type { App } from "obsidian";
import {
	buildBasenameIndex,
	extractLinkedNoteMetadata,
} from "../src/utils/wikilink-resolver";

// The resolver takes `app` as an explicit parameter (the DI seam), so a fake
// App exposing only vault.getMarkdownFiles() + metadataCache.getFirstLinkpathDest
// is enough — no real Obsidian runtime. Fixtures are real stub-TFile instances
// so the resolver's `resolved instanceof TFile` check passes.

function file(path: string): TFile {
	const basename = path.split("/").pop()!.replace(/\.md$/, "");
	return new TFile(path, basename);
}

/**
 * Build a fake App. `getFirstLinkpathDest` resolves a target to a file via the
 * provided map (keyed by the raw target string); returns null otherwise.
 */
function makeApp(files: TFile[], firstDest: Record<string, TFile> = {}): App {
	return {
		vault: { getMarkdownFiles: () => files },
		metadataCache: {
			getFirstLinkpathDest: (target: string): TFile | null =>
				firstDest[target] ?? null,
		},
	} as unknown as App;
}

describe("buildBasenameIndex", () => {
	it("groups files by basename and preserves collisions", () => {
		const a = file("a/Note.md");
		const b = file("b/Note.md");
		const c = file("c/Other.md");
		const index = buildBasenameIndex(makeApp([a, b, c]));
		expect(index.get("Note")).toEqual([a, b]);
		expect(index.get("Other")).toEqual([c]);
		expect(index.has("Missing")).toBe(false);
	});
});

describe("extractLinkedNoteMetadata — parsing", () => {
	it("returns [] for empty content", () => {
		const app = makeApp([]);
		expect(
			extractLinkedNoteMetadata(
				"",
				"Src.md",
				buildBasenameIndex(app),
				app,
			),
		).toEqual([]);
	});

	it("skips embeds ![[Foo]]", () => {
		const app = makeApp([]);
		const out = extractLinkedNoteMetadata(
			"before ![[Foo]] after",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(out).toEqual([]);
	});

	it("skips in-document anchors [[#Heading]]", () => {
		const app = makeApp([]);
		const out = extractLinkedNoteMetadata(
			"see [[#Heading]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(out).toEqual([]);
	});

	it("extracts alias into displayText, but not when alias equals the target", () => {
		const app = makeApp([]);
		const withAlias = extractLinkedNoteMetadata(
			"[[Foo|bar]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(withAlias[0].linkText).toBe("Foo");
		expect(withAlias[0].displayText).toBe("bar");

		const sameAlias = extractLinkedNoteMetadata(
			"[[Foo|Foo]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(sameAlias[0].displayText).toBeUndefined();
	});

	it("extracts section anchor, and both section + alias together", () => {
		const app = makeApp([]);
		const section = extractLinkedNoteMetadata(
			"[[Foo#Bar]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(section[0].linkText).toBe("Foo");
		expect(section[0].section).toBe("Bar");
		expect(section[0].displayText).toBeUndefined();

		const both = extractLinkedNoteMetadata(
			"[[Foo#Bar|baz]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(both[0].linkText).toBe("Foo");
		expect(both[0].section).toBe("Bar");
		expect(both[0].displayText).toBe("baz");
	});

	it("dedupes by composite target|alias|section key", () => {
		const app = makeApp([]);
		const dup = extractLinkedNoteMetadata(
			"[[Foo]] and again [[Foo]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(dup).toHaveLength(1);

		const distinct = extractLinkedNoteMetadata(
			"[[Foo]] and [[Foo|bar]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(distinct).toHaveLength(2);
	});
});

describe("extractLinkedNoteMetadata — resolution", () => {
	it("resolves a single-candidate link (resolved)", () => {
		const f = file("folder/Foo.md");
		const app = makeApp([f], { Foo: f });
		const out = extractLinkedNoteMetadata(
			"[[Foo]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(out[0].candidates).toEqual([
			{ path: "folder/Foo.md", basename: "Foo" },
		]);
	});

	it("leaves an unresolved link with no candidates", () => {
		const app = makeApp([]); // no files, no firstDest
		const out = extractLinkedNoteMetadata(
			"[[Missing]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(out[0].candidates).toEqual([]);
	});

	it("surfaces basename collisions as multiple candidates (ambiguous), deduped by path", () => {
		const a = file("a/Foo.md");
		const b = file("b/Foo.md");
		// getFirstLinkpathDest points at one of them; the basename index adds
		// both. The one overlapping with firstDest must not double-count.
		const app = makeApp([a, b], { Foo: a });
		const out = extractLinkedNoteMetadata(
			"[[Foo]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(out[0].candidates).toHaveLength(2);
		expect(out[0].candidates.map((c) => c.path).sort()).toEqual([
			"a/Foo.md",
			"b/Foo.md",
		]);
	});

	it("does not basename-expand a target that carries a file extension", () => {
		const a = file("a/Foo.md");
		const b = file("b/Foo.md");
		// Two "Foo" md files exist, but the target is "Foo.png" (has extension),
		// so only getFirstLinkpathDest applies — here it resolves nothing.
		const app = makeApp([a, b]);
		const out = extractLinkedNoteMetadata(
			"[[Foo.png]]",
			"Src.md",
			buildBasenameIndex(app),
			app,
		);
		expect(out[0].candidates).toEqual([]);
	});
});
