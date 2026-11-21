/**
 * Local slash-command discovery for vault / host skill files.
 *
 * ACP `available_commands_update` stays the session source of truth.
 * This module only scans disk and merges for the composer autocomplete.
 */

import { parseYaml } from "obsidian";
import { access, readdir, readFile } from "fs/promises";
import { constants } from "fs";
import { homedir } from "os";
import { join } from "path";
import { ANTIGRAVITY_PRESET_ID } from "../harnesses/antigravity/paths";
import { CURSOR_PRESET_ID } from "../harnesses/cursor/preset";
import type { SlashCommand, SlashCommandSource } from "../types/session";

export interface LocalSkillFs {
	exists(path: string): Promise<boolean>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	read(path: string): Promise<string>;
}

export interface DiscoverLocalSlashCommandsInput {
	agentId: string;
	vault: LocalSkillFs;
	/** Host filesystem for `~/.gemini/skills`. Omit to skip global scan. */
	host?: LocalSkillFs;
	homeDir?: string;
}

type LocalRootKind = "vault-skills" | "vault-commands" | "host-skills";

interface LocalRoot {
	kind: LocalRootKind;
	path: string;
	source: SlashCommandSource;
}

const SKILL_BASENAME = "skill.md";

export function adaptVaultAdapter(adapter: {
	exists(path: string, sensitive?: boolean): Promise<boolean>;
	list(path: string): Promise<{ files: string[]; folders: string[] }>;
	read(path: string): Promise<string>;
}): LocalSkillFs {
	return {
		exists: (path) => adapter.exists(path),
		list: (path) => adapter.list(path),
		read: (path) => adapter.read(path),
	};
}

export function createNodeHostFs(): LocalSkillFs {
	return {
		async exists(path) {
			try {
				await access(path, constants.F_OK);
				return true;
			} catch {
				return false;
			}
		},
		async list(path) {
			const entries = await readdir(path, { withFileTypes: true });
			const files: string[] = [];
			const folders: string[] = [];
			for (const entry of entries) {
				const full = join(path, entry.name);
				if (entry.isDirectory()) {
					folders.push(full);
				} else {
					files.push(full);
				}
			}
			return { files, folders };
		},
		async read(path) {
			return readFile(path, "utf8");
		},
	};
}

export function localSlashCommandRoots(
	agentId: string,
	homeDir?: string,
): LocalRoot[] {
	if (agentId === ANTIGRAVITY_PRESET_ID) {
		const roots: LocalRoot[] = [
			{
				kind: "vault-skills",
				path: ".agents/skills",
				source: "agents-skills",
			},
			{
				kind: "vault-skills",
				path: ".gemini/skills",
				source: "gemini-skills",
			},
		];
		if (homeDir) {
			roots.push({
				kind: "host-skills",
				path: join(homeDir, ".gemini", "skills"),
				source: "gemini-global",
			});
		}
		return roots;
	}
	if (agentId === CURSOR_PRESET_ID) {
		return [
			{
				kind: "vault-commands",
				path: ".cursor/commands",
				source: "cursor-commands",
			},
			{
				kind: "vault-skills",
				path: ".agents/skills",
				source: "agents-skills",
			},
		];
	}
	return [];
}

export function slashCommandProvenanceLabel(
	source?: SlashCommandSource,
): string | null {
	switch (source) {
		case "agents-skills":
		case "gemini-skills":
			return "vault skill";
		case "gemini-global":
			return "global skill";
		case "cursor-commands":
			return "cursor command";
		default:
			return null;
	}
}

export function normalizeCommandName(raw: string): string {
	return raw.trim().replace(/^\/+/, "").trim();
}

export function parseSkillMarkdown(
	content: string,
	fallbackName: string,
	source: SlashCommandSource,
): SlashCommand | null {
	const fields = parseFrontmatter(content);
	const name = normalizeCommandName(asString(fields.name) || fallbackName);
	if (!name) {
		return null;
	}
	const description = asString(fields.description) ?? "";
	const hint = asString(fields.hint) ?? null;
	return { name, description, hint, source };
}

export function mergeSlashCommands(
	acpCommands: SlashCommand[] | undefined,
	localCommands: SlashCommand[],
): SlashCommand[] {
	const merged: SlashCommand[] = [];
	const seen = new Set<string>();
	for (const cmd of acpCommands ?? []) {
		if (!cmd.name || seen.has(cmd.name)) {
			continue;
		}
		seen.add(cmd.name);
		merged.push(cmd.source ? cmd : { ...cmd, source: "acp" });
	}
	for (const cmd of localCommands) {
		if (!cmd.name || seen.has(cmd.name)) {
			continue;
		}
		seen.add(cmd.name);
		merged.push(cmd);
	}
	return merged;
}

