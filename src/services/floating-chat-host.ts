/**
 * Floating chat window / tab orchestration (open, toggle, close, layout flush).
 *
 * Mount lifecycle for the floating button and status-bar entry stays on the
 * plugin; this host owns the tabbed shell, instance counter, and view ops.
 */

import { Notice } from "obsidian";
import type AgentClientPlugin from "../plugin";
import {
	createFloatingChat,
	createFloatingTabbedShell,
	FloatingViewContainer,
	FloatingTabContainer,
	FloatingTabbedShell,
} from "../ui/FloatingChatView";
import type { IChatViewContainer } from "./view-registry";

export class FloatingChatHost {
	/** Shared shell when enableFloatingChatTabs is on (null when unused). */
	private floatingTabbedShell: FloatingTabbedShell | null = null;
	/** Counter for generating unique floating chat instance IDs */
	private floatingChatCounter = 0;

	constructor(private readonly plugin: AgentClientPlugin) {}

	/**
	 * Open a new floating chat window (or tab when tabs mode is enabled).
	 * Each chat is independent with its own session.
	 */
	openNewFloatingChat(
		initialExpanded = false,
		initialPosition?: { x: number; y: number },
		initialAgentId?: string,
	): IChatViewContainer | null {
		// Single choke point for the setting: commands, the floating button,
		// and the onload bootstrap are already gated upstream, but agent
		// buttons and the in-window "new window" action are not. A window
		// created while the feature is off becomes unreachable after a
		// minimize (the button and every floating command are hidden or
		// disabled with the setting), so refuse creation outright.
		if (!this.isFloatingChatEnabled()) {
			new Notice("[Agent Client] Floating chat is disabled in settings.");
			return null;
		}

		const instanceId = String(this.floatingChatCounter++);

		if (this.plugin.settings.enableFloatingChatTabs) {
			if (!this.floatingTabbedShell) {
				const { shell, tab } = createFloatingTabbedShell(
					this.plugin,
					instanceId,
					initialExpanded,
					initialPosition,
					initialAgentId,
				);
				this.floatingTabbedShell = shell;
				return tab;
			}
			return this.floatingTabbedShell.addTab(
				instanceId,
				initialExpanded,
				initialAgentId,
			);
		}

		// Multi-window mode: FloatingViewContainer creates viewId as
		// "floating-chat-{instanceId}"
		return createFloatingChat(
			this.plugin,
			instanceId,
			initialExpanded,
			initialPosition,
			initialAgentId,
		);
	}

	/**
	 * Called by FloatingTabbedShell when its last tab closes.
	 */
	clearFloatingTabbedShell(shell: FloatingTabbedShell): void {
		if (this.floatingTabbedShell === shell) {
			this.floatingTabbedShell = null;
		}
	}

	/**
	 * Flush pending floating-window size/position to settings immediately.
	 * Used on quit / plugin unload so a debounced save is not lost.
	 */
	flushFloatingWindowLayouts(): void {
		this.floatingTabbedShell?.persistLayoutNow();
		for (const container of this.plugin.viewRegistry.getByType("floating")) {
			if (container instanceof FloatingViewContainer) {
				container.persistLayoutNow();
			}
		}
	}

	/**
	 * Close a specific floating chat window or tab.
	 * @param viewId - The viewId in "floating-chat-{id}" format (from getFloatingChatInstances())
	 */
	closeFloatingChat(viewId: string): void {
		const container = this.plugin.viewRegistry.get(viewId);
		if (container instanceof FloatingTabContainer) {
			container.closeContainer();
			return;
		}
		if (container instanceof FloatingViewContainer) {
			container.unmount();
		}
	}

	/**
	 * Whether floating chat windows/commands are available (any entry mode except off).
	 */
	isFloatingChatEnabled(): boolean {
		return this.plugin.settings.floatingChatEntry !== "off";
	}

	/**
	 * Open/expand a floating chat, or minimize when one-key toggle applies.
	 * Used by the Toggle command and the status-bar entry.
	 */
	toggleFloatingChat(): void {
		if (!this.isFloatingChatEnabled()) return;

		const instances = this.getFloatingChatInstances();
		if (instances.length === 0) {
			this.openNewFloatingChat(true);
			return;
		}

		let targetId: string;
		if (instances.length === 1) {
			targetId = instances[0];
		} else {
			const focused = this.plugin.viewRegistry.getFocused();
			if (focused && focused.viewType === "floating") {
				targetId = focused.viewId;
			} else {
				targetId = instances[instances.length - 1];
			}
		}

		const target = this.plugin.viewRegistry.get(targetId);
		if (!target) return;
		if (this.plugin.settings.floatingChatOneKeyToggle && target.isExpanded()) {
			target.collapse();
		} else {
			target.expand();
		}
	}

	/**
	 * Get all floating chat instance viewIds.
	 * @returns Array of viewIds in "floating-chat-{id}" format
	 */
	getFloatingChatInstances(): string[] {
		return this.plugin.viewRegistry
			.getByType("floating")
			.map((v) => v.viewId);
	}

	/**
	 * Expand a specific floating chat window by triggering a custom event.
	 * @param viewId - The viewId in "floating-chat-{id}" format (from getFloatingChatInstances())
	 */
	expandFloatingChat(viewId: string): void {
		const view = this.plugin.viewRegistry.get(viewId);
		if (view) {
			view.expand();
		}
	}

	/**
	 * Unmount tabbed shell and standalone floating views (plugin onunload).
	 */
	unmountAll(): void {
		if (this.floatingTabbedShell) {
			this.floatingTabbedShell.unmount();
			this.floatingTabbedShell = null;
		}

		for (const container of this.plugin.viewRegistry.getByType("floating")) {
			if (container instanceof FloatingViewContainer) {
				container.unmount();
			}
		}
	}
}
