/**
 * Pure helpers for timed Session History bulk delete.
 *
 * Delete sessions older than the selected age (updatedAt before the cutoff).
 * All time = every row, all harnesses.
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
	"15m": "Older than 15 minutes",
	"1h": "Older than 1 hour",
	"7d": "Older than 7 days",
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

/**
 * Sessions to remove: those with updatedAt strictly before the cutoff
 * (older than the selected age). All time matches every session.
 */
export function sessionsMatchingClearRange(
	sessions: SavedSessionInfo[],
	range: SessionHistoryClearRange,
	nowMs: number,
): SavedSessionInfo[] {
	const cutoff = clearRangeCutoff(range, nowMs);
	if (cutoff === null) return [...sessions];
	return sessions.filter((s) => new Date(s.updatedAt).getTime() < cutoff);
}
