import { describe, it, expect } from "vitest";
import {
	clearRangeCutoff,
	sessionsMatchingClearRange,
} from "../src/services/session-history-clear";
import type { SavedSessionInfo } from "../src/types/session";

const NOW = Date.parse("2026-09-07T12:00:00.000Z");

function row(
	sessionId: string,
	agentId: string,
	updatedAt: string,
): SavedSessionInfo {
	return {
		sessionId,
		agentId,
		cwd: "/vault",
		createdAt: updatedAt,
		updatedAt,
		title: sessionId,
	};
}

const mixed: SavedSessionInfo[] = [
	row("new-ag", "antigravity", "2026-09-07T11:50:00.000Z"),
	row("hour-cursor", "cursor", "2026-09-07T11:10:00.000Z"),
	row("week-ag", "antigravity", "2026-09-02T12:00:00.000Z"),
	row("old-cursor", "cursor", "2026-01-01T00:00:00.000Z"),
];

describe("session history clear range", () => {
	it("selects last 15 minutes across harnesses", () => {
		const ids = sessionsMatchingClearRange(mixed, "15m", NOW).map(
			(s) => s.sessionId,
		);
		expect(ids).toEqual(["new-ag"]);
	});

	it("selects last hour across harnesses", () => {
		const ids = sessionsMatchingClearRange(mixed, "1h", NOW).map(
			(s) => s.sessionId,
		);
		expect(ids.sort()).toEqual(["hour-cursor", "new-ag"]);
	});

	it("selects last 7 days across harnesses", () => {
		const ids = sessionsMatchingClearRange(mixed, "7d", NOW).map(
			(s) => s.sessionId,
		);
		expect(ids.sort()).toEqual(["hour-cursor", "new-ag", "week-ag"]);
	});

	it("selects all time", () => {
		expect(sessionsMatchingClearRange(mixed, "all", NOW)).toHaveLength(4);
		expect(clearRangeCutoff("all", NOW)).toBeNull();
	});
});
