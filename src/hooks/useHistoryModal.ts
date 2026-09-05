import { useRef, useCallback, useEffect } from "react";
import { Notice, Platform } from "obsidian";
import { SessionHistoryModal } from "../ui/SessionHistoryModal";
import { getLogger } from "../utils/logger";
import { convertWslPathToWindows } from "../utils/platform";
import { extractErrorMessage } from "../utils/error-utils";
import { planHistoryRestore } from "../services/session-history-restore";
import type AgentClientPlugin from "../plugin";
import type { UseAgentReturn } from "./useAgent";
import type { UseSessionHistoryReturn } from "./useSessionHistory";

interface PendingHistoryRestore {
	sessionId: string;
	cwd: string;
	agentId: string;
}

/**
 * Hook for managing the session history modal lifecycle.
 *
 * Encapsulates modal creation, props synchronization, and
 * session operation callbacks (restore, fork, delete).
 *
 * Cross-harness restore: if the saved session's agentId differs from the
 * live connection, restart under that harness first, then restore once the
 * new session is ready (avoids stale capability closures — same two-phase
 * pattern as embedded persist restore in ChatPanel).
 *
 * @param plugin - Plugin instance for app access
 * @param agent - Agent hook for clearMessages / restartSession
 * @param sessionHistory - Session history hook for operations
 * @param vaultPath - Current working directory
 * @param isSessionReady - Whether the session is ready
 * @param debugMode - Whether debug mode is enabled
 */
