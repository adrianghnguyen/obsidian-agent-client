/**
 * Extract vault notes referenced by an assistant message: `[[wikilinks]]` in
 * text plus edit/delete/move tool paths and diff paths. Pure — no React, no App.
 */

import type {
	ChatMessage,
	MessageContent,
	ToolCallMessageContent,
	ToolKind,
} from "../types/chat";
import { isAbsolutePath } from "./paths";

export type VaultRefKind = "mentioned" | "edited";

export interface MessageVaultRef {
	/** Dedup key before vault resolution (`path:…` or `link:…`). */
	key: string;
	/** Chip label (alias or file basename). */
	label: string;
	/** Text passed to `openLinkText` / `getFirstLinkpathDest`. */
	linkText: string;
	/** Vault-relative path when already known (tool / diff). */
	path?: string;
	kind: VaultRefKind;
	heading?: string;
}

export interface ResolvedVaultRef extends MessageVaultRef {
	/** Vault-relative path after lookup; undefined when unresolved. */
	resolvedPath?: string;
}

export interface ExtractVaultRefsOptions {
	/** Vault adapter base path; used to relativize absolute in-vault tool paths. */
	vaultBasePath?: string | null;
}

const EDIT_KINDS = new Set<ToolKind>(["edit", "delete", "move"]);

const WIKILINK_RE = /(?<!!)\[\[([^\]\n]+?)\]\]/g;

function stripMarkdownCode(text: string): string {
	return text.replace(/```[\s\S]*?```/g, " ").replace(/`[^`\n]+`/g, " ");
}

function normalizeSlashes(path: string): string {
	return path.replace(/\\/g, "/");
}

function stripFileUri(path: string): string {
	const trimmed = path.trim();
	if (trimmed.toLowerCase().startsWith("file://")) {
		return decodeURIComponent(trimmed.slice("file://".length));
	}
	return trimmed;
}

function fileBasename(path: string): string {
	const normalized = normalizeSlashes(path);
	const name = normalized.split("/").pop() ?? normalized;
	return name.replace(/\.md$/i, "");
}

function looksLikeVaultPath(value: string): boolean {
	const n = normalizeSlashes(value);
	return n.includes("/") || /\.[a-z0-9]+$/i.test(n);
}

function refKey(value: string, asPath: boolean): string {
	const n = normalizeSlashes(value).toLowerCase();
	if (asPath || looksLikeVaultPath(n)) return `path:${n}`;
	return `link:${n}`;
}

function parseWikilinkInner(inner: string): {
	path: string;
	heading?: string;
	alias?: string;
} | null {
	const trimmed = inner.trim();
	if (!trimmed) return null;

	let target = trimmed;
	let alias: string | undefined;
	const pipe = trimmed.indexOf("|");
	if (pipe !== -1) {
		target = trimmed.slice(0, pipe).trim();
		const aliasText = trimmed.slice(pipe + 1).trim();
		if (aliasText) alias = aliasText;
	}

	let heading: string | undefined;
	const hash = target.indexOf("#");
	if (hash !== -1) {
		heading = target.slice(hash + 1).trim() || undefined;
		target = target.slice(0, hash).trim();
	}

	if (!target) return null;

	return { path: target, heading, alias };
}

function relativizePath(
	raw: string,
	vaultBasePath?: string | null,
): string | null {
	let path = stripFileUri(raw);
	if (!path) return null;
	if (/^[a-z][a-z0-9+.-]*:/i.test(path) && !/^[A-Za-z]:[\\/]/.test(path)) {
		return null;
	}

	path = normalizeSlashes(path).replace(/^\.\//, "");

	if (vaultBasePath) {
		const base = normalizeSlashes(vaultBasePath).replace(/\/+$/, "");
		const lowerPath = path.toLowerCase();
		const lowerBase = base.toLowerCase();
		if (lowerPath === lowerBase) return null;
		if (lowerPath.startsWith(lowerBase + "/")) {
			path = path.slice(base.length + 1);
		}
	}

	if (isAbsolutePath(path)) return null;
	if (!path || path === "." || path.endsWith("/")) return null;
	return path;
}

function upsert(
	out: MessageVaultRef[],
	seen: Map<string, number>,
	ref: MessageVaultRef,
): void {
	const existing = seen.get(ref.key);
	if (existing === undefined) {
		seen.set(ref.key, out.length);
		out.push(ref);
		return;
	}
	const prev = out[existing];
	if (prev.kind !== "edited" && ref.kind === "edited") {
		out[existing] = {
			...prev,
			kind: "edited",
			path: ref.path ?? prev.path,
		};
	}
}

function addWikilinks(
	text: string,
	out: MessageVaultRef[],
	seen: Map<string, number>,
): void {
	const scan = stripMarkdownCode(text);
	WIKILINK_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = WIKILINK_RE.exec(scan)) !== null) {
		const parsed = parseWikilinkInner(match[1]);
		if (!parsed) continue;
		const linkText = parsed.heading
			? `${parsed.path}#${parsed.heading}`
			: parsed.path;
		upsert(out, seen, {
			key: refKey(parsed.path, false),
			label: parsed.alias ?? fileBasename(parsed.path),
			linkText,
			kind: "mentioned",
			heading: parsed.heading,
		});
	}
}

