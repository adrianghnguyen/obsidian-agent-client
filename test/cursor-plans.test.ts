import { describe, it, expect } from "vitest";
import {
	extractPlanMarkdownBody,
	isCreatePlanTool,
	isCursorPlanPath,
	planFileMatchesSession,
} from "../src/utils/cursor-plans";

describe("isCursorPlanPath", () => {
	it("matches .plan.md and .cursor/plans paths", () => {
		expect(
			isCursorPlanPath(
				"C:\\Users\\me\\.cursor\\plans\\Foo-abc.plan.md",
			),
		).toBe(true);
		expect(isCursorPlanPath("/home/me/.cursor/plans/x.plan.md")).toBe(
			true,
		);
		expect(isCursorPlanPath("notes/todo.plan.md")).toBe(true);
	});

	it("rejects unrelated paths", () => {
		expect(isCursorPlanPath("README.md")).toBe(false);
		expect(isCursorPlanPath(null)).toBe(false);
		expect(isCursorPlanPath("")).toBe(false);
	});
});

describe("isCreatePlanTool", () => {
	it("matches title and rawInput tool name", () => {
		expect(isCreatePlanTool("Create Plan", null)).toBe(true);
		expect(isCreatePlanTool("create plan", { _toolName: "other" })).toBe(
			true,
		);
		expect(isCreatePlanTool("Edit File", { _toolName: "createPlan" })).toBe(
			true,
		);
		expect(isCreatePlanTool("Edit File", { _toolName: "edit" })).toBe(
			false,
		);
	});
});

describe("planFileMatchesSession", () => {
	it("matches the HTML session comment", () => {
		const id = "e734060e-d429-413c-8ea0-a217e96edcd4";
		expect(
			planFileMatchesSession(`<!-- ${id} -->\n---\ntodos: []\n---\n# Hi`, id),
		).toBe(true);
		expect(planFileMatchesSession(`<!--${id}-->\n# Hi`, id)).toBe(true);
		expect(planFileMatchesSession(`<!-- other -->\n# Hi`, id)).toBe(false);
	});
});

describe("extractPlanMarkdownBody", () => {
	it("strips session comment and YAML frontmatter", () => {
		const raw = `<!-- abc-123 -->
---
todos:
  - id: one
    content: Do thing
    status: pending
isProject: false
---
# Title

Body paragraph.
`;
		expect(extractPlanMarkdownBody(raw)).toBe("# Title\n\nBody paragraph.\n");
	});

	it("returns content unchanged when there is no frontmatter", () => {
		expect(extractPlanMarkdownBody("# Just a heading\n")).toBe(
			"# Just a heading\n",
		);
	});
});
