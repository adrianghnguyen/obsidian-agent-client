/**
 * Session storage for persisting session metadata and message history.
 *
 * Handles:
 * - Session metadata CRUD (in plugin settings savedSessions array)
 * - Session message file I/O (sessions/{id}.json)
 */

import { Platform } from "obsidian";

import type { AgentClientPluginSettings } from "../plugin";
import type AgentClientPlugin from "../plugin";
import type { ChatMessage, MessageContent } from "../types/chat";
import type { SavedSessionInfo } from "../types/session";
import { convertWindowsPathToWsl } from "../utils/platform";
import { getLogger } from "../utils/logger";

// ============================================================================
// Types
// ============================================================================

/**
 * Serialized format for session message files.
 */
interface SessionMessagesFile {
	version: number;
	sessionId: string;
	agentId: string;
	messages: Array<{
		id: string;
		role: "user" | "assistant";
		content: MessageContent[];
		timestamp: string;
	}>;
	savedAt: string;
}

/**
 * Interface for settings access needed by SessionStorage.
 * Subset of SettingsService to avoid circular dependency.
 */
interface SessionStorageSettingsAccess {
	getSnapshot(): AgentClientPluginSettings;
	updateSettings(updates: Partial<AgentClientPluginSettings>): Promise<void>;
}

// ============================================================================
// Implementation
// ============================================================================

/** Maximum number of saved sessions to keep */
const MAX_SAVED_SESSIONS = 50;

export class SessionStorage {
	private plugin: AgentClientPlugin;
	private settingsAccess: SessionStorageSettingsAccess;

	/** Lock for session operations to prevent race conditions */
	private sessionLock: Promise<void> = Promise.resolve();

	constructor(
		plugin: AgentClientPlugin,
		settingsAccess: SessionStorageSettingsAccess,
	) {
		this.plugin = plugin;
		this.settingsAccess = settingsAccess;
	}

	// ============================================================
	// Session Metadata Methods
	// ============================================================

	/**
	 * Save a session to local storage.
	 *
	 * Updates existing session if sessionId matches.
	 * Maintains max 50 sessions, removing oldest when exceeded.
	 */
	async saveSession(info: SavedSessionInfo): Promise<void> {
		this.sessionLock = this.sessionLock.then(async () => {
			// Convert Windows path to WSL path if in WSL mode
			let sessionInfo = info;
			const state = this.settingsAccess.getSnapshot();
			if (Platform.isWin && state.windowsWslMode && info.cwd) {
				sessionInfo = {
					...info,
					cwd: convertWindowsPathToWsl(info.cwd),
				};
			}

			const sessions = [...(state.savedSessions || [])];

			// Embedded persist sessions dedup by the device-neutral embedId
			// ALONE: a persist block owns exactly one saved entry regardless of
			// which agent/cwd the conversation used, so a new sessionId REPLACES
			// the old one instead of accumulating (and restore can resolve the
			// row by embedId without an agent/cwd filter — #5/#11). Non-embedded
			// saves fall back to sessionId matching.
			let matchedByEmbedId = false;
			let existingIndex = -1;
			if (sessionInfo.embedId) {
				existingIndex = sessions.findIndex(
					(s) => s.embedId === sessionInfo.embedId,
				);
				matchedByEmbedId = existingIndex >= 0;
			}
			if (existingIndex < 0) {
				existingIndex = sessions.findIndex(
					(s) => s.sessionId === sessionInfo.sessionId,
				);
			}

			if (existingIndex >= 0) {
				const previousSessionId = sessions[existingIndex].sessionId;
				sessions[existingIndex] = sessionInfo;
				// When a persist block adopts a new sessionId (new conversation
				// in the same block, or an agent/cwd switch), the previous
				// transcript file is no longer referenced by any metadata row.
				// Delete it so sessions/<old>.json files don't accumulate as
				// orphans (#10). deleteSessionMessages does NOT take sessionLock,
				// so awaiting it inside this lock callback cannot deadlock
				// (mirrors deleteSession).
				if (
					matchedByEmbedId &&
					previousSessionId !== sessionInfo.sessionId
				) {
					await this.deleteSessionMessages(previousSessionId);
				}
			} else {
				sessions.unshift(sessionInfo);
				if (sessions.length > MAX_SAVED_SESSIONS) {
					sessions.pop();
				}
			}

			await this.settingsAccess.updateSettings({
				savedSessions: sessions,
			});
		});
		await this.sessionLock;
	}

