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
});
