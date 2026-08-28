import { describe, it, expect } from "vitest";
import { extractToolCallMeta } from "../src/acp/session-meta";
import {
	parseCursorTaskParams,
	cursorTaskToToolCall,
	cursorCreatePlanToToolCall,
	parseCursorCreatePlanParams,
} from "../src/acp/cursor-extensions";

describe("extractToolCallMeta", () => {
	it("reads claudeCode parentToolUseId and subagent", () => {
		expect(
			extractToolCallMeta({
				claudeCode: {
					parentToolUseId: "parent-1",
					subagent: true,
					title: "Explore",
				},
			}),
		).toEqual({
			parentToolUseId: "parent-1",
			subagent: true,
			title: "Explore",
		});
	});

	it("merges notification _meta with update _meta", () => {
		expect(
			extractToolCallMeta(
				{ claudeCode: { parent_tool_use_id: "p" } },
				{ subagent: true },
			),
		).toEqual({ parentToolUseId: "p", subagent: true });
	});
});

describe("cursor/task", () => {
	it("parses and converts to a visible subagent tool call", () => {
		const params = parseCursorTaskParams({
			toolCallId: "call_126",
			description: "Explore codebase",
			prompt: "Find auth handlers",
			subagentType: "explore",
		});
		const update = cursorTaskToToolCall(params, "sess-1");
		expect(update.type).toBe("tool_call");
		expect(update.subagent).toBe(true);
		expect(update.title).toBe("Explore codebase");
		expect(update.kind).toBe("search");
		expect(update.status).toBe("in_progress");
		expect(update.content).toEqual([
			{ type: "content", text: "Find auth handlers" },
		]);
	});

	it("marks completed when durationMs is present", () => {
		const params = parseCursorTaskParams({
			toolCallId: "call_126",
			description: "Done",
			prompt: "",
			subagentType: { custom: "reviewer" },
			durationMs: 1200,
		});
		expect(cursorTaskToToolCall(params, "s").status).toBe("completed");
		expect(params.subagentType).toBe("reviewer");
	});
});

describe("cursor/create_plan", () => {
	it("converts plan markdown into tool-call content", () => {
		const params = parseCursorCreatePlanParams({
			toolCallId: "call_124",
			name: "Refactor tabs",
			overview: "Tighten layout",
			plan: "1. Inspect\n2. Update",
		});
		const update = cursorCreatePlanToToolCall(params, "sess-1");
		expect(update.title).toBe("Refactor tabs");
		expect(update.content?.[0]).toEqual({
			type: "content",
			text: "Tighten layout\n\n1. Inspect\n2. Update",
		});
	});
});
