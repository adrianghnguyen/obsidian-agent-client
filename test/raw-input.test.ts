import { describe, it, expect } from "vitest";
import {
	isRawInputRecord,
	normalizeRawInput,
} from "../src/utils/raw-input";

describe("normalizeRawInput", () => {
	it("returns undefined for undefined and null", () => {
		expect(normalizeRawInput(undefined)).toBeUndefined();
		expect(normalizeRawInput(null)).toBeUndefined();
	});

	it("parses a valid JSON string into an object", () => {
		const json = JSON.stringify({
			CommandLine: "git status",
			Cwd: "C:\\Obsidian",
			toolAction: "Checking git status",
		});
		const result = normalizeRawInput(json);
		expect(result).toEqual({
			CommandLine: "git status",
			Cwd: "C:\\Obsidian",
			toolAction: "Checking git status",
		});
	});

	it("parses a JSON string containing subagentType", () => {
		const result = normalizeRawInput('{"subagentType":"explore"}');
		expect(result).toEqual({ subagentType: "explore" });
	});

	it("returns undefined for an invalid JSON string", () => {
		expect(normalizeRawInput("not json")).toBeUndefined();
		expect(normalizeRawInput('{"CommandLine":')).toBeUndefined();
	});

	it("returns undefined for empty/whitespace strings", () => {
		expect(normalizeRawInput("")).toBeUndefined();
		expect(normalizeRawInput("   ")).toBeUndefined();
	});

	it("returns undefined when a JSON string parses to a non-object", () => {
		expect(normalizeRawInput('"a string"')).toBeUndefined();
		expect(normalizeRawInput("42")).toBeUndefined();
		expect(normalizeRawInput("true")).toBeUndefined();
		expect(normalizeRawInput("[1,2,3]")).toBeUndefined();
	});

	it("returns an object input as-is", () => {
		const obj = { _toolName: "RunCommand" };
		expect(normalizeRawInput(obj)).toBe(obj);
	});

	it("returns undefined for numbers, booleans, and arrays", () => {
		expect(normalizeRawInput(42)).toBeUndefined();
		expect(normalizeRawInput(true)).toBeUndefined();
		expect(normalizeRawInput([1, 2, 3])).toBeUndefined();
	});
});

describe("isRawInputRecord", () => {
	it("is true only for non-null, non-array objects", () => {
		expect(isRawInputRecord({})).toBe(true);
		expect(isRawInputRecord({ a: 1 })).toBe(true);
		expect(isRawInputRecord(null)).toBe(false);
		expect(isRawInputRecord(undefined)).toBe(false);
		expect(isRawInputRecord("str")).toBe(false);
		expect(isRawInputRecord([1])).toBe(false);
		expect(isRawInputRecord(42)).toBe(false);
	});
});
