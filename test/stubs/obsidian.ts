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
