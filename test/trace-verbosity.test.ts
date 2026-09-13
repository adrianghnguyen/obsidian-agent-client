import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/services/default-settings";
import { normalizeRawInput } from "../src/utils/raw-input";
import type { MessageContent, ToolCallMessageContent } from "../src/types/chat";
import {
	DEFAULT_TRACE_VERBOSITY,
	TRACE_VERBOSITY_DESCRIPTIONS,
	TRACE_VERBOSITY_LABELS,
	TRACE_VERBOSITY_LEVELS,
	TRACE_VERBOSITY_SETTING_KEY,
	TRACE_VERBOSITY_SUMMARY,
	extractToolCommand,
	groupTraceContent,
	hiddenTraceSummary,
	isHiddenTraceItem,
	parseTraceVerbosity,
	shouldFoldToolDetails,
	shouldGroupNoisyTool,
	shouldRenderThought,
	shouldShowVerbosityControl,
	thoughtExpandedByDefault,
	type TraceVerbosity,
} from "../src/services/trace-verbosity";

const LEVELS: TraceVerbosity[] = ["hidden", "compact", "full"];

const cursorExecute = {
	kind: "execute",
	status: "completed" as const,
	rawInput: { command: "git status", args: [] },
};

const antigravityExecute = {
	kind: "other" as const,
	status: "completed" as const,
	rawInput: JSON.stringify({
		CommandLine: "git status",
		Cwd: "C:\\Obsidian",
		WaitMsBeforeAsync: 5000,
		toolAction: "Checking git status",
		toolSummary: "Check git status",
	}),
};

const thinkTool = {
	kind: "think" as const,
	status: "completed" as const,
};

const pendingPermission = {
	kind: "execute" as const,
	status: "pending" as const,
	hasPermission: true,
	rawInput: { command: "rm -rf /" },
};

describe("trace verbosity copy", () => {
	it("exposes a short summary and per-level descriptions", () => {
		expect(TRACE_VERBOSITY_SUMMARY.length).toBeLessThan(120);
		expect(TRACE_VERBOSITY_SUMMARY).toMatch(/thinking and tool activity/i);

		for (const level of TRACE_VERBOSITY_LEVELS) {
			expect(TRACE_VERBOSITY_LABELS[level]).toBeTruthy();
			expect(TRACE_VERBOSITY_DESCRIPTIONS[level].length).toBeGreaterThan(
				10,
			);
		}

		expect(TRACE_VERBOSITY_DESCRIPTIONS.hidden).toMatch(/summary line/i);
		expect(TRACE_VERBOSITY_DESCRIPTIONS.compact).toMatch(/folds/i);
		expect(TRACE_VERBOSITY_DESCRIPTIONS.full).toMatch(/full/i);
	});
});

describe("parseTraceVerbosity", () => {
	it("defaults to compact", () => {
		expect(DEFAULT_TRACE_VERBOSITY).toBe("compact");
		expect(parseTraceVerbosity(undefined)).toBe("compact");
		expect(parseTraceVerbosity(null)).toBe("compact");
		expect(parseTraceVerbosity("nope")).toBe("compact");
	});

	it("accepts hidden, compact, and full", () => {
		for (const level of TRACE_VERBOSITY_LEVELS) {
			expect(parseTraceVerbosity(level)).toBe(level);
		}
	});
});

describe("thought display", () => {
	it("hides agent_thought only at hidden", () => {
		expect(shouldRenderThought("hidden")).toBe(false);
		expect(shouldRenderThought("compact")).toBe(true);
		expect(shouldRenderThought("full")).toBe(true);
	});

	it("expands thoughts by default only at full", () => {
		expect(thoughtExpandedByDefault("hidden")).toBe(false);
		expect(thoughtExpandedByDefault("compact")).toBe(false);
		expect(thoughtExpandedByDefault("full")).toBe(true);
	});
});

describe("extractToolCommand", () => {
	it("reads Cursor command (+ args) and Antigravity CommandLine", () => {
		expect(extractToolCommand({ command: "git status" })).toBe(
			"git status",
		);
		expect(
			extractToolCommand({
				command: "git",
				args: ["status", "--short"],
			}),
		).toBe("git status --short");
		expect(extractToolCommand({ CommandLine: "git status" })).toBe(
			"git status",
		);
		expect(
			extractToolCommand(normalizeRawInput(antigravityExecute.rawInput)),
		).toBe("git status");
		expect(extractToolCommand(antigravityExecute.rawInput)).toBe(
			"git status",
		);
	});
});

