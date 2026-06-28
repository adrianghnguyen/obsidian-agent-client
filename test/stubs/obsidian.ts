/**
 * Lightweight `obsidian` stub for unit tests.
 *
 * The real `obsidian` module only exists inside the Obsidian runtime, so
 * `vitest.config.mts` aliases the bare `obsidian` import to this file. Both the
 * source under test and the tests resolve to the same stub, so the shared
 * constructors line up (e.g. `instanceof FileSystemAdapter` works across the
 * boundary).
 *
 * Exports provided:
 * - `Platform`: flags read at call time by `src/utils/platform.ts` /
 *   `src/utils/paths.ts`. Tests mutate these to exercise platform branches.
 * - `parseYaml`: YAML parser used by `src/utils/agent-block-parser.ts`,
 *   delegated to the `yaml` package.
 * - `FileSystemAdapter` / `normalizePath`: used by
 *   `src/services/image-resolver.ts` for resource-path resolution and the
 *   vault-escape guard.
 */

import { parse as parseYamlImpl } from "yaml";

export const Platform = {
	isWin: false,
	isMacOS: false,
	isLinux: false,
	isDesktopApp: true,
};

/**
 * Parse a YAML document. Mirrors Obsidian's `parseYaml`, which is a thin
 * wrapper over the `yaml` package.
 */
export function parseYaml(content: string): unknown {
	return parseYamlImpl(content);
}

/**
 * Minimal stand-in for Obsidian's `FileSystemAdapter`.
 *
 * `getResourcePath` is the identity so callers get back a deterministic value,
 * and the class identity exists so `instanceof` / `extends` against the same
 * stub constructor line up between source and tests.
 */
export class FileSystemAdapter {
	getResourcePath(normalizedPath: string): string {
		return normalizedPath;
	}
}

/**
 * Clean up a vault path, approximating Obsidian's `normalizePath`: convert
 * backslashes to forward slashes, collapse duplicate slashes, and trim
 * leading/trailing slashes. (The surrounding-whitespace trim is a stub
 * convenience; the real `normalizePath` does not do this, but the source
 * trims before calling.) An empty result normalizes to "/".
 *
 * CRITICAL: this does NOT resolve or drop "." / ".." segments. The
 * traversal guard in `services/image-resolver.ts` splits the normalized path
 * and counts ".." segments, so they must survive normalization for the guard
 * to remain observable.
 */
export function normalizePath(path: string): string {
	const cleaned = path
		.trim()
		.replace(/[\\/]+/g, "/") // backslashes -> "/", collapse duplicates
		.replace(/^\/+|\/+$/g, ""); // trim leading/trailing slashes
	return cleaned.length === 0 ? "/" : cleaned;
}