function addToolPath(
	raw: string,
	kind: VaultRefKind,
	out: MessageVaultRef[],
	seen: Map<string, number>,
	vaultBasePath?: string | null,
): void {
	const path = relativizePath(raw, vaultBasePath);
	if (!path) return;
	upsert(out, seen, {
		key: refKey(path, true),
		label: fileBasename(path),
		linkText: path,
		path,
		kind,
	});
}

function walkToolCall(
	tool: ToolCallMessageContent,
	out: MessageVaultRef[],
	seen: Map<string, number>,
	vaultBasePath?: string | null,
): void {
	const isEditKind = tool.kind != null && EDIT_KINDS.has(tool.kind);
	if (isEditKind) {
		for (const location of tool.locations ?? []) {
			addToolPath(location.path, "edited", out, seen, vaultBasePath);
		}
	}
	for (const block of tool.content ?? []) {
		if (block.type === "diff") {
			addToolPath(block.path, "edited", out, seen, vaultBasePath);
		}
	}
	for (const nested of tool.nestedCalls ?? []) {
		walkToolCall(nested, out, seen, vaultBasePath);
	}
}

function walkContent(
	content: MessageContent,
	out: MessageVaultRef[],
	seen: Map<string, number>,
	vaultBasePath?: string | null,
): void {
	if (content.type === "text" || content.type === "text_with_context") {
		addWikilinks(content.text, out, seen);
		return;
	}
	if (content.type === "tool_call") {
		walkToolCall(content, out, seen, vaultBasePath);
	}
}

/** Extract vault refs from a list of content blocks (one message or a whole turn). */
export function extractContentsVaultRefs(
	contents: MessageContent[],
	options: ExtractVaultRefsOptions = {},
): MessageVaultRef[] {
	const out: MessageVaultRef[] = [];
	const seen = new Map<string, number>();
	for (const content of contents) {
		walkContent(content, out, seen, options.vaultBasePath);
	}
	return out;
}

/** Extract vault refs from a single chat message. */
export function extractMessageVaultRefs(
	message: ChatMessage,
	options: ExtractVaultRefsOptions = {},
): MessageVaultRef[] {
	return extractContentsVaultRefs(message.content, options);
}

/** Extract vault refs from several messages, preserving first-seen order. */
export function extractMessagesVaultRefs(
	messages: ChatMessage[],
	options: ExtractVaultRefsOptions = {},
): MessageVaultRef[] {
	const out: MessageVaultRef[] = [];
	const seen = new Map<string, number>();
	for (const message of messages) {
		for (const ref of extractMessageVaultRefs(message, options)) {
			upsert(out, seen, ref);
		}
	}
	return out;
}

export type ResolveVaultPath = (linkText: string) => string | undefined;

/**
 * Resolve extracted refs against the vault. First-seen order is kept; two
 * refs that resolve to the same path collapse, with `edited` winning.
 */
export function resolveVaultRefs(
	refs: MessageVaultRef[],
	resolvePath: ResolveVaultPath,
): ResolvedVaultRef[] {
	const out: ResolvedVaultRef[] = [];
	const seen = new Map<string, number>();

	for (const ref of refs) {
		const resolvedPath =
			resolvePath(ref.path ?? ref.linkText) ??
			(ref.path ? resolvePath(ref.path) : undefined);
		const key = (resolvedPath ?? ref.key).toLowerCase();
		const resolved: ResolvedVaultRef = { ...ref, resolvedPath };
		const existing = seen.get(key);
		if (existing === undefined) {
			seen.set(key, out.length);
			out.push(resolved);
			continue;
		}
		const prev = out[existing];
		if (prev.kind !== "edited" && resolved.kind === "edited") {
			out[existing] = {
				...prev,
				kind: "edited",
				path: resolved.path ?? prev.path,
				resolvedPath: resolved.resolvedPath ?? prev.resolvedPath,
			};
		}
	}

	return out;
}

/** Visible pills before the `+N` overflow control. */
export const VAULT_REF_PILL_CAP = 3;
