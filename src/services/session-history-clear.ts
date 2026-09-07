/**
 * Pure helpers for timed Session History bulk delete.
 *
 * Ranges match browser "clear browsing data": delete sessions whose
 * updatedAt falls inside the window (All time = every row, all harnesses).
 */

import type { SavedSessionInfo } from "../types/session";

export type SessionHistoryClearRange = "15m" | "1h" | "7d" | "all";

const RANGE_MS: Record<Exclude<SessionHistoryClearRange, "all">, number> = {
	"15m": 15 * 60 * 1000,
	"1h": 60 * 60 * 1000,
	"7d": 7 * 24 * 60 * 60 * 1000,
};

export const SESSION_HISTORY_CLEAR_RANGE_LABELS: Record<
	SessionHistoryClearRange,
	string
> = {
	"15m": "Last 15 minutes",
	"1h": "Last hour",
	"7d": "Last 7 days",
	all: "All time",
};

/** Cutoff timestamp, or null when the range is all time. */
export function clearRangeCutoff(
	range: SessionHistoryClearRange,
	nowMs: number,
): number | null {
	if (range === "all") return null;
	return nowMs - RANGE_MS[range];
}

export function sessionsMatchingClearRange(
	sessions: SavedSessionInfo[],
	range: SessionHistoryClearRange,
	nowMs: number,
): SavedSessionInfo[] {
	const cutoff = clearRangeCutoff(range, nowMs);
	if (cutoff === null) return [...sessions];
	return sessions.filter((s) => new Date(s.updatedAt).getTime() >= cutoff);
}
