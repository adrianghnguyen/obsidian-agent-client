import { describe, it, expect } from "vitest";
import {
	discoverLocalSlashCommands,
	localSlashCommandRoots,
	mergeSlashCommands,
	normalizeCommandName,
	parseSkillMarkdown,
	slashCommandProvenanceLabel,
	type LocalSkillFs,
} from "../src/services/local-slash-commands";
import type { SlashCommand } from "../src/types/session";

class MemoryFs implements LocalSkillFs {
	constructor(private readonly files: Record<string, string>) {}

	private norm(path: string): string {
		return path.replace(/\\/g, "/").replace(/\/+$/, "");
	}

	async exists(path: string): Promise<boolean> {
		const prefix = this.norm(path);
		return Object.keys(this.files).some(
			(key) => key === prefix || key.startsWith(`${prefix}/`),
		);
	}

	async list(path: string): Promise<{ files: string[]; folders: string[] }> {
		const prefix = this.norm(path);
		const files: string[] = [];
		const folders = new Set<string>();
		for (const key of Object.keys(this.files)) {
			if (key === prefix || !key.startsWith(`${prefix}/`)) {
				continue;
			}
			const rest = key.slice(prefix.length + 1);
			const slash = rest.indexOf("/");
			if (slash === -1) {
				files.push(key);
			} else {
				folders.add(`${prefix}/${rest.slice(0, slash)}`);
			}
		}
		return { files, folders: [...folders] };
	}

	async read(path: string): Promise<string> {
		const content = this.files[this.norm(path)];
		if (content === undefined) {
			throw new Error(`missing ${path}`);
		}
		return content;
	}
}

const skill = (name: string, description: string, hint?: string): string => {
	const hintLine = hint ? `\nhint: ${hint}` : "";
	return `---\nname: ${name}\ndescription: ${description}${hintLine}\n---\n\n# body ignored\n`;
};

describe("parseSkillMarkdown", () => {
	it("reads name, description, and hint from YAML frontmatter", () => {
		const cmd = parseSkillMarkdown(
			skill("standup", "Daily standup notes", "topic"),
			"folder",
			"agents-skills",
		);
		expect(cmd).toEqual({
			name: "standup",
			description: "Daily standup notes",
			hint: "topic",
			source: "agents-skills",
		});
	});

	it("falls back to the folder basename and strips a leading slash", () => {
		const cmd = parseSkillMarkdown(
			"---\nname: /draft-pr\n---\n",
			"my-skill",
			"gemini-skills",
		);
		expect(cmd?.name).toBe("draft-pr");
		expect(cmd?.description).toBe("");
		expect(cmd?.source).toBe("gemini-skills");
	});

	it("uses the fallback name when frontmatter has no name", () => {
		const cmd = parseSkillMarkdown(
			"# just a body\n",
			"folder-skill",
			"agents-skills",
		);
		expect(cmd?.name).toBe("folder-skill");
	});
});

describe("normalizeCommandName", () => {
	it("strips leading slashes and whitespace", () => {
		expect(normalizeCommandName("  /plan  ")).toBe("plan");
	});
});

describe("slashCommandProvenanceLabel", () => {
	it("labels vault and global sources", () => {
		expect(slashCommandProvenanceLabel("agents-skills")).toBe(
			"vault skill",
		);
		expect(slashCommandProvenanceLabel("gemini-skills")).toBe(
			"vault skill",
		);
		expect(slashCommandProvenanceLabel("gemini-global")).toBe(
			"global skill",
		);
		expect(slashCommandProvenanceLabel("cursor-commands")).toBe(
			"cursor command",
		);
		expect(slashCommandProvenanceLabel("acp")).toBeNull();
	});
});

describe("localSlashCommandRoots", () => {
	it("gives Antigravity vault + optional global gemini, not cursor commands", () => {
		const roots = localSlashCommandRoots("antigravity", "/home/me");
		expect(roots.map((r) => r.path)).toEqual([
			".agents/skills",
			".gemini/skills",
			"/home/me/.gemini/skills",
		]);
		expect(roots.some((r) => r.source === "cursor-commands")).toBe(false);
	});

	it("gives Cursor commands + agents skills, not gemini skills", () => {
		const roots = localSlashCommandRoots("cursor", "/home/me");
		expect(roots.map((r) => r.source)).toEqual([
			"cursor-commands",
			"agents-skills",
		]);
	});

	it("returns no local roots for other agents", () => {
		expect(localSlashCommandRoots("claude-code-acp")).toEqual([]);
	});
});

describe("mergeSlashCommands", () => {
	it("lets ACP win on name and appends unique local commands", () => {
		const acp: SlashCommand[] = [
			{ name: "plan", description: "ACP plan", source: "acp" },
		];
		const local: SlashCommand[] = [
			{
				name: "plan",
				description: "vault plan",
				source: "agents-skills",
			},
			{
				name: "standup",
				description: "Daily notes",
				source: "agents-skills",
			},
		];
		expect(mergeSlashCommands(acp, local)).toEqual([
			{ name: "plan", description: "ACP plan", source: "acp" },
			{
				name: "standup",
				description: "Daily notes",
				source: "agents-skills",
			},
		]);
	});
});

describe("discoverLocalSlashCommands", () => {
	const vault = new MemoryFs({
		".agents/skills/standup/SKILL.md": skill(
			"standup",
			"Daily standup notes",
		),
		".gemini/skills/research/SKILL.md": skill("research", "Look things up"),
		".cursor/commands/draft-pr.md": skill("draft-pr", "Open a PR draft"),
		"Notes/standup.md": "# not a skill\n",
	});

	it("finds SKILL.md under dot-folders that getMarkdownFiles would skip", async () => {
		const cmds = await discoverLocalSlashCommands({
			agentId: "antigravity",
			vault,
		});
		expect(cmds.map((c) => c.name).sort()).toEqual(["research", "standup"]);
		expect(cmds.every((c) => c.source !== "cursor-commands")).toBe(true);
	});

	it("does not include cursor commands for Antigravity", async () => {
		const cmds = await discoverLocalSlashCommands({
			agentId: "antigravity",
			vault,
		});
		expect(cmds.some((c) => c.name === "draft-pr")).toBe(false);
	});

	it("includes cursor commands and agents skills for Cursor, not gemini", async () => {
		const cmds = await discoverLocalSlashCommands({
			agentId: "cursor",
			vault,
		});
		expect(cmds.map((c) => c.name).sort()).toEqual(["draft-pr", "standup"]);
		expect(cmds.some((c) => c.source === "gemini-skills")).toBe(false);
	});

	it("returns an empty list when roots are missing", async () => {
		const cmds = await discoverLocalSlashCommands({
			agentId: "antigravity",
			vault: new MemoryFs({}),
		});
		expect(cmds).toEqual([]);
	});

	it("includes global ~/.gemini/skills only for Antigravity", async () => {
		const host = new MemoryFs({
			"/home/me/.gemini/skills/global-one/SKILL.md": skill(
				"global-one",
				"Host skill",
			),
		});
		const forAgy = await discoverLocalSlashCommands({
			agentId: "antigravity",
			vault,
			host,
			homeDir: "/home/me",
		});
		expect(forAgy.some((c) => c.name === "global-one")).toBe(true);

		const forCursor = await discoverLocalSlashCommands({
			agentId: "cursor",
			vault,
			host,
			homeDir: "/home/me",
		});
		expect(forCursor.some((c) => c.name === "global-one")).toBe(false);
	});
});