describe("shouldShowVerbosityControl", () => {
	it("is always shown, even without thought_level config options", () => {
		expect(shouldShowVerbosityControl([])).toBe(true);
		expect(
			shouldShowVerbosityControl([
				{
					id: "mode",
					name: "Mode",
					category: "mode",
					type: "select",
					currentValue: "ask",
					options: [{ value: "ask", name: "Ask" }],
				},
			]),
		).toBe(true);
		expect(
			shouldShowVerbosityControl([
				{
					id: "thought",
					name: "Thinking",
					category: "thought_level",
					type: "select",
					currentValue: "high",
					options: [{ value: "high", name: "High" }],
				},
			]),
		).toBe(true);
	});
});

describe("persist path is global, not per harness", () => {
	it("lives on displaySettings, not lastUsedConfigOptions", () => {
		expect(TRACE_VERBOSITY_SETTING_KEY).toBe(
			"displaySettings.traceVerbosity",
		);
		expect(TRACE_VERBOSITY_SETTING_KEY.includes("lastUsed")).toBe(false);
		expect(DEFAULT_SETTINGS.displaySettings.traceVerbosity).toBe("compact");
		expect(DEFAULT_SETTINGS.lastUsedConfigOptions).toEqual({});
	});
});

describe("Cursor vs Antigravity fixture table", () => {
	const fixtures = [
		{
			harness: "cursor",
			hasAgentThought: true,
			execute: cursorExecute,
			thinkTool,
			permission: pendingPermission,
		},
		{
			harness: "antigravity",
			hasAgentThought: false,
			execute: antigravityExecute,
			thinkTool,
			permission: pendingPermission,
		},
	] as const;

	const expectedFold = {
		hidden: { foldExecute: true, foldThinkTool: true },
		compact: { foldExecute: true, foldThinkTool: true },
		full: { foldExecute: false, foldThinkTool: false },
	} as const;

	for (const fixture of fixtures) {
		describe(fixture.harness, () => {
			for (const level of LEVELS) {
				it(`${level}: same fold/permission outcomes`, () => {
					expect(shouldRenderThought(level)).toBe(level !== "hidden");
					expect(
						shouldFoldToolDetails({
							...fixture.execute,
							verbosity: level,
						}),
					).toBe(expectedFold[level].foldExecute);
					expect(
						shouldFoldToolDetails({
							...fixture.thinkTool,
							verbosity: level,
						}),
					).toBe(expectedFold[level].foldThinkTool);
					expect(
						shouldFoldToolDetails({
							...fixture.permission,
							verbosity: level,
						}),
					).toBe(false);
				});
			}

			it("does not fold in-progress noisy tools at compact", () => {
				expect(
					shouldFoldToolDetails({
						...fixture.execute,
						status: "in_progress",
						verbosity: "compact",
					}),
				).toBe(false);
			});
		});
	}

	it("does not fold edit diffs", () => {
		for (const level of LEVELS) {
			expect(
				shouldFoldToolDetails({
					kind: "edit",
					status: "completed",
					verbosity: level,
				}),
			).toBe(false);
		}
	});
});

function readCall(
	id: string,
	overrides: Partial<ToolCallMessageContent> = {},
): ToolCallMessageContent {
	return {
		type: "tool_call",
		toolCallId: id,
		kind: "read",
		status: "completed",
		title: `Read ${id}`,
		...overrides,
	};
}

describe("shouldGroupNoisyTool", () => {
	it("groups completed noisy tools at compact and hidden", () => {
		expect(shouldGroupNoisyTool(readCall("a"), "compact")).toBe(true);
		expect(shouldGroupNoisyTool(readCall("a"), "hidden")).toBe(true);
		expect(shouldGroupNoisyTool(readCall("a"), "full")).toBe(false);
	});

	it("does not group in-progress, permission, edit, or subagent calls", () => {
		expect(
			shouldGroupNoisyTool(
				readCall("a", { status: "in_progress" }),
				"compact",
			),
		).toBe(false);
		expect(
			shouldGroupNoisyTool(
				readCall("a", {
					permissionRequest: {
						requestId: "r1",
						options: [],
						isActive: true,
					},
				}),
				"compact",
			),
		).toBe(false);
		expect(
			shouldGroupNoisyTool(readCall("a", { kind: "edit" }), "compact"),
		).toBe(false);
		expect(
			shouldGroupNoisyTool(readCall("a", { subagent: true }), "compact"),
		).toBe(false);
	});
});

