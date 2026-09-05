/**
 * Palette command registration for Agent Client (agent switch, permissions,
 * session mode, broadcast). Called from plugin onload; addCommand stays on Plugin.
 */

import { Notice } from "obsidian";
import type AgentClientPlugin from "../plugin";
import {
	getAllAgentsFromSettings,
	findAgentSettings,
	isAgentEnabled,
} from "../services/session-helpers";

export function registerAgentCommands(plugin: AgentClientPlugin): void {
	for (const agent of getAllAgentsFromSettings(plugin.settings)) {
		plugin.addCommand({
			id: `switch-agent-to-${agent.id}`,
			name: `Switch agent to ${agent.displayName}`,
			checkCallback: (checking) => {
				const found = findAgentSettings(plugin.settings, agent.id);
				if (!found || !isAgentEnabled(found)) return false;
				if (checking) return true;
				plugin.app.workspace.trigger(
					"agent-client:new-chat-requested",
					plugin.lastActiveChatViewId,
					agent.id,
				);
			},
		});
	}
}

export function registerPermissionCommands(plugin: AgentClientPlugin): void {
	plugin.addCommand({
		id: "approve-active-permission",
		name: "Approve active permission",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:approve-active-permission",
				plugin.lastActiveChatViewId,
			);
		},
	});

	plugin.addCommand({
		id: "reject-active-permission",
		name: "Reject active permission",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:reject-active-permission",
				plugin.lastActiveChatViewId,
			);
		},
	});

	plugin.addCommand({
		id: "toggle-auto-mention",
		name: "Toggle auto-mention",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:toggle-auto-mention",
				plugin.lastActiveChatViewId,
			);
		},
	});

	plugin.addCommand({
		id: "new-chat",
		name: "New chat",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:new-chat-requested",
				plugin.lastActiveChatViewId,
			);
		},
	});

	plugin.addCommand({
		id: "cancel-current-message",
		name: "Cancel current message",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:cancel-message",
				plugin.lastActiveChatViewId,
			);
		},
	});

	plugin.addCommand({
		id: "export-chat",
		name: "Export chat",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:export-chat",
				plugin.lastActiveChatViewId,
			);
		},
	});
}

export function registerSessionModeCommands(plugin: AgentClientPlugin): void {
	plugin.addCommand({
		id: "cycle-session-mode",
		name: "Cycle session mode",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:cycle-session-mode",
				plugin.lastActiveChatViewId,
			);
		},
	});

	plugin.addCommand({
		id: "switch-session-mode",
		name: "Switch session mode",
		callback: () => {
			plugin.app.workspace.trigger(
				"agent-client:switch-session-mode",
				plugin.lastActiveChatViewId,
			);
		},
	});
}

export function registerBroadcastCommands(plugin: AgentClientPlugin): void {
	plugin.addCommand({
		id: "broadcast-prompt",
		name: "Broadcast prompt",
		callback: () => {
			broadcastPrompt(plugin);
		},
	});

	plugin.addCommand({
		id: "broadcast-send",
		name: "Broadcast send",
		callback: () => {
			void broadcastSend(plugin);
		},
	});

	plugin.addCommand({
		id: "broadcast-cancel",
		name: "Broadcast cancel",
		callback: () => {
			void broadcastCancel(plugin);
		},
	});
}

export function registerSessionScopedCommands(plugin: AgentClientPlugin): void {
	registerAgentCommands(plugin);
	registerPermissionCommands(plugin);
	registerSessionModeCommands(plugin);
	registerBroadcastCommands(plugin);
}

function broadcastPrompt(plugin: AgentClientPlugin): void {
	const allViews = plugin.viewRegistry.getAll();
	if (allViews.length === 0) {
		new Notice("[Agent Client] No chat views open");
		return;
	}

	const inputState = plugin.viewRegistry.toFocused((v) => v.getInputState());
	if (
		!inputState ||
		(inputState.text.trim() === "" && inputState.files.length === 0)
	) {
		new Notice("[Agent Client] No prompt to broadcast");
		return;
	}

	const focusedId = plugin.viewRegistry.getFocusedId();
	const targetViews = allViews.filter((v) => v.viewId !== focusedId);
	if (targetViews.length === 0) {
		new Notice("[Agent Client] No other chat views to broadcast to");
		return;
	}

	for (const view of targetViews) {
		view.setInputState(inputState);
	}
}

async function broadcastSend(plugin: AgentClientPlugin): Promise<void> {
	const allViews = plugin.viewRegistry.getAll();
	if (allViews.length === 0) {
		new Notice("[Agent Client] No chat views open");
		return;
	}

	const sendableViews = allViews.filter((v) => v.canSend());
	if (sendableViews.length === 0) {
		new Notice("[Agent Client] No views ready to send");
		return;
	}

	await Promise.allSettled(sendableViews.map((v) => v.sendMessage()));
}

async function broadcastCancel(plugin: AgentClientPlugin): Promise<void> {
	const allViews = plugin.viewRegistry.getAll();
	if (allViews.length === 0) {
		new Notice("[Agent Client] No chat views open");
		return;
	}

	await Promise.allSettled(allViews.map((v) => v.cancelOperation()));
	new Notice("[Agent Client] Cancel broadcast to all views");
}
