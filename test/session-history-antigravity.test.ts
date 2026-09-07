import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import type { SavedSessionInfo, SessionInfo } from "../src/types/session";
import {
	buildOpenHistoryLocalList,
	HISTORY_OPEN_FILTER_BY_VAULT_DEFAULT,
} from "../src/services/session-history-list";
import {
	mergeAgentListWithLocalHistory,
	planHistoryRestore,
} from "../src/services/session-history-restore";

const HARVEST_ID = "8c2411e0-d97b-47f0-b81a-7bfb4906e7e0";
const NOTES_FOLDER_ID = "835ceb01-1471-4bef-afa0-a98f6b88f3a4";

const fixturePath = join(
	dirname(fileURLToPath(import.meta.url)),
	"fixtures",
	"session-history-antigravity.json",
);

const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
	sandboxVaultCwd: string;
	resolveDisplayName: Record<string, string>;
	savedSessions: SavedSessionInfo[];
};

const resolveDisplayName = (agentId: string) =>
	fixture.resolveDisplayName[agentId];

describe("session history antigravity fixture", () => {
	it("includes cursor and antigravity past sessions", () => {
		const ids = new Set(fixture.savedSessions.map((s) => s.agentId));
		expect(ids.has("antigravity")).toBe(true);
		expect(ids.has("cursor")).toBe(true);
		expect(
			fixture.savedSessions.find((s) => s.sessionId === HARVEST_ID)
				?.agentId,
		).toBe("antigravity");
	});

	it("lists antigravity past sessions when opening history on the sandbox vault", () => {
		expect(HISTORY_OPEN_FILTER_BY_VAULT_DEFAULT).toBe(false);

		const listed = buildOpenHistoryLocalList(fixture.savedSessions, {
			currentCwd: fixture.sandboxVaultCwd,
		});

		const harvest = listed.find((s) => s.sessionId === HARVEST_ID);
		expect(harvest?.agentId).toBe("antigravity");
		expect(harvest?.title).toMatch(/harvest loop/i);

		const notes = listed.find((s) => s.sessionId === NOTES_FOLDER_ID);
		expect(notes?.agentId).toBe("antigravity");
		expect(notes?.cwd).toBe("C:\\Obsidian");
	});

	it("appends antigravity locals when the live agent list is cursor-only", () => {
		const cursorRow = fixture.savedSessions.find(
			(s) => s.agentId === "cursor",
		)!;
		const agentList: SessionInfo[] = [
			{
				sessionId: cursorRow.sessionId,
				cwd: cursorRow.cwd,
				title: cursorRow.title,
				updatedAt: cursorRow.updatedAt,
			},
		];

		const merged = mergeAgentListWithLocalHistory(
			agentList,
			fixture.savedSessions,
			resolveDisplayName,
			"cursor",
		);

		expect(merged.find((s) => s.sessionId === HARVEST_ID)).toMatchObject({
			agentId: "antigravity",
			agentDisplayName: "Antigravity",
			title: expect.stringMatching(/harvest loop/i),
		});
	});

	it("plans restart-then-restore from cursor onto antigravity", () => {
		const harvest = fixture.savedSessions.find(
			(s) => s.sessionId === HARVEST_ID,
		)!;
		expect(planHistoryRestore(harvest, "cursor")).toEqual({
			action: "restart-then-restore",
			sessionId: HARVEST_ID,
			cwd: harvest.cwd,
			agentId: "antigravity",
		});
	});
});
