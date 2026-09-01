import { describe, it, expect } from "vitest";
import {
	isSubagentToolCall,
	resolveToolCallTitle,
} from "../src/services/tool-call-display";

describe("resolveToolCallTitle", () => {
	it("prefers an explicit title", () => {
		expect(
			resolveToolCallTitle({ title: "Read README", kind: "read" }),
		).toBe("Read README");
	});

	it("uses description / prompt when title is empty", () => {
		expect(
			resolveToolCallTitle({
				title: "",
				subagent: true,
				rawInput: { description: "Explore auth" },
			}),
		).toBe("Explore auth");
		expect(
			resolveToolCallTitle({
				rawInput: { prompt: "Find where login happens\nMore" },
			}),
		).toBe("Find where login happens");
	});

	it("falls back to Subagent task", () => {
		expect(resolveToolCallTitle({ subagent: true })).toBe("Subagent task");
		expect(resolveToolCallTitle({ rawInput: { _toolName: "Task" } })).toBe(
			"Subagent task",
		);
	});
});

describe("isSubagentToolCall", () => {
	it("detects meta flag, nested calls, and Task/Agent titles", () => {
		expect(isSubagentToolCall({ subagent: true })).toBe(true);
		expect(
			isSubagentToolCall({
				title: "Task",
				nestedCalls: [
					{
						type: "tool_call",
						toolCallId: "c1",
						status: "completed",
					},
				],
			}),
		).toBe(true);
		expect(isSubagentToolCall({ title: "Read file" })).toBe(false);
		expect(
			isSubagentToolCall({ rawInput: { subagentType: "explore" } }),
		).toBe(true);
	});

	it("does not throw on a JSON-string rawInput (agent anti-gravity)", () => {
		// Production crash: rawInput arrived as a JSON-encoded string and
		// `"subagentType" in rawInput` threw a TypeError during render.
		const gitStatus =
			'{"CommandLine":"git status","Cwd":"C:\\Obsidian","WaitMsBeforeAsync":5000,"toolAction":"Checking git status","toolSummary":"Check git status"}';
		expect(() =>
			isSubagentToolCall({ rawInput: gitStatus as never }),
		).not.toThrow();
		// Not a subagent -> false, and no crash.
		expect(isSubagentToolCall({ rawInput: gitStatus as never })).toBe(false);
		// Malformed string rawInput is equally safe.
		expect(isSubagentToolCall({ rawInput: "not json" as never })).toBe(
			false,
		);
	});

	it("treats a JSON-string rawInput as normalized-at-boundary", () => {
		// rawInput is normalized at the ACP boundary (acp-handler /
		// permission-handler), so the value reaching these helpers is a real
		// object. A JSON string containing subagentType normalizes to an
		// object and is detected; the raw string itself is (defensively)
		// treated as a non-object -> false.
		const subagentJson = '{"subagentType":"explore","prompt":"find login"}';
		const normalized = JSON.parse(subagentJson) as {
			[k: string]: unknown;
		};
		expect(isSubagentToolCall({ rawInput: normalized })).toBe(true);
		expect(isSubagentToolCall({ rawInput: subagentJson as never })).toBe(
			false,
		);
	});

	it("derives the tool name from a normalized JSON-string rawInput", () => {
		// After boundary normalization, _toolName is readable and the title
		// falls back to it.
		const raw = JSON.parse('{"_toolName":"RunCommand","CommandLine":"git status"}');
		expect(
			resolveToolCallTitle({ rawInput: raw }),
		).toBe("RunCommand");
	});
});