export async function discoverLocalSlashCommands(
	input: DiscoverLocalSlashCommandsInput,
): Promise<SlashCommand[]> {
	const home = input.homeDir ?? (input.host ? homedir() : undefined);
	const roots = localSlashCommandRoots(input.agentId, home);
	const collected: SlashCommand[] = [];
	const seen = new Set<string>();

	for (const root of roots) {
		const fs = root.kind === "host-skills" ? input.host : input.vault;
		if (!fs) {
			continue;
		}
		const found =
			root.kind === "vault-commands"
				? await scanCommandFiles(fs, root.path, root.source)
				: await scanSkillFolders(fs, root.path, root.source);
		for (const cmd of found) {
			if (seen.has(cmd.name)) {
				continue;
			}
			seen.add(cmd.name);
			collected.push(cmd);
		}
	}

	return collected;
}

function parseFrontmatter(content: string): Record<string, unknown> {
	const text = content.replace(/^\uFEFF/, "");
	const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
	if (!match) {
		return {};
	}
	try {
		const parsed: unknown = parseYaml(match[1]);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as Record<string, unknown>;
		}
	} catch {
		/* ignore invalid YAML */
	}
	return {};
}

function asString(value: unknown): string | undefined {
	if (typeof value !== "string") {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function pathBasename(path: string): string {
	const normalized = path.replace(/\\/g, "/");
	const slash = normalized.lastIndexOf("/");
	return slash >= 0 ? normalized.slice(slash + 1) : normalized;
}

function joinDir(dir: string, name: string): string {
	const entry = name.replace(/\\/g, "/");
	if (entry.includes("/")) {
		return name;
	}
	const base = dir.replace(/[\\/]+$/, "");
	if (!base) {
		return name;
	}
	const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
	return `${base}${sep}${name}`;
}

function isSkillMarkdown(path: string): boolean {
	return pathBasename(path).toLowerCase() === SKILL_BASENAME;
}

function isMarkdownFile(path: string): boolean {
	return pathBasename(path).toLowerCase().endsWith(".md");
}

async function safeList(
	fs: LocalSkillFs,
	path: string,
): Promise<{ files: string[]; folders: string[] }> {
	try {
		if (!(await fs.exists(path))) {
			return { files: [], folders: [] };
		}
		return await fs.list(path);
	} catch {
		return { files: [], folders: [] };
	}
}

async function scanSkillFolders(
	fs: LocalSkillFs,
	root: string,
	source: SlashCommandSource,
): Promise<SlashCommand[]> {
	const listed = await safeList(fs, root);
	const commands: SlashCommand[] = [];

	for (const folder of listed.folders) {
		const inner = await safeList(fs, folder);
		const skillFile = inner.files.find(isSkillMarkdown);
		if (!skillFile) {
			continue;
		}
		const cmd = await readSkillFile(
			fs,
			skillFile,
			pathBasename(folder),
			source,
		);
		if (cmd) {
			commands.push(cmd);
		}
	}

	/* Adapter implementations that return names instead of full paths. */
	if (listed.folders.length === 0) {
		const direct = listed.files.find(isSkillMarkdown);
		if (direct) {
			const cmd = await readSkillFile(
				fs,
				joinDir(root, direct),
				pathBasename(root),
				source,
			);
			if (cmd) {
				commands.push(cmd);
			}
		}
	}

	return commands;
}

async function scanCommandFiles(
	fs: LocalSkillFs,
	root: string,
	source: SlashCommandSource,
): Promise<SlashCommand[]> {
	const listed = await safeList(fs, root);
	const commands: SlashCommand[] = [];
	for (const file of listed.files) {
		if (!isMarkdownFile(file)) {
			continue;
		}
		const fallback = pathBasename(file).replace(/\.md$/i, "");
		const cmd = await readSkillFile(
			fs,
			joinDir(root, file),
			fallback,
			source,
		);
		if (cmd) {
			commands.push(cmd);
		}
	}
	return commands;
}

async function readSkillFile(
	fs: LocalSkillFs,
	path: string,
	fallbackName: string,
	source: SlashCommandSource,
): Promise<SlashCommand | null> {
	try {
		const content = await fs.read(path);
		return parseSkillMarkdown(content, fallbackName, source);
	} catch {
		return null;
	}
}
