import { describe, it, expect } from "vitest";
import { FileSystemAdapter } from "obsidian";
import { resolveImageSrc } from "../src/services/image-resolver";
import type AgentClientPlugin from "../src/plugin";

/**
 * The real `FileSystemAdapter.getResourcePath` returns an opaque
 * `app://<hash>/...` URL, so it cannot be asserted by value. The mock overrides
 * it deterministically: `getResourcePath(p) -> app://local/${p}`.
 *
 * `resolveImageSrc` calls `getResourcePath(normalizePath(trimmed))`, so the
 * resolved output is exactly `app://local/` + (whatever the stub's
 * `normalizePath` returns). The stub cleans slashes but PRESERVES `..` segments,
 * so for the single-slash paths below `normalizePath` is an identity and the
 * literal expectations match.
 */
class MockFileSystemAdapter extends FileSystemAdapter {
	getResourcePath(normalizedPath: string): string {
		return `app://local/${normalizedPath}`;
	}
}

function pluginWith(adapter: unknown): AgentClientPlugin {
	return {
		app: { vault: { adapter } },
	} as unknown as AgentClientPlugin;
}

const fsPlugin = pluginWith(new MockFileSystemAdapter());

describe("resolveImageSrc — absolute URL passthrough", () => {
	const passthrough: Array<[string, string, string]> = [
		["http scheme", "http://example.com/a.png", "http://example.com/a.png"],
		[
			"https scheme",
			"https://example.com/a.png",
			"https://example.com/a.png",
		],
		[
			"scheme match is case-insensitive",
			"HTTPS://EXAMPLE.com/A.png",
			"HTTPS://EXAMPLE.com/A.png",
		],
		[
			"data:image/png",
			"data:image/png;base64,iVBORw0KGgo=",
			"data:image/png;base64,iVBORw0KGgo=",
		],
		[
			"data:image/jpeg",
			"data:image/jpeg;base64,/9j/4AAQSkZJRg==",
			"data:image/jpeg;base64,/9j/4AAQSkZJRg==",
		],
	];

	for (const [name, input, expected] of passthrough) {
		it(`passes ${name} through unchanged`, () => {
			expect(resolveImageSrc(fsPlugin, input)).toBe(expected);
		});
	}

	it("trims surrounding whitespace before returning a passthrough URL", () => {
		expect(resolveImageSrc(fsPlugin, "  http://example.com/a.png  ")).toBe(
			"http://example.com/a.png",
		);
	});

	it("returns a passthrough URL even when the adapter is not a FileSystemAdapter", () => {
		// Passthrough happens before the adapter is touched.
		const plugin = pluginWith({});
		expect(resolveImageSrc(plugin, "https://example.com/a.png")).toBe(
			"https://example.com/a.png",
		);
	});
});

describe("resolveImageSrc — empty / nullish input", () => {
	const nullish: Array<[string, string | null | undefined]> = [
		["null", null],
		["undefined", undefined],
		["empty string", ""],
		["whitespace-only string", "   "],
	];

	for (const [name, input] of nullish) {
		it(`returns null for ${name}`, () => {
			expect(resolveImageSrc(fsPlugin, input)).toBeNull();
		});
	}
});

describe("resolveImageSrc — vault-relative resolution", () => {
	const resolved: Array<[string, string, string]> = [
		["simple path", "assets/avatar.png", "app://local/assets/avatar.png"],
		[
			"legitimate deep path",
			"assets/icons/deep/avatar.png",
			"app://local/assets/icons/deep/avatar.png",
		],
		[
			"in-vault `..` whose depth nets non-negative",
			"assets/../avatar.png",
			"app://local/assets/../avatar.png",
		],
	];

	for (const [name, input, expected] of resolved) {
		it(`resolves ${name} via the adapter`, () => {
			const result = resolveImageSrc(fsPlugin, input);
			expect(result).not.toBeNull();
			expect(result).toBe(expected);
		});
	}

	it("trims surrounding whitespace before resolving", () => {
		expect(resolveImageSrc(fsPlugin, "  assets/avatar.png  ")).toBe(
			"app://local/assets/avatar.png",
		);
	});

	it("returns null when the adapter is not a FileSystemAdapter", () => {
		const plugin = pluginWith({});
		expect(resolveImageSrc(plugin, "assets/avatar.png")).toBeNull();
	});

	it("returns null for a non-FileSystemAdapter that merely duck-types getResourcePath", () => {
		// The gate is `instanceof FileSystemAdapter`, not a method check.
		const plugin = pluginWith({
			getResourcePath: (p: string) => `app://local/${p}`,
		});
		expect(resolveImageSrc(plugin, "assets/avatar.png")).toBeNull();
	});
});

describe("resolveImageSrc — path-traversal / escape guard (G4)", () => {
	const rejected: Array<[string, string]> = [
		["a parent-directory escape", "../secret.png"],
		["an absolute unix path", "/etc/passwd"],
		["a backslash-leading path", "\\server\\share\\x.png"],
		["a Windows drive-letter path", "C:\\Windows\\x.png"],
		["a home-directory reference", "~/secret.png"],
		["a path whose net depth goes negative", "assets/../../x.png"],
	];

	for (const [name, input] of rejected) {
		it(`returns null for ${name} (${JSON.stringify(input)})`, () => {
			expect(resolveImageSrc(fsPlugin, input)).toBeNull();
		});
	}

	it("still resolves an in-vault `..` that does not escape the root", () => {
		// Guard rejects escapes, NOT every `..` — depth here nets non-negative.
		expect(resolveImageSrc(fsPlugin, "assets/../avatar.png")).toBe(
			"app://local/assets/../avatar.png",
		);
	});
});
