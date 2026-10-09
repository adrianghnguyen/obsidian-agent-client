/**
 * Functional: session index, transcript files, and history restore.
 * Real SessionStorage plus the restore plan. No Obsidian vault.
 */
import { describe, it, expect } from "vitest";
import type { ChatMessage } from "../../src/types/chat";
import type { SavedSessionInfo, SessionInfo } from "../../src/types/session";
import { computeSessionTitle } from "../../src/services/session-helpers";
import {
	buildHistoryActivityPatch,
	executeHistoryRestore,
	mergeAgentListWithLocalHistory,
} from "../../src/services/session-history-restore";
import { createMemorySessionStore } from "./memory-session-store";

function row(
	partial: Partial<SavedSessionInfo> & Pick<SavedSessionInfo, "sessionId">,
): SavedSessionInfo {
	return {
		agentId: "cursor",
		cwd: "/vault",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...partial,
	};
}

function userMessage(text: string): ChatMessage {
	return {
		id: "m1",
		role: "user",
		content: [{ type: "text", text }],
		timestamp: new Date("2026-01-02T00:00:00.000Z"),
	};
}

describe("session history restore", () => {
	it("loads the saved transcript after a cross-harness restore", async () => {
		const { storage } = createMemorySessionStore();
		const saved = row({
			sessionId: "sess-claude",
			agentId: "claude-code-acp",
			cwd: "/vault/notes",
			title: "Rename later",
			updatedAt: "2026-04-01T00:00:00.000Z",
		});
		await storage.saveSession(saved);
		await storage.saveSessionMessages("sess-claude", "claude-code-acp", [
			userMessage("remember this"),
		]);

		const calls: string[] = [];
		let loaded: ChatMessage[] | null = null;
		await executeHistoryRestore(saved, {
			currentAgentId: "cursor",
			restartSession: async (agentId, cwd) => {
				calls.push(`restart:${agentId}:${cwd}`);
			},
			restoreSession: async (sessionId, cwd) => {
				calls.push(`restore:${sessionId}:${cwd}`);
				loaded = await storage.loadSessionMessages(sessionId);
			},
		});

		expect(calls).toEqual([
			"restart:claude-code-acp:/vault/notes",
			"restore:sess-claude:/vault/notes",
		]);
		expect(loaded?.[0].content).toEqual([
			{ type: "text", text: "remember this" },
		]);
		expect(computeSessionTitle("sess-claude", [saved], loaded ?? [])).toBe(
			"Rename later",
		);

		calls.length = 0;
		await executeHistoryRestore(saved, {
			currentAgentId: "claude-code-acp",
			restartSession: async () => {
				calls.push("restart");
			},
			restoreSession: async () => {
				calls.push("restore");
			},
		});
		expect(calls).toEqual(["restore"]);
	});

	it("merges another harness into history and heals agentId on the next write", async () => {
		const { storage, state } = createMemorySessionStore();
		await storage.saveSession(
			row({
				sessionId: "local-codex",
				agentId: "codex",
				title: "Codex thread",
				updatedAt: "2026-05-02T00:00:00.000Z",
			}),
		);
		await storage.saveSession(
			row({
				sessionId: "live-cursor",
				agentId: "old-id",
				title: "Cursor thread",
				updatedAt: "2026-05-01T00:00:00.000Z",
			}),
		);

		const agentSessions: SessionInfo[] = [
			{
				sessionId: "live-cursor",
				cwd: "/vault",
				title: "from the agent",
				updatedAt: "2026-05-01T00:00:00.000Z",
			},
		];
		const merged = mergeAgentListWithLocalHistory(
			agentSessions,
			state.savedSessions,
			(id) => (id === "codex" ? "Codex" : "Cursor"),
			"cursor",
		);
		expect(merged.map((session) => session.sessionId)).toEqual([
			"local-codex",
			"live-cursor",
		]);
		expect(merged[0].agentDisplayName).toBe("Codex");
		expect(merged[1].title).toBe("Cursor thread");

		await storage.updateSession(
			"live-cursor",
			buildHistoryActivityPatch("cursor", "2026-05-03T00:00:00.000Z"),
		);
		const healed = storage
			.getSavedSessions()
			.find((session) => session.sessionId === "live-cursor");
		expect(healed?.agentId).toBe("cursor");
		expect(healed?.updatedAt).toBe("2026-05-03T00:00:00.000Z");
	});

	it("keeps an evicted transcript file and deletes files on history clear", async () => {
		const { storage } = createMemorySessionStore();
		await storage.saveSession(
			row({
				sessionId: "s-0",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		await storage.saveSessionMessages("s-0", "cursor", [
			userMessage("archived"),
		]);

		for (let i = 1; i <= 50; i++) {
			await storage.saveSession(
				row({
					sessionId: `s-${i}`,
					updatedAt: `2026-03-01T00:${String(i).padStart(2, "0")}:00.000Z`,
				}),
			);
		}

		expect(
			storage.getSavedSessions().map((session) => session.sessionId),
		).not.toContain("s-0");
		expect(storage.getSavedSessions()).toHaveLength(50);
		expect(
			(await storage.loadSessionMessages("s-0"))?.[0].content,
		).toEqual([{ type: "text", text: "archived" }]);

		const { storage: clearStore } = createMemorySessionStore();
		await clearStore.saveSession(
			row({
				sessionId: "old",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		await clearStore.saveSessionMessages("old", "cursor", [
			userMessage("gone"),
		]);
		await clearStore.saveSession(
			row({
				sessionId: "fresh",
				updatedAt: "2026-06-01T00:00:00.000Z",
			}),
		);
		await clearStore.saveSessionMessages("fresh", "cursor", [
			userMessage("keep"),
		]);
		const now = Date.parse("2026-06-01T00:00:00.000Z");
		expect(await clearStore.deleteSessionsInRange("15m", now)).toBe(1);
		expect(
			clearStore.getSavedSessions().map((session) => session.sessionId),
		).toEqual(["fresh"]);
		expect(await clearStore.loadSessionMessages("old")).toBeNull();
		expect(
			(await clearStore.loadSessionMessages("fresh"))?.[0].content,
		).toEqual([{ type: "text", text: "keep" }]);
	});

	it("resolves an embed by newest activity and ignores a rename", async () => {
		const { storage } = createMemorySessionStore();
		await storage.saveSession(
			row({
				sessionId: "old-embed",
				agentId: "claude-code-acp",
				embedId: "block-a",
				cwd: "/other",
				updatedAt: "2026-03-01T00:00:00.000Z",
			}),
		);
		await storage.saveSession(
			row({
				sessionId: "new-embed",
				agentId: "cursor",
				embedId: "block-a",
				updatedAt: "2026-03-02T00:00:00.000Z",
			}),
		);
		await storage.saveSessionMessages("old-embed", "claude-code-acp", [
			userMessage("old body"),
		]);

		await storage.updateSessionTitle("old-embed", "Renamed");
		const newest = storage.getSavedSessionByEmbedId("block-a");
		expect(newest?.sessionId).toBe("new-embed");
		expect(
			storage
				.getSavedSessions()
				.find((session) => session.sessionId === "old-embed")?.updatedAt,
		).toBe("2026-03-01T00:00:00.000Z");

		const raw = await storage.loadSessionMessages("old-embed");
		expect(raw?.[0].content).toEqual([{ type: "text", text: "old body" }]);
	});
});
