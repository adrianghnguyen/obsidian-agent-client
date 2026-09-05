/**
 * Pure helpers for Session History harness recall / cross-agent restore.
 *
 * SavedSessionInfo.agentId is the source of truth for which ACP harness
 * owns a conversation. History listing and restore must use it so a
 * session saved under harness A can be restored while connected to B.
 */

import type { SavedSessionInfo, SessionInfo } from "../types/session";

export type HistoryRestorePlan =
	| {
			action: "restore";
			sessionId: string;
			cwd: string;
			agentId: string;
	  }
	| {
			action: "restart-then-restore";
			sessionId: string;
			cwd: string;
			agentId: string;
	  };

export interface HistoryRestoreDeps {
	currentAgentId: string | null | undefined;
	restartSession: (agentId: string, cwd: string) => Promise<void>;
	restoreSession: (sessionId: string, cwd: string) => Promise<void>;
}

/**
 * Decide whether restore can run on the live connection or needs a
 * harness switch first.
 */
export function planHistoryRestore(
	saved: Pick<SavedSessionInfo, "sessionId" | "agentId" | "cwd">,
	currentAgentId: string | null | undefined,
): HistoryRestorePlan {
	const base = {
		sessionId: saved.sessionId,
		cwd: saved.cwd,
		agentId: saved.agentId,
	};
	if (currentAgentId && saved.agentId === currentAgentId) {
		return { action: "restore", ...base };
	}
	return { action: "restart-then-restore", ...base };
}

/**
 * Map local saved rows to SessionInfo for the history UI, including
 * harness identity for display and restore.
 */
export function toHistorySessionInfos(
	localSessions: SavedSessionInfo[],
	resolveDisplayName?: (agentId: string) => string | undefined,
): SessionInfo[] {
	return localSessions.map((s) => ({
		sessionId: s.sessionId,
		cwd: s.cwd,
		title: s.title,
		updatedAt: s.updatedAt,
		agentId: s.agentId,
		agentDisplayName: resolveDisplayName?.(s.agentId) ?? undefined,
	}));
}

/**
 * Merge agent session/list rows with local metadata, stamp agentId from
 * local matches, and append local sessions from other harnesses that the
 * live agent did not return.
 *
 * `fallbackAgentId` covers agent/list rows with no local index yet (ACP does
 * not send plugin harness ids). Prefer durable writes via
 * {@link buildHistoryActivityPatch} / saveSession when the user continues.
 */
export function mergeAgentListWithLocalHistory(
	agentSessions: SessionInfo[],
	localSessions: SavedSessionInfo[],
	resolveDisplayName?: (agentId: string) => string | undefined,
	fallbackAgentId?: string,
): SessionInfo[] {
	const localMap = new Map(localSessions.map((s) => [s.sessionId, s]));
	const seen = new Set<string>();

	const merged: SessionInfo[] = agentSessions.map((s) => {
		seen.add(s.sessionId);
		const local = localMap.get(s.sessionId);
		const agentId = local?.agentId || s.agentId || fallbackAgentId;
		return {
			...s,
			title: local?.title ?? s.title,
			agentId,
			agentDisplayName: agentId
				? (resolveDisplayName?.(agentId) ?? s.agentDisplayName)
				: s.agentDisplayName,
		};
	});

	for (const local of localSessions) {
		if (seen.has(local.sessionId)) continue;
		merged.push({
			sessionId: local.sessionId,
			cwd: local.cwd,
			title: local.title,
			updatedAt: local.updatedAt,
			agentId: local.agentId,
			agentDisplayName: resolveDisplayName?.(local.agentId),
		});
	}

	return merged;
}

/**
 * Turn-end / activity patch for savedSessions: always stamp the live harness
 * so history metadata heals agentId on next write (upstream-friendly).
 */
export function buildHistoryActivityPatch(
	agentId: string,
	now: string = new Date().toISOString(),
): Pick<SavedSessionInfo, "agentId" | "updatedAt"> {
	return { agentId, updatedAt: now };
}

/**
 * Create a minimal index row when turn-end runs before saveSessionLocally
 * (e.g. restore-from-agent then continue).
 */
export function buildMissingHistoryIndexEntry(
	sessionId: string,
	agentId: string,
	cwd: string,
	now: string = new Date().toISOString(),
): SavedSessionInfo {
	return {
		sessionId,
		agentId,
		cwd,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Execute a history restore plan against injected deps.
 * On restart-then-restore, switches harness then loads the session.
 */
export async function executeHistoryRestore(
	saved: Pick<SavedSessionInfo, "sessionId" | "agentId" | "cwd">,
	deps: HistoryRestoreDeps,
): Promise<void> {
	const plan = planHistoryRestore(saved, deps.currentAgentId);
	if (plan.action === "restart-then-restore") {
		await deps.restartSession(plan.agentId, plan.cwd);
	}
	await deps.restoreSession(plan.sessionId, plan.cwd);
}
