import { describe, it, expect } from "vitest";
import { DEFAULT_SETTINGS } from "../src/services/default-settings";
import { normalizeRawInput } from "../src/utils/raw-input";
import {
	DEFAULT_TRACE_VERBOSITY,
	TRACE_VERBOSITY_LEVELS,
	TRACE_VERBOSITY_SETTING_KEY,
	extractToolCommand,
	parseTraceVerbosity,
	shouldFoldToolDetails,
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
			extractToolCommand(
				normalizeRawInput(antigravityExecute.rawInput),
			),
		).toBe("git status");
		expect(
			extractToolCommand(antigravityExecute.rawInput),
		).toBe("git status");
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
		expect(DEFAULT_SETTINGS.displaySettings.traceVerbosity).toBe(
			"compact",
		);
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
					expect(shouldRenderThought(level)).toBe(
						level !== "hidden",
					);
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
