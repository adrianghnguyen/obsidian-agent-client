import { describe, expect, it } from "vitest";
import type {
	ChatMessage,
	MessageContent,
	ToolCallMessageContent,
} from "../src/types/chat";
import {
	extractContentsVaultRefs,
	extractMessageVaultRefs,
	extractMessagesVaultRefs,
	resolveVaultRefs,
	VAULT_REF_PILL_CAP,
} from "../src/utils/message-vault-refs";

function assistant(content: MessageContent[]): ChatMessage {
	return {
		id: "m1",
		role: "assistant",
		content,
		timestamp: new Date(0),
	};
}

function editTool(
	partial: Partial<ToolCallMessageContent> & { toolCallId: string },
): ToolCallMessageContent {
	return {
		type: "tool_call",
		status: "completed",
		kind: "edit",
		...partial,
	};
}

describe("extractMessageVaultRefs", () => {
	it("extracts [[target]], alias, and heading; ignores [[#anchor]] only", () => {
		const refs = extractMessageVaultRefs(
			assistant([
				{
					type: "text",
					text: "See [[Sidecar sharing]], [[Notes/tweaks|plugin tweaks]], and [[AGENTS#Setup]]. Skip [[#Heading]] only.",
				},
			]),
		);
		expect(refs.map((r) => r.linkText)).toEqual([
			"Sidecar sharing",
			"Notes/tweaks",
			"AGENTS#Setup",
		]);
		expect(refs[1].label).toBe("plugin tweaks");
		expect(refs[2].heading).toBe("Setup");
		expect(refs.every((r) => r.kind === "mentioned")).toBe(true);
	});

	it("skips wikilinks in fenced and inline code, and ![[embeds]]", () => {
		const refs = extractMessageVaultRefs(
			assistant([
				{
					type: "text",
					text: "Keep [[KeepMe]]\n```\n[[InFence]]\n```\ninline `[[InTicks]]` and ![[Embed.png]]",
				},
			]),
		);
		expect(refs.map((r) => r.label)).toEqual(["KeepMe"]);
	});

	it("includes edit/delete/move locations and diff paths; skips search/read", () => {
		const refs = extractMessageVaultRefs(
			assistant([
				{
					type: "text",
					text: "Updated [[KeepMe]] after a search.",
				},
				{
					type: "tool_call",
					toolCallId: "read-1",
					status: "completed",
					kind: "read",
					locations: [{ path: "Notes/secret.md" }],
				},
				{
					type: "tool_call",
					toolCallId: "search-1",
					status: "completed",
					kind: "search",
					locations: [
						{ path: "Notes/hit-a.md" },
						{ path: "Notes/hit-b.md" },
					],
				},
				editTool({
					toolCallId: "edit-1",
					locations: [{ path: "Notes/keep.md" }],
				}),
				{
					type: "tool_call",
					toolCallId: "del-1",
					status: "completed",
					kind: "delete",
					locations: [{ path: "Notes/gone.md" }],
				},
				{
					type: "tool_call",
					toolCallId: "mv-1",
					status: "completed",
					kind: "move",
					locations: [{ path: "Notes/moved.md" }],
				},
				{
					type: "tool_call",
					toolCallId: "diff-1",
					status: "completed",
					kind: "other",
					content: [
						{
							type: "diff",
							path: "styles.css",
							newText: "x",
						},
					],
				},
			]),
		);
		expect(refs.map((r) => r.label)).toEqual([
			"KeepMe",
			"keep",
			"gone",
			"moved",
			"styles.css",
		]);
		expect(
			refs.filter((r) => r.kind === "edited").map((r) => r.label),
		).toEqual(["keep", "gone", "moved", "styles.css"]);
	});

	it("walks nested tool calls so hidden-trace edits still contribute", () => {
		const refs = extractMessageVaultRefs(
			assistant([
				editTool({
					toolCallId: "parent",
					kind: "other",
					nestedCalls: [
						editTool({
							toolCallId: "child",
							locations: [{ path: "nested/edit.md" }],
						}),
					],
				}),
			]),
		);
		expect(refs.map((r) => r.path)).toEqual(["nested/edit.md"]);
	});

	it("dedupes by path, first-seen order, and upgrades mentioned to edited", () => {
		const refs = extractMessageVaultRefs(
			assistant([
				{
					type: "text",
					text: "[[Notes/keep.md]] then [[Notes/keep.md]] again",
				},
				editTool({
					toolCallId: "e",
					locations: [{ path: "Notes/keep.md" }],
				}),
			]),
		);
		expect(refs).toHaveLength(1);
		expect(refs[0].kind).toBe("edited");
		expect(refs[0].label).toBe("keep");
	});

	it("drops out-of-vault absolute paths and relativizes in-vault ones", () => {
		const refs = extractContentsVaultRefs(
			[
				editTool({
					toolCallId: "e",
					locations: [
						{ path: "/usr/bin/node" },
						{ path: "C:\\tmp\\out.md" },
						{ path: "/vault/Notes/in.md" },
						{ path: "https://example.com/x.md" },
					],
					content: [
						{
							type: "diff",
							path: "file:///vault/Notes/diff.md",
							newText: "y",
						},
					],
				}),
			],
			{ vaultBasePath: "/vault" },
		);
		expect(refs.map((r) => r.path)).toEqual([
			"Notes/in.md",
			"Notes/diff.md",
		]);
	});

	it("returns empty for messages with no refs", () => {
		expect(
			extractMessageVaultRefs(
				assistant([{ type: "text", text: "No links here." }]),
			),
		).toEqual([]);
	});
});

describe("extractMessagesVaultRefs + resolveVaultRefs", () => {
	it("merges several assistant messages and collapses resolved duplicates", () => {
		const a = assistant([{ type: "text", text: "[[Sidecar sharing]]" }]);
		const b = assistant([
			editTool({
				toolCallId: "e",
				locations: [{ path: "Notes/Sidecar sharing.md" }],
			}),
		]);
		const extracted = extractMessagesVaultRefs([a, b]);
		expect(extracted).toHaveLength(2);

		const resolved = resolveVaultRefs(extracted, (link) => {
			if (
				link === "Sidecar sharing" ||
				link === "Notes/Sidecar sharing.md"
			) {
				return "Notes/Sidecar sharing.md";
			}
			return undefined;
		});
		expect(resolved).toHaveLength(1);
		expect(resolved[0].kind).toBe("edited");
		expect(resolved[0].resolvedPath).toBe("Notes/Sidecar sharing.md");
	});

	it("leaves unresolved titles without a resolvedPath", () => {
		const resolved = resolveVaultRefs(
			extractMessageVaultRefs(
				assistant([{ type: "text", text: "[[Missing Note]]" }]),
			),
			() => undefined,
		);
		expect(resolved[0].resolvedPath).toBeUndefined();
		expect(resolved[0].label).toBe("Missing Note");
	});

	it("keeps the visible pill cap at 3", () => {
		expect(VAULT_REF_PILL_CAP).toBe(3);
	});
});
