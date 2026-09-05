import { describe, it, expect, vi } from "vitest";
import type { SavedSessionInfo, SessionInfo } from "../src/types/session";
import {
	planHistoryRestore,
	toHistorySessionInfos,
	mergeAgentListWithLocalHistory,
	executeHistoryRestore,
} from "../src/services/session-history-restore";

const CWD = "/vault";

function makeSaved(
	partial: Partial<SavedSessionInfo> &
		Pick<SavedSessionInfo, "sessionId" | "agentId">,
): SavedSessionInfo {
	return {
		cwd: CWD,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...partial,
	};
}

/** Two harness fixtures — same cwd, distinct sessions. */
const harnessA = makeSaved({
	sessionId: "sess-a",
	agentId: "harness-a",
	title: "Claude conversation",
	updatedAt: "2026-02-01T00:00:00.000Z",
});

const harnessB = makeSaved({
	sessionId: "sess-b",
	agentId: "harness-b",
	title: "Codex conversation",
	updatedAt: "2026-03-01T00:00:00.000Z",
});

const displayNames: Record<string, string> = {
	"harness-a": "Harness A",
	"harness-b": "Harness B",
};

const resolveDisplayName = (agentId: string) => displayNames[agentId];

describe("session history harness recall", () => {
	describe("toHistorySessionInfos", () => {
		it("includes agentId for both harness fixtures", () => {
			const infos = toHistorySessionInfos(
				[harnessA, harnessB],
				resolveDisplayName,
			);

			expect(infos).toHaveLength(2);
			expect(infos.map((s) => s.agentId).sort()).toEqual([
				"harness-a",
				"harness-b",
			]);
			expect(infos.find((s) => s.agentId === "harness-a")?.agentDisplayName).toBe(
				"Harness A",
			);
			expect(infos.find((s) => s.agentId === "harness-b")?.agentDisplayName).toBe(
				"Harness B",
			);
		});
	});

	describe("planHistoryRestore", () => {
		it("plans restart-then-restore when target harness differs", () => {
			const plan = planHistoryRestore(harnessB, "harness-a");
			expect(plan).toEqual({
				action: "restart-then-restore",
				sessionId: "sess-b",
				cwd: CWD,
				agentId: "harness-b",
			});
		});

		it("plans restore-only when already on the target harness", () => {
			const plan = planHistoryRestore(harnessA, "harness-a");
			expect(plan).toEqual({
				action: "restore",
				sessionId: "sess-a",
				cwd: CWD,
				agentId: "harness-a",
			});
		});
	});

	describe("mergeAgentListWithLocalHistory", () => {
		it("stamps agentId from local meta and appends other harness sessions", () => {
			const agentList: SessionInfo[] = [
				{
					sessionId: "sess-a",
					cwd: CWD,
					title: "Agent list title",
					updatedAt: harnessA.updatedAt,
				},
			];

			const merged = mergeAgentListWithLocalHistory(
				agentList,
				[harnessA, harnessB],
				resolveDisplayName,
			);

			expect(merged.find((s) => s.sessionId === "sess-a")?.agentId).toBe(
				"harness-a",
			);
			expect(merged.find((s) => s.sessionId === "sess-a")?.title).toBe(
				"Claude conversation",
			);
			const other = merged.find((s) => s.sessionId === "sess-b");
			expect(other).toMatchObject({
				agentId: "harness-b",
				agentDisplayName: "Harness B",
				title: "Codex conversation",
				cwd: CWD,
			});
		});
	});

	describe("executeHistoryRestore smoke", () => {
		it("restores both harness sessions without failure (switch when needed)", async () => {
			const calls: string[] = [];
			let currentAgentId = "harness-a";

			const restartSession = vi.fn(async (agentId: string, cwd: string) => {
				calls.push(`restart:${agentId}:${cwd}`);
				currentAgentId = agentId;
			});
			const restoreSession = vi.fn(async (sessionId: string, cwd: string) => {
				calls.push(`restore:${sessionId}:${cwd}`);
			});

			// Connected to A → restore B (must restart)
			await executeHistoryRestore(harnessB, {
				get currentAgentId() {
					return currentAgentId;
				},
				restartSession,
				restoreSession,
			});

			// Connected to B → restore A (must restart)
			await executeHistoryRestore(harnessA, {
				get currentAgentId() {
					return currentAgentId;
				},
				restartSession,
				restoreSession,
			});

			expect(calls).toEqual([
				`restart:harness-b:${CWD}`,
				`restore:sess-b:${CWD}`,
				`restart:harness-a:${CWD}`,
				`restore:sess-a:${CWD}`,
			]);
			expect(restartSession).toHaveBeenCalledTimes(2);
			expect(restoreSession).toHaveBeenCalledTimes(2);
		});

		it("does not restart when restoring the current harness", async () => {
			const restartSession = vi.fn(async () => {});
			const restoreSession = vi.fn(async () => {});

			await executeHistoryRestore(harnessA, {
				currentAgentId: "harness-a",
				restartSession,
				restoreSession,
			});

			expect(restartSession).not.toHaveBeenCalled();
			expect(restoreSession).toHaveBeenCalledWith("sess-a", CWD);
		});
	});
});
