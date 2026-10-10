import { describe, it, expect } from "vitest";
import type { SavedSessionInfo } from "../src/types/session";
import {
	setPinnedSession,
	unpinSession,
	pinnedSessionsForRestore,
	isSessionPinned,
	compareSessionsPinnedFirst,
	selectPinnedSessionsToOpen,
} from "../src/services/session-history-pin";
import { sessionsMatchingClearRange } from "../src/services/session-history-clear";
import { buildOpenHistoryLocalList } from "../src/services/session-history-list";
import { toHistorySessionInfos } from "../src/services/session-history-restore";

function row(
	partial: Partial<SavedSessionInfo> &
		Pick<SavedSessionInfo, "sessionId" | "agentId">,
): SavedSessionInfo {
	return {
		cwd: "/vault",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...partial,
	};
}

const alpha = row({
	sessionId: "alpha",
	agentId: "claude",
	title: "Pin demo alpha",
	updatedAt: "2026-03-01T00:00:00.000Z",
});
const bravo = row({
	sessionId: "bravo",
	agentId: "claude",
	title: "Pin demo bravo",
	updatedAt: "2026-04-01T00:00:00.000Z",
});
const other = row({
	sessionId: "other",
	agentId: "codex",
	title: "Codex chat",
	updatedAt: "2026-05-01T00:00:00.000Z",
});

describe("session history pin helpers", () => {
	it("pins any number of threads including two on the same harness", () => {
		const once = setPinnedSession([alpha, bravo, other], "alpha");
		const twice = setPinnedSession(once, "bravo");

		expect(isSessionPinned(twice, "alpha")).toBe(true);
		expect(isSessionPinned(twice, "bravo")).toBe(true);
		expect(isSessionPinned(twice, "other")).toBe(false);
		expect(pinnedSessionsForRestore(twice).map((s) => s.sessionId)).toEqual([
			"bravo",
			"alpha",
		]);
	});

	it("unpin leaves other pins in place", () => {
		const pinned = setPinnedSession(
			setPinnedSession([alpha, bravo], "alpha"),
			"bravo",
		);
		const next = unpinSession(pinned, "alpha");
		expect(isSessionPinned(next, "alpha")).toBe(false);
		expect(isSessionPinned(next, "bravo")).toBe(true);
	});

	it("sorts pinned rows first in history lists", () => {
		const listed = buildOpenHistoryLocalList(
			setPinnedSession([alpha, bravo, other], "alpha"),
		);
		expect(listed[0].sessionId).toBe("alpha");
		expect(listed[0].pinned).toBe(true);
	});

	it("skips pinned rows when clearing history", () => {
		const now = Date.parse("2026-09-07T12:00:00.000Z");
		const oldPinned = row({
			sessionId: "old-pin",
			agentId: "claude",
			updatedAt: "2026-01-01T00:00:00.000Z",
			pinned: true,
		});
		const oldFree = row({
			sessionId: "old-free",
			agentId: "claude",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		const ids = sessionsMatchingClearRange(
			[oldPinned, oldFree],
			"all",
			now,
		).map((s) => s.sessionId);
		expect(ids).toEqual(["old-free"]);
	});

	it("carries pinned onto SessionInfo rows", () => {
		const infos = toHistorySessionInfos(
			setPinnedSession([alpha], "alpha"),
		);
		expect(infos[0].pinned).toBe(true);
	});

	it("selectPinnedSessionsToOpen skips already open or claimed ids", () => {
		const pinned = pinnedSessionsForRestore(
			setPinnedSession(setPinnedSession([alpha, bravo], "alpha"), "bravo"),
		);
		expect(
			selectPinnedSessionsToOpen(pinned, new Set(["alpha"])).map(
				(s) => s.sessionId,
			),
		).toEqual(["bravo"]);
	});

	it("compareSessionsPinnedFirst prefers pin over recency", () => {
		expect(compareSessionsPinnedFirst(alpha, { ...bravo, pinned: true })).toBeGreaterThan(
			0,
		);
	});
});
