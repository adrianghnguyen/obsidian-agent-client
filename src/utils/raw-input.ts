/**
 * Pure helpers for normalizing ACP `rawInput` / `rawOutput` payloads.
 * No React, no obsidian, no ACP SDK.
 *
 * Some ACP agents send `rawInput` as a JSON-encoded string rather than a
 * parsed object (e.g. `{"CommandLine":"git status",...}`). Downstream code
 * runs `"key" in rawInput`, which throws a TypeError on a string. These
 * helpers normalize the value to a plain object (or undefined) at the ACP
 * boundary so every consumer is safe.
 */

export type RawInput = { [k: string]: unknown };

/**
 * True for non-null, non-array objects (plain objects and object subclasses).
 */
export function isRawInputRecord(value: unknown): value is RawInput {
	return (
		typeof value === "object" &&
		value !== null &&
		!Array.isArray(value)
	);
}

/**
 * Coerce an ACP `rawInput`/`rawOutput` value to a plain object.
 *
 * - undefined/null            -> undefined
 * - non-empty JSON string     -> parsed value if it is a plain object, else undefined
 * - unparseable JSON string   -> undefined
 * - empty/whitespace string   -> undefined
 * - plain object              -> the value itself
 * - anything else (number, boolean, array, ...) -> undefined
 */
export function normalizeRawInput(value: unknown): RawInput | undefined {
	if (value === undefined || value === null) {
		return undefined;
	}

	if (typeof value === "string") {
		if (value.trim().length === 0) {
			return undefined;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(value);
		} catch {
			return undefined;
		}
		return isRawInputRecord(parsed) ? parsed : undefined;
	}

	return isRawInputRecord(value) ? value : undefined;
}