export function useHistoryModal(
	plugin: AgentClientPlugin,
	agent: UseAgentReturn,
	sessionHistory: UseSessionHistoryReturn,
	vaultPath: string,
	isSessionReady: boolean,
	debugMode: boolean,
	onAgentCwdChange?: (cwd: string) => void,
): {
	handleOpenHistory: () => void;
} {
	const logger = getLogger();
	const historyModalRef = useRef<SessionHistoryModal | null>(null);
	const pendingRestoreRef = useRef<PendingHistoryRestore | null>(null);

	const finishRestore = useCallback(
		async (sessionId: string, cwd: string) => {
			agent.clearMessages();
			await sessionHistory.restoreSession(sessionId, cwd);
			onAgentCwdChange?.(
				Platform.isWin ? convertWslPathToWindows(cwd) : cwd,
			);
			new Notice("[Agent Client] Session restored");
		},
		[agent.clearMessages, sessionHistory.restoreSession, onAgentCwdChange],
	);

	const handleRestoreSession = useCallback(
		async (sessionId: string, cwd: string, agentId?: string) => {
			try {
				logger.log(`[ChatPanel] Restoring session: ${sessionId}`);

				let resolvedAgentId = agentId;
				if (!resolvedAgentId) {
					const saved = plugin.settingsService
						.getSavedSessions()
						.find((s) => s.sessionId === sessionId);
					resolvedAgentId = saved?.agentId;
				}

				if (resolvedAgentId) {
					const plan = planHistoryRestore(
						{ sessionId, agentId: resolvedAgentId, cwd },
						agent.session.agentId,
					);
					if (plan.action === "restart-then-restore") {
						pendingRestoreRef.current = {
							sessionId: plan.sessionId,
							cwd: plan.cwd,
							agentId: plan.agentId,
						};
						onAgentCwdChange?.(
							Platform.isWin
								? convertWslPathToWindows(plan.cwd)
								: plan.cwd,
						);
						agent.clearMessages();
						void agent.restartSession(plan.agentId, plan.cwd);
						return;
					}
				}

				await finishRestore(sessionId, cwd);
			} catch (error) {
				pendingRestoreRef.current = null;
				const errorMessage = extractErrorMessage(error);
				new Notice(
					`[Agent Client] Failed to restore session: ${errorMessage}`,
					8000,
				);
				logger.error("Session restore error:", error);
			}
		},
		[
			logger,
			plugin.settingsService,
			agent.session.agentId,
			agent.clearMessages,
			agent.restartSession,
			finishRestore,
			onAgentCwdChange,
		],
	);

	// After a harness switch for history restore, wait until the new agent is
	// ready with matching agentId, then load (fresh restoreSession closure).
	useEffect(() => {
		const pending = pendingRestoreRef.current;
		if (!pending) return;
		if (agent.session.state === "error") {
			pendingRestoreRef.current = null;
			return;
		}
		if (!isSessionReady) return;
		if (agent.session.agentId !== pending.agentId) return;

		pendingRestoreRef.current = null;
		void (async () => {
			try {
				logger.log(
					`[ChatPanel] Completing harness restore: ${pending.sessionId}`,
				);
				await finishRestore(pending.sessionId, pending.cwd);
			} catch (error) {
				const errorMessage = extractErrorMessage(error);
				new Notice(
					`[Agent Client] Failed to restore session: ${errorMessage}`,
					8000,
				);
				logger.error("Session restore error:", error);
			}
		})();
	}, [
		isSessionReady,
		agent.session.agentId,
		agent.session.state,
		finishRestore,
		logger,
	]);

	const handleForkSession = useCallback(
		async (sessionId: string, cwd: string) => {
			try {
				logger.log(`[ChatPanel] Forking session: ${sessionId}`);
				agent.clearMessages();
				await sessionHistory.forkSession(sessionId, cwd);
				onAgentCwdChange?.(
					Platform.isWin ? convertWslPathToWindows(cwd) : cwd,
				);
				new Notice("[Agent Client] Session forked");
			} catch (error) {
				new Notice("[Agent Client] Failed to fork session");
				logger.error("Session fork error:", error);
			}
		},
		[
			logger,
			agent.clearMessages,
			sessionHistory.forkSession,
			onAgentCwdChange,
		],
	);

	const handleDeleteSession = useCallback(
		async (sessionId: string) => {
			try {
				logger.log(`[ChatPanel] Deleting session: ${sessionId}`);
				await sessionHistory.deleteSession(sessionId);
				new Notice("[Agent Client] Session deleted");
			} catch (error) {
				new Notice("[Agent Client] Failed to delete session");
				logger.error("Session delete error:", error);
			}
		},
		[sessionHistory.deleteSession, logger],
	);

	const handleEditTitle = useCallback(
		async (sessionId: string, newTitle: string, sessionCwd: string) => {
			try {
				await sessionHistory.updateSessionTitle(
					sessionId,
					newTitle,
					sessionCwd,
				);
				new Notice("[Agent Client] Title updated");
			} catch (error) {
				new Notice("[Agent Client] Failed to update title");
				logger.error("Title update error:", error);
			}
		},
		[sessionHistory.updateSessionTitle, logger],
	);

	const handleLoadMore = useCallback(() => {
		void sessionHistory.loadMoreSessions();
	}, [sessionHistory.loadMoreSessions]);

	const handleFetchSessions = useCallback(
		(cwd?: string) => {
			void sessionHistory.fetchSessions(cwd);
		},
		[sessionHistory.fetchSessions],
	);

	const handleOpenHistory = useCallback(() => {
		// Create modal if it doesn't exist
		if (!historyModalRef.current) {
			historyModalRef.current = new SessionHistoryModal(plugin.app, {
				sessions: sessionHistory.sessions,
				loading: sessionHistory.loading,
				error: sessionHistory.error,
				hasMore: sessionHistory.hasMore,
				currentCwd: vaultPath,
				canList: sessionHistory.canList,
				canRestore: sessionHistory.canRestore,
				canFork: sessionHistory.canFork,
				isUsingLocalSessions: sessionHistory.isUsingLocalSessions,
				localSessionIds: sessionHistory.localSessionIds,
				isAgentReady: isSessionReady,
				debugMode: debugMode,
				onRestoreSession: handleRestoreSession,
				onForkSession: handleForkSession,
				onDeleteSession: handleDeleteSession,
				onEditTitle: handleEditTitle,
				onLoadMore: handleLoadMore,
				onFetchSessions: handleFetchSessions,
			});
		}
		historyModalRef.current.open();
		void sessionHistory.fetchSessions(vaultPath);
	}, [
		plugin.app,
		sessionHistory.sessions,
		sessionHistory.loading,
		sessionHistory.error,
		sessionHistory.hasMore,
		sessionHistory.canList,
		sessionHistory.canRestore,
		sessionHistory.canFork,
		sessionHistory.isUsingLocalSessions,
		sessionHistory.localSessionIds,
		sessionHistory.fetchSessions,
		vaultPath,
		isSessionReady,
		debugMode,
		handleRestoreSession,
		handleForkSession,
		handleDeleteSession,
		handleEditTitle,
		handleLoadMore,
		handleFetchSessions,
	]);

	// Update modal props when session history state changes
	useEffect(() => {
		if (historyModalRef.current) {
			historyModalRef.current.updateProps({
				sessions: sessionHistory.sessions,
				loading: sessionHistory.loading,
				error: sessionHistory.error,
				hasMore: sessionHistory.hasMore,
				currentCwd: vaultPath,
				canList: sessionHistory.canList,
				canRestore: sessionHistory.canRestore,
				canFork: sessionHistory.canFork,
				isUsingLocalSessions: sessionHistory.isUsingLocalSessions,
				localSessionIds: sessionHistory.localSessionIds,
				isAgentReady: isSessionReady,
				debugMode: debugMode,
				onRestoreSession: handleRestoreSession,
				onForkSession: handleForkSession,
				onDeleteSession: handleDeleteSession,
				onEditTitle: handleEditTitle,
				onLoadMore: handleLoadMore,
				onFetchSessions: handleFetchSessions,
			});
		}
	}, [
		sessionHistory.sessions,
		sessionHistory.loading,
		sessionHistory.error,
		sessionHistory.hasMore,
		sessionHistory.canList,
		sessionHistory.canRestore,
		sessionHistory.canFork,
		sessionHistory.isUsingLocalSessions,
		sessionHistory.localSessionIds,
		vaultPath,
		isSessionReady,
		debugMode,
		handleRestoreSession,
		handleForkSession,
		handleDeleteSession,
		handleEditTitle,
		handleLoadMore,
		handleFetchSessions,
	]);

	return { handleOpenHistory };
}