describe("groupTraceContent", () => {
	it("groups consecutive same-kind noisy tools at compact", () => {
		const groups = groupTraceContent(
			[readCall("a"), readCall("b"), readCall("c")],
			"compact",
		);
		expect(groups).toEqual([
			{
				type: "noisyTools",
				kind: "read",
				items: [readCall("a"), readCall("b"), readCall("c")],
			},
		]);
	});

	it("does not group a single noisy tool", () => {
		const groups = groupTraceContent([readCall("a")], "compact");
		expect(groups).toEqual([{ type: "single", item: readCall("a") }]);
	});

	it("does not group at full", () => {
		const groups = groupTraceContent(
			[readCall("a"), readCall("b")],
			"full",
		);
		expect(groups).toEqual([
			{ type: "single", item: readCall("a") },
			{ type: "single", item: readCall("b") },
		]);
	});

	it("does not group in-progress, permission, or edit tools", () => {
		const inProgress = readCall("live", { status: "in_progress" });
		const withPermission = readCall("perm", {
			permissionRequest: {
				requestId: "r1",
				options: [],
				isActive: true,
			},
		});
		const edit = readCall("edit", { kind: "edit" });
		expect(groupTraceContent([inProgress, inProgress], "compact")).toEqual([
			{ type: "single", item: inProgress },
			{ type: "single", item: inProgress },
		]);
		expect(
			groupTraceContent([withPermission, withPermission], "compact"),
		).toEqual([
			{ type: "single", item: withPermission },
			{ type: "single", item: withPermission },
		]);
		expect(groupTraceContent([edit, edit], "compact")).toEqual([
			{ type: "single", item: edit },
			{ type: "single", item: edit },
		]);
	});

	it("keeps mixed kinds split", () => {
		const search: ToolCallMessageContent = {
			type: "tool_call",
			toolCallId: "s1",
			kind: "search",
			status: "completed",
		};
		const groups = groupTraceContent(
			[readCall("a"), search, readCall("b")],
			"compact",
		);
		expect(groups.map((g) => g.type)).toEqual([
			"single",
			"single",
			"single",
		]);
	});

	it("at hidden, collapses trace into one summary group", () => {
		const thought: MessageContent = {
			type: "agent_thought",
			text: "looking around",
		};
		const search: ToolCallMessageContent = {
			type: "tool_call",
			toolCallId: "s1",
			kind: "search",
			status: "completed",
			title: "Web Search",
		};
		const contents: MessageContent[] = [
			readCall("a"),
			thought,
			readCall("b"),
			search,
		];
		const hiddenGroups = groupTraceContent(contents, "hidden");
		expect(hiddenGroups).toEqual([
			{
				type: "hiddenTrace",
				items: [readCall("a"), thought, readCall("b"), search],
			},
		]);

		const compactGroups = groupTraceContent(contents, "compact");
		expect(compactGroups.map((g) => g.type)).toEqual([
			"single",
			"single",
			"single",
			"single",
		]);
	});

	it("at hidden, keeps edits and permission prompts visible", () => {
		const edit = readCall("edit", { kind: "edit" });
		const withPermission = readCall("perm", {
			permissionRequest: {
				requestId: "r1",
				options: [],
				isActive: true,
			},
		});
		const groups = groupTraceContent(
			[readCall("a"), edit, withPermission],
			"hidden",
		);
		expect(groups.map((g) => g.type)).toEqual([
			"hiddenTrace",
			"single",
			"single",
		]);
		if (groups[0].type === "hiddenTrace") {
			expect(groups[0].items).toEqual([readCall("a")]);
		}
		expect(isHiddenTraceItem(edit)).toBe(false);
		expect(isHiddenTraceItem(withPermission)).toBe(false);
	});
});

describe("hiddenTraceSummary", () => {
	it("builds a single-line summary for mixed tools", () => {
		const search: ToolCallMessageContent = {
			type: "tool_call",
			toolCallId: "s1",
			kind: "search",
			status: "completed",
		};
		const execute: ToolCallMessageContent = {
			type: "tool_call",
			toolCallId: "e1",
			kind: "execute",
			status: "completed",
			rawInput: { command: "git status" },
		};
		expect(
			hiddenTraceSummary([readCall("a"), readCall("b"), search, execute]),
		).toBe("Read 2 files\u2026 Searched\u2026 Ran a command");
	});

	it("uses progressive labels while tools are in flight", () => {
		const search: ToolCallMessageContent = {
			type: "tool_call",
			toolCallId: "s1",
			kind: "search",
			status: "in_progress",
		};
		expect(hiddenTraceSummary([readCall("a"), search])).toBe(
			"Read 1 file\u2026 Searching",
		);
	});
});
