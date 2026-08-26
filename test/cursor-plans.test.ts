import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
	extractPlanMarkdownBody,
	findCursorPlanBySessionId,
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

describe("findCursorPlanBySessionId", () => {
	it("returns the newest matching plan file", async () => {
		const dir = await mkdtemp(join(tmpdir(), "cursor-plans-"));
		const sessionId = "sess-abc-123";
		try {
			await writeFile(
				join(dir, "older.plan.md"),
				`<!-- ${sessionId} -->\n# Older\n`,
				"utf8",
			);
			await new Promise((r) => setTimeout(r, 20));
			await writeFile(
				join(dir, "newer.plan.md"),
				`<!-- ${sessionId} -->\n# Newer\n`,
				"utf8",
			);
			await writeFile(
				join(dir, "other.plan.md"),
				`<!-- other-session -->\n# Other\n`,
				"utf8",
			);

			const found = await findCursorPlanBySessionId(sessionId, dir);
			expect(found?.path).toBe(join(dir, "newer.plan.md"));
			expect(found?.content).toContain("# Newer");
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});

	it("returns null when no plan matches", async () => {
		const dir = await mkdtemp(join(tmpdir(), "cursor-plans-"));
		try {
			await writeFile(
				join(dir, "x.plan.md"),
				`<!-- other -->\n# X\n`,
				"utf8",
			);
			expect(await findCursorPlanBySessionId("missing", dir)).toBeNull();
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
