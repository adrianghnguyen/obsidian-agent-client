import { homedir } from "os";
import { join } from "path";
import { readdir, readFile, stat } from "fs/promises";

/**
 * True when a tool path points at a Cursor plan document
 * (`~/.cursor/plans/*.plan.md` or any `*.plan.md`).
 */
export function isCursorPlanPath(path: string | null | undefined): boolean {
	if (!path) return false;
	const normalized = path.replace(/\\/g, "/").toLowerCase();
	return (
		normalized.endsWith(".plan.md") ||
		normalized.includes("/.cursor/plans/")
	);
}

/**
 * True when a tool call is Cursor's Create Plan tool.
 */
export function isCreatePlanTool(
	title?: string | null,
	rawInput?: { [k: string]: unknown } | null,
): boolean {
	const toolName = rawInput?._toolName;
	if (typeof toolName === "string" && toolName.toLowerCase() === "createplan") {
		return true;
	}
	if (!title) return false;
	return /^create\s*plan$/i.test(title.trim());
}

/**
 * Cursor plan files embed the ACP session id in an HTML comment at the top:
 * `<!-- <sessionId> -->`.
 */
export function planFileMatchesSession(
	content: string,
	sessionId: string,
): boolean {
	if (!sessionId) return false;
	const head = content.slice(0, 512);
	return (
		head.includes(`<!-- ${sessionId} -->`) ||
		head.includes(`<!--${sessionId}-->`)
	);
}

/**
 * Strip the session HTML comment and YAML frontmatter so the chat shows
 * the readable plan body (headings, bullets, code) rather than metadata.
 */
export function extractPlanMarkdownBody(content: string): string {
	let text = content.replace(/^\uFEFF/, "");
	text = text.replace(/^<!--[\s\S]*?-->\s*/m, "");
	const fm = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
	if (fm) {
		text = text.slice(fm[0].length);
	}
	return text.trimStart();
}

export function getCursorPlansDir(): string {
	return join(homedir(), ".cursor", "plans");
}

export interface CursorPlanFile {
	path: string;
	content: string;
}

/**
 * Find the newest Cursor plan file whose header matches `sessionId`.
 * Returns null when the directory is missing or no match is found.
 */
export async function findCursorPlanBySessionId(
	sessionId: string,
): Promise<CursorPlanFile | null> {
	if (!sessionId) return null;

	const dir = getCursorPlansDir();
	let names: string[];
	try {
		names = await readdir(dir);
	} catch {
		return null;
	}

	const matches: Array<CursorPlanFile & { mtimeMs: number }> = [];
	for (const name of names) {
		if (!name.toLowerCase().endsWith(".plan.md")) continue;
		const path = join(dir, name);
		try {
			const content = await readFile(path, "utf8");
			if (!planFileMatchesSession(content, sessionId)) continue;
			const st = await stat(path);
			matches.push({ path, content, mtimeMs: st.mtimeMs });
		} catch {
			// skip unreadable entries
		}
	}

	if (matches.length === 0) return null;
	matches.sort((a, b) => b.mtimeMs - a.mtimeMs);
	const best = matches[0];
	return { path: best.path, content: best.content };
}