	/**
	 * Get saved sessions, optionally filtered by agentId and/or cwd.
	 * Returns sessions sorted by updatedAt (newest first).
	 */
	getSavedSessions(agentId?: string, cwd?: string): SavedSessionInfo[] {
		const state = this.settingsAccess.getSnapshot();
		let sessions = state.savedSessions || [];

		if (agentId) {
			sessions = sessions.filter((s) => s.agentId === agentId);
		}
		if (cwd) {
			let filterCwd = cwd;
			if (Platform.isWin && state.windowsWslMode) {
				filterCwd = convertWindowsPathToWsl(cwd);
			}
			sessions = sessions.filter((s) => s.cwd === filterCwd);
		}

		return [...sessions].sort(
			(a, b) =>
				new Date(b.updatedAt).getTime() -
				new Date(a.updatedAt).getTime(),
		);
	}

	/**
	 * Get the saved session owned by an embedded persist block, identified by
	 * its device-neutral embedId.
	 *
	 * Unlike getSavedSessions(agentId, cwd), this resolves a persist block's
	 * conversation WITHOUT an agent/cwd filter, so an unpinned block that
	 * switched agents — or whose conversation lives under a custom
	 * "New chat in directory…" cwd — still finds its last session (#5, #11).
	 *
	 * Returns the most-recently-updated match. Going forward saveSession writes
	 * at most one row per embedId; pre-existing rows from the old (embedId,
	 * agentId, cwd) dedup may carry several — those are tolerated (not actively
	 * collapsed) and the newest wins. Returns undefined if none.
	 */
	getSavedSessionByEmbedId(embedId: string): SavedSessionInfo | undefined {
		const state = this.settingsAccess.getSnapshot();
		const matches = (state.savedSessions || []).filter(
			(s) => s.embedId === embedId,
		);
		if (matches.length === 0) return undefined;
		return matches.reduce((newest, s) =>
			new Date(s.updatedAt).getTime() >
			new Date(newest.updatedAt).getTime()
				? s
				: newest,
		);
	}

	/**
	 * Delete a saved session by sessionId.
	 * Also deletes the associated message history file.
	 */
	async deleteSession(sessionId: string): Promise<void> {
		this.sessionLock = this.sessionLock.then(async () => {
			const state = this.settingsAccess.getSnapshot();
			const sessions = (state.savedSessions || []).filter(
				(s) => s.sessionId !== sessionId,
			);
			await this.settingsAccess.updateSettings({
				savedSessions: sessions,
			});
			await this.deleteSessionMessages(sessionId);
		});
		await this.sessionLock;
	}

	/**
	 * Update the title of a saved session.
	 * If createIfMissing is provided and session doesn't exist, creates a new entry.
	 */
	async updateSessionTitle(
		sessionId: string,
		newTitle: string,
		createIfMissing?: { agentId: string; cwd: string },
	): Promise<void> {
		this.sessionLock = this.sessionLock.then(async () => {
			const state = this.settingsAccess.getSnapshot();
			const sessions = [...(state.savedSessions || [])];
			const idx = sessions.findIndex((s) => s.sessionId === sessionId);

			if (idx >= 0) {
				// Immutable update: replace the object instead of mutating it,
				// matching saveSession's pattern and keeping state objects stable.
				sessions[idx] = {
					...sessions[idx],
					title: newTitle,
					updatedAt: new Date().toISOString(),
				};
			} else if (createIfMissing) {
				sessions.unshift({
					sessionId,
					agentId: createIfMissing.agentId,
					cwd: createIfMissing.cwd,
					title: newTitle,
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				});
			} else {
				return;
			}

			await this.settingsAccess.updateSettings({
				savedSessions: sessions,
			});
		});
		await this.sessionLock;
	}

