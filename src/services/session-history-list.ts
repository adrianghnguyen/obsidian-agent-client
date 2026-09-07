/**
 * Pure helpers for Session History listing (all local harnesses).
 *
 * Opening history must not drop other-cwd / other-agent rows by default.
 */

import type { SavedSessionInfo } from "../types/session";

/**
 * Default for "Show current vault only" when the history modal opens.
 * False = list every local session across harnesses and cwds.
 */
export const HISTORY_OPEN_FILTER_BY_VAULT_DEFAULT = false;

export function sortSavedSessionsByUpdatedAt(
	sessions: SavedSessionInfo[],
): SavedSessionInfo[] {
	return [...sessions].sort(
		(a, b) =>
			new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
	);
}

/**
 * Local index rows shown when Session History opens (or when the vault
 * filter checkbox changes).
 */
export function buildOpenHistoryLocalList(
	sessions: SavedSessionInfo[],
	options?: {
		filterByCurrentVault?: boolean;
		currentCwd?: string;
	},
): SavedSessionInfo[] {
	const filterByVault =
		options?.filterByCurrentVault ?? HISTORY_OPEN_FILTER_BY_VAULT_DEFAULT;
	const cwd = options?.currentCwd;
	let listed = sessions;
	if (filterByVault && cwd) {
		listed = listed.filter((s) => s.cwd === cwd);
	}
	return sortSavedSessionsByUpdatedAt(listed);
}
