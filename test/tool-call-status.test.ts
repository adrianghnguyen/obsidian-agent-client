import { describe, it, expect } from "vitest";
import type { ToolCallMessageContent } from "../src/types/chat";
import {
	classifyToolCallFailure,
	countFailedToolCalls,
	findToolFailureReason,
	isUnexplainedFailure,
	readToolRawOutputText,
	toolCallStatusIcon,
	toolCallStatusLabel,
} from "../src/services/tool-call-status";

function call(
	overrides: Partial<ToolCallMessageContent> = {},
): ToolCallMessageContent {
	return {
		type: "tool_call",
		toolCallId: "call_1",
		status: "failed",
		...overrides,
	};
}

describe("classifyToolCallFailure", () => {
	it("treats a bare failed call as aborted (Antigravity sweep)", () => {
		expect(classifyToolCallFailure(call())).toBe("aborted");
	});

	it("treats a failed call with a raw output payload as explained", () => {
		expect(
			classifyToolCallFailure(
				call({ rawOutput: { error: "boom" } }),
			),
		).toBe("explained");
	});

	it("treats a failed call with ACP content as explained", () => {
		expect(
			classifyToolCallFailure(
				call({ content: [{ type: "content", text: "err" }] }),
			),
		).toBe("explained");
	});

	it("treats a non-error message payload as aborted", () => {
		expect(
			classifyToolCallFailure(
				call({
					rawOutput: {
						message: "Tool call was approved but never executed.",
					},
				}),
			),
		).toBe("aborted");
	});

	it("keeps a resource_link read as unknown, not aborted", () => {
		expect(
			classifyToolCallFailure(
				call({
					rawInput: {
						resource: { uri: "file:///note.md" },
					},
				}),
			),
		).toBe("unknown");
	});

	it("never classifies a completed call as aborted", () => {
		expect(classifyToolCallFailure(call({ status: "completed" }))).toBe(
			"unknown",
		);
	});
});

describe("isUnexplainedFailure", () => {
	it("is true only for a bare failed call", () => {
		expect(isUnexplainedFailure(call())).toBe(true);
		expect(isUnexplainedFailure(call({ rawOutput: { error: "x" } }))).toBe(
			false,
		);
		expect(isUnexplainedFailure(call({ status: "completed" }))).toBe(false);
	});
});

describe("readToolRawOutputText", () => {
	it("reads error/message string keys", () => {
		expect(readToolRawOutputText({ error: "nah" })).toBe("nah");
		expect(readToolRawOutputText({ message: "hi" })).toBe("hi");
		expect(readToolRawOutputText({ other: 1 })).toBeNull();
		expect(readToolRawOutputText(undefined)).toBeNull();
	});
});

describe("countFailedToolCalls", () => {
	it("excludes aborted calls by default", () => {
		expect(
			countFailedToolCalls([
				call({ toolCallId: "a" }),
				call({ toolCallId: "b", rawOutput: { error: "real" } }),
			]),
		).toBe(1);
	});

	it("includes aborted calls in strict mode", () => {
		expect(
			countFailedToolCalls(
				[
					call({ toolCallId: "a" }),
					call({ toolCallId: "b", rawOutput: { error: "real" } }),
				],
				{ includeUnexplained: true },
			),
		).toBe(2);
	});
});

describe("findToolFailureReason", () => {
	it("explains a denied call", () => {
		expect(
			findToolFailureReason(call({ rawOutput: { error: "Rejected by user" } })),
		).toContain("Rejected by user");
	});

	it("names the aborted tool when known", () => {
		expect(
			findToolFailureReason(call({ rawInput: { _toolName: "view_file" } })),
		).toContain("view_file");
	});

	it("falls back to a generic abort sentence", () => {
		expect(findToolFailureReason(call())).toBe(
			"The agent aborted this call before it ran.",
		);
	});

	it("returns null for a completed call", () => {
		expect(findToolFailureReason(call({ status: "completed" }))).toBeNull();
	});
});

describe("icon and label", () => {
	it("uses slash + Not run for aborted calls in lenient mode", () => {
		const c = call();
		expect(toolCallStatusIcon("failed", c, "lenient")).toBe("slash");
		expect(toolCallStatusLabel("failed", c, "lenient")).toBe("Not run");
	});

	it("uses x + Failed for aborted calls in strict mode", () => {
		const c = call();
		expect(toolCallStatusIcon("failed", c, "strict")).toBe("x");
		expect(toolCallStatusLabel("failed", c, "strict")).toBe("Failed");
	});

	it("keeps a real failure red in lenient mode", () => {
		const c = call({ rawOutput: { error: "boom" } });
		expect(toolCallStatusIcon("failed", c, "lenient")).toBe("x");
		expect(toolCallStatusLabel("failed", c, "lenient")).toBe("Failed");
	});
});