	/**
	 * Update fields of an existing saved session.
	 * Silently no-op if the session does not exist (no create).
	 * `updatedAt` is set to now unless explicitly provided in `patch`.
	 */
	async updateSession(
		sessionId: string,
		patch: Partial<Omit<SavedSessionInfo, "sessionId" | "createdAt">>,
	): Promise<void> {
		this.sessionLock = this.sessionLock.then(async () => {
			const state = this.settingsAccess.getSnapshot();
			const sessions = [...(state.savedSessions || [])];
			const idx = sessions.findIndex((s) => s.sessionId === sessionId);
			if (idx < 0) return;

			sessions[idx] = {
				...sessions[idx],
				...patch,
				updatedAt: patch.updatedAt ?? new Date().toISOString(),
			};
			await this.settingsAccess.updateSettings({
				savedSessions: sessions,
			});
		});
		await this.sessionLock;
	}

	// ============================================================
	// Session Message History Methods
	// ============================================================

	private getSessionsDir(): string {
		return `${this.plugin.app.vault.configDir}/plugins/agent-client/sessions`;
	}

	private async ensureSessionsDir(): Promise<void> {
		const adapter = this.plugin.app.vault.adapter;
		const sessionsDir = this.getSessionsDir();
		if (!(await adapter.exists(sessionsDir))) {
			await adapter.mkdir(sessionsDir);
		}
	}

	private getSessionFilePath(sessionId: string): string {
		const safeId = sessionId.replace(/[^a-zA-Z0-9_-]/g, "_");
		return `${this.getSessionsDir()}/${safeId}.json`;
	}

	/**
	 * Save message history for a session.
	 */
	async saveSessionMessages(
		sessionId: string,
		agentId: string,
		messages: ChatMessage[],
	): Promise<void> {
		await this.ensureSessionsDir();

		const serialized = messages.map((msg) => ({
			...msg,
			timestamp: msg.timestamp.toISOString(),
		}));

		const data = {
			version: 1,
			sessionId,
			agentId,
			messages: serialized,
			savedAt: new Date().toISOString(),
		};

		const filePath = this.getSessionFilePath(sessionId);
		await this.plugin.app.vault.adapter.write(
			filePath,
			JSON.stringify(data, null, 2),
		);
	}

	/**
	 * Load message history for a session.
	 * Returns null if file doesn't exist or on error.
	 */
	async loadSessionMessages(
		sessionId: string,
	): Promise<ChatMessage[] | null> {
		const filePath = this.getSessionFilePath(sessionId);
		const adapter = this.plugin.app.vault.adapter;

		if (!(await adapter.exists(filePath))) {
			return null;
		}

		try {
			const content = await adapter.read(filePath);
			const data = JSON.parse(content) as SessionMessagesFile;

			if (
				typeof data.version !== "number" ||
				!Array.isArray(data.messages)
			) {
				getLogger().debug(
					`[SessionStorage] Invalid session file structure: ${filePath}`,
				);
				return null;
			}

			if (data.version !== 1) {
				getLogger().debug(
					`[SessionStorage] Unknown session file version: ${data.version}`,
				);
				return null;
			}

			return data.messages.map((msg) => ({
				...msg,
				timestamp: new Date(msg.timestamp),
			}));
		} catch (error) {
			getLogger().error(
				`[SessionStorage] Failed to load session messages: ${error}`,
			);
			return null;
		}
	}

	/**
	 * Delete message history file for a session.
	 * Silently succeeds if file doesn't exist.
	 */
	async deleteSessionMessages(sessionId: string): Promise<void> {
		const filePath = this.getSessionFilePath(sessionId);
		const adapter = this.plugin.app.vault.adapter;

		if (await adapter.exists(filePath)) {
			await adapter.remove(filePath);
		}
	}
}
