/**
 * Workspace leaf / chat view activation helpers (activate, focus, create leaf).
 *
 * Floating chat orchestration stays in FloatingChatHost; this module owns
 * sidebar/editor ChatView and Session Manager leaf ops.
 */

import { WorkspaceLeaf } from "obsidian";
import type AgentClientPlugin from "../plugin";
import { ChatView, VIEW_TYPE_CHAT } from "../ui/ChatView";
import { VIEW_TYPE_SESSION_MANAGER } from "../ui/SessionManagerView";
import { getLogger } from "../utils/logger";

export class ChatLeafHost {
	constructor(private readonly plugin: AgentClientPlugin) {}

	async activateView(): Promise<void> {
		const { workspace } = this.plugin.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);

		if (leaves.length > 0) {
			// Find the leaf matching lastActiveChatViewId, or fall back to first leaf
			const focusedId = this.plugin.lastActiveChatViewId;
			if (focusedId) {
				leaf =
					leaves.find(
						(l) => (l.view as ChatView)?.viewId === focusedId,
					) || leaves[0];
			} else {
				leaf = leaves[0];
			}
		} else {
			leaf = this.createNewChatLeaf(false);
			if (leaf) {
				await leaf.setViewState({
					type: VIEW_TYPE_CHAT,
					active: true,
				});
			}
		}

		if (leaf) {
			await workspace.revealLeaf(leaf);
			this.focusTextarea(leaf);
		}
	}

	async activateSessionManager(): Promise<void> {
		const { workspace } = this.plugin.app;

		const leaves = workspace.getLeavesOfType(VIEW_TYPE_SESSION_MANAGER);
		if (leaves.length > 0) {
			await workspace.revealLeaf(leaves[0]);
			return;
		}

		const leaf = workspace.getLeftLeaf(false);
		if (leaf) {
			await leaf.setViewState({
				type: VIEW_TYPE_SESSION_MANAGER,
				active: true,
			});
			await workspace.revealLeaf(leaf);
		}
	}

	/**
	 * Close a specific chat view (sidebar or floating).
	 * Dispatch is via IChatViewContainer.closeContainer(); plugin does not
	 * need to know the concrete container class.
	 */
	closeView(viewId: string): void {
		this.plugin.viewRegistry.get(viewId)?.closeContainer();
	}

	/**
	 * Focus the textarea in a ChatView leaf.
	 */
	focusTextarea(leaf: WorkspaceLeaf): void {
		const viewContainerEl = leaf.view?.containerEl;
		if (viewContainerEl) {
			window.setTimeout(() => {
				const textarea = viewContainerEl.querySelector(
					"textarea.agent-client-chat-input-textarea",
				);
				if (textarea instanceof HTMLTextAreaElement) {
					textarea.focus();
				}
			}, 50);
		}
	}

	/**
	 * Focus the next or previous ChatView in the list.
	 * Uses ChatViewRegistry which includes both sidebar and floating views.
	 */
	focusChatView(direction: "next" | "previous"): void {
		if (direction === "next") {
			this.plugin.viewRegistry.focusNext();
		} else {
			this.plugin.viewRegistry.focusPrevious();
		}
	}

	/**
	 * Create a new leaf for ChatView based on the configured location setting.
	 * @param isAdditional - true when opening additional views (e.g., Open New View)
	 */
	createNewChatLeaf(isAdditional: boolean): WorkspaceLeaf | null {
		const { workspace } = this.plugin.app;
		const location = this.plugin.settings.chatViewLocation;

		switch (location) {
			case "right-tab":
				if (isAdditional) {
					return this.createSidebarTab("right");
				}
				return workspace.getRightLeaf(false);
			case "right-split":
				return workspace.getRightLeaf(isAdditional);
			case "editor-tab":
				return workspace.getLeaf("tab");
			case "editor-split":
				return workspace.getLeaf("split");
			default:
				return workspace.getRightLeaf(false);
		}
	}

	/**
	 * Create a new tab within an existing sidebar tab group.
	 * Uses the parent of an existing chat leaf to add a sibling tab,
	 * avoiding the vertical split caused by getRightLeaf(true).
	 */
	createSidebarTab(side: "right" | "left"): WorkspaceLeaf | null {
		const { workspace } = this.plugin.app;
		const split =
			side === "right" ? workspace.rightSplit : workspace.leftSplit;

		// Find an existing chat leaf in this sidebar to get its tab group
		const existingLeaves = workspace.getLeavesOfType(VIEW_TYPE_CHAT);
		const sidebarLeaf = existingLeaves.find(
			(leaf) => leaf.getRoot() === split,
		);

		if (sidebarLeaf) {
			const tabGroup = sidebarLeaf.parent;
			// Index is clamped by Obsidian, so a large value appends to the end
			return workspace.createLeafInParent(
				tabGroup,
				Number.MAX_SAFE_INTEGER,
			);
		}

		// Fallback: no existing chat leaf in sidebar, create first one
		return side === "right"
			? workspace.getRightLeaf(false)
			: workspace.getLeftLeaf(false);
	}

	/**
	 * Open a new chat view with a specific agent.
	 * Always creates a new view (doesn't reuse existing).
	 */
	async openNewChatViewWithAgent(
		agentId: string,
		locationOverride?: "right-pane",
	): Promise<string | null> {
		const leaf =
			locationOverride === "right-pane"
				? this.createSidebarTab("right")
				: this.createNewChatLeaf(true);
		if (!leaf) {
			getLogger().warn("[AgentClient] Failed to create new leaf");
			return null;
		}

		await leaf.setViewState({
			type: VIEW_TYPE_CHAT,
			active: true,
			state: { initialAgentId: agentId },
		});

		await this.plugin.app.workspace.revealLeaf(leaf);
		const view = leaf.view as ChatView | null;
		const viewId = view?.viewId ?? null;

		// Focus textarea after revealing the leaf
		const viewContainerEl = leaf.view?.containerEl;
		if (viewContainerEl) {
			window.setTimeout(() => {
				const textarea = viewContainerEl.querySelector(
					"textarea.agent-client-chat-input-textarea",
				);
				if (textarea instanceof HTMLTextAreaElement) {
					textarea.focus();
				}
			}, 0);
		}
		return viewId;
	}
}
