import { Menu } from "obsidian";
import type AgentClientPlugin from "../plugin";

/**
 * Add Pin session / Unpin session to a menu.
 * Disabled until the conversation has a local history row (or create-if-missing
 * info is provided).
 */
export function addPinSessionMenuItem(
	menu: Menu,
	plugin: AgentClientPlugin,
	sessionId: string | null,
	createIfMissing?: { agentId: string; cwd: string; title?: string },
): void {
	const saved = sessionId
		? plugin.settingsService
				.getSavedSessions()
				.find((s) => s.sessionId === sessionId)
		: undefined;
	const pinned = saved?.pinned === true;
	const canPin = Boolean(sessionId && (saved || createIfMissing?.agentId));

	menu.addItem((item) => {
		item.setTitle(
			pinned
				? "Unpin session"
				: canPin
					? "Pin session"
					: "Pin session (send a message first)",
		)
			.setIcon(pinned ? "pin-off" : "pin")
			.setDisabled(!canPin)
			.onClick(() => {
				if (!sessionId || !canPin) return;
				void plugin.settingsService.setSessionPinned(
					sessionId,
					!pinned,
					createIfMissing,
				);
			});
	});
}
