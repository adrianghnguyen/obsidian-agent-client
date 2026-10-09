/**
 * Pure helpers for pinning Session History threads.
 *
 * Any number of sessions may be pinned, including several on the same harness.
 * Pinning one row does not unpin another.
 */

import type { SavedSessionInfo } from "../types/session";

export function isSessionPinned(
	sessions: SavedSessionInfo[],
	sessionId: string,
): boolean {
	return sessions.some((s) => s.sessionId === sessionId && s.pinned === true);
}

/**
 * Set `pinned` on the matching row only. Other pins stay.
 * No-op (returns a copy) when the session is missing.
 */
export function setPinnedSession(
	sessions: SavedSessionInfo[],
	sessionId: string,
): SavedSessionInfo[] {
	return sessions.map((s) =>
		s.sessionId === sessionId ? { ...s, pinned: true } : s,
	);
}

/**
 * Clear `pinned` on the matching row. Other pins stay.
 */
export function unpinSession(
	sessions: SavedSessionInfo[],
	sessionId: string,
): SavedSessionInfo[] {
	return sessions.map((s) => {
		if (s.sessionId !== sessionId || !s.pinned) return s;
		const next = { ...s };
		delete next.pinned;
		return next;
	});
}

/**
 * Pinned rows to reopen on the next harness start.
 * Newest activity first so restore order matches history.
 */
export function pinnedSessionsForRestore(
	sessions: SavedSessionInfo[],
): SavedSessionInfo[] {
	return sessions
		.filter((s) => s.pinned === true)
		.sort(
			(a, b) =>
				new Date(b.updatedAt).getTime() -
				new Date(a.updatedAt).getTime(),
		);
}

/** Pinned rows that are not already open or claimed for restore. */
export function selectPinnedSessionsToOpen(
	pinned: SavedSessionInfo[],
	openOrClaimedIds: Set<string>,
): SavedSessionInfo[] {
	return pinned.filter((s) => !openOrClaimedIds.has(s.sessionId));
}

/**
 * Pinned first, then newest `updatedAt`. Used by history lists.
 */
export function compareSessionsPinnedFirst(
	a: { pinned?: boolean; updatedAt?: string },
	b: { pinned?: boolean; updatedAt?: string },
): number {
	const pin = Number(b.pinned === true) - Number(a.pinned === true);
	if (pin !== 0) return pin;
	const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
	const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
	return bTime - aTime;
}
