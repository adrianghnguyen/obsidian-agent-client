import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { setIcon } from "obsidian";

import type AgentClientPlugin from "../plugin";
import { SessionManagerComponent } from "./SessionManagerView";
import { getCurrentAgent } from "../services/session-helpers";

const HOVER_SHOW_DELAY_MS = 175;
const HOVER_HIDE_DELAY_MS = 175;

/**
 * Status-bar entry for floating chat when floatingChatEntry === "status-bar".
 * Shows the current default agent name; plain click cycles the default agent,
 * Ctrl/Cmd-click toggles floating chat. Hover shows a Session Manager popover.
 */
export class FloatingChatStatusBar {
	private statusBarEl: HTMLElement | null = null;
	private labelEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private popoverEl: HTMLElement | null = null;
	private popoverRoot: Root | null = null;
	private unsubscribers: Array<() => void> = [];
	private lastCount = -1;
	private lastShow = false;
	private showTimer: number | null = null;
	private hideTimer: number | null = null;
	private readonly onDocMouseDown: (e: MouseEvent) => void;
	private readonly onDocKeyDown: (e: KeyboardEvent) => void;

	constructor(private plugin: AgentClientPlugin) {
		this.onDocMouseDown = (e: MouseEvent) => {
			if (!this.popoverEl) return;
			const target = e.target as Node | null;
			if (!target) return;
			if (this.popoverEl.contains(target)) return;
			if (this.statusBarEl?.contains(target)) return;
			this.hidePopover();
		};
		this.onDocKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") this.hidePopover();
		};
	}

	mount(): void {
		this.statusBarEl = this.plugin.addStatusBarItem();
		this.statusBarEl.addClass("agent-client-floating-status-bar");

		const iconEl = this.statusBarEl.createSpan({
			cls: "agent-client-floating-status-bar-icon",
		});
		setIcon(iconEl, "bot-message-square");

		// Fixed-width unread-count slot between the icon and the agent name.
		// Always present (never collapsed) so the pill's width stays constant
		// whether or not a count is displayed.
		this.countEl = this.statusBarEl.createSpan({
			cls: "agent-client-floating-status-bar-count",
		});
		this.countEl.setText("\u00A0");

		this.labelEl = this.statusBarEl.createSpan({
			cls: "agent-client-floating-status-bar-label",
		});
		this.syncLabel();

		this.statusBarEl.addEventListener("click", (e) => {
			e.preventDefault();
			this.hidePopover();
			// Plain click cycles the default agent (same as the ribbon);
			// Ctrl/Cmd-click keeps the historical toggle. FAB is unchanged.
			if (e.ctrlKey || e.metaKey) {
				this.plugin.toggleFloatingChat();
			} else {
				this.plugin.cycleDefaultAgent();
			}
		});
		this.statusBarEl.addEventListener("mouseenter", () => {
			this.cancelHide();
			this.scheduleShow();
		});
		this.statusBarEl.addEventListener("mouseleave", () => {
			this.cancelShow();
			this.scheduleHide();
		});

		this.unsubscribers.push(
			this.plugin.settingsService.subscribe(() => {
				this.syncVisibility();
				this.syncLabel();
				this.syncUnread();
			}),
		);
		this.unsubscribers.push(
			this.plugin.viewRegistry.subscribe(() => this.syncUnread()),
		);
		this.syncVisibility();
		this.syncUnread();
	}

	unmount(): void {
		for (const unsubscribe of this.unsubscribers) unsubscribe();
		this.unsubscribers = [];
		this.clearTimers();
		this.hidePopover();
		this.statusBarEl?.remove();
		this.statusBarEl = null;
		this.labelEl = null;
		this.countEl = null;
	}

	private syncVisibility(): void {
		const visible = this.plugin.settings.floatingChatEntry === "status-bar";
		this.statusBarEl?.toggleClass("is-hidden", !visible);
		if (!visible) this.hidePopover();
	}

	/**
	 * Reflect how many open sessions have an unread (finished but not yet
	 * read) turn. The count slot is always reserved, so this only toggles the
	 * soft-blue `is-unread` tint and the text.
	 */
	private syncUnread(): void {
		if (!this.statusBarEl) return;
		const count = this.plugin.viewRegistry.countUnread();
		const show = this.plugin.settings.showAwaitingStatusBar && count > 0;

		this.statusBarEl.toggleClass("is-unread", show);
		if (count === this.lastCount && show === this.lastShow) return;
		this.lastCount = count;
		this.lastShow = show;

		this.countEl?.setText(show ? String(count) : "\u00A0");

		const unread =
			count === 0
				? ""
				: count === 1
					? " · 1 unread session"
					: ` · ${count} unread sessions`;
		const label = `Agent floating chat (click to cycle default agent, Ctrl/Cmd-click to toggle)${unread}`;
		this.statusBarEl.setAttr("aria-label", label);
		this.statusBarEl.setAttr("title", label);
	}

	/** Reflect the current default agent name next to the icon. */
	private syncLabel(): void {
		if (!this.labelEl) return;
		const displayName = getCurrentAgent(
			this.plugin.settings,
		).displayName;
		this.labelEl.setText(displayName);
	}

	private scheduleShow(): void {
		if (this.popoverEl) return;
		this.clearShowTimer();
		this.showTimer = window.setTimeout(() => {
			this.showTimer = null;
			this.showPopover();
		}, HOVER_SHOW_DELAY_MS);
	}

	private scheduleHide(): void {
		this.clearHideTimer();
		this.hideTimer = window.setTimeout(() => {
			this.hideTimer = null;
			this.hidePopover();
		}, HOVER_HIDE_DELAY_MS);
	}

	private cancelShow(): void {
		this.clearShowTimer();
	}

	private cancelHide(): void {
		this.clearHideTimer();
	}

	private clearShowTimer(): void {
		if (this.showTimer !== null) {
			window.clearTimeout(this.showTimer);
			this.showTimer = null;
		}
	}

	private clearHideTimer(): void {
		if (this.hideTimer !== null) {
			window.clearTimeout(this.hideTimer);
			this.hideTimer = null;
		}
	}

	private clearTimers(): void {
		this.clearShowTimer();
		this.clearHideTimer();
	}

	private showPopover(): void {
		if (!this.statusBarEl) return;
		if (this.plugin.settings.floatingChatEntry !== "status-bar") return;
		if (this.popoverEl) return;

		const doc = this.statusBarEl.ownerDocument;
		this.popoverEl = doc.body.createDiv({
			cls: "agent-client-status-bar-session-popover",
		});

		this.popoverEl.addEventListener("mouseenter", () => {
			this.cancelHide();
		});
		this.popoverEl.addEventListener("mouseleave", () => {
			this.scheduleHide();
		});

		this.popoverRoot = createRoot(this.popoverEl);
		this.popoverRoot.render(
			<SessionManagerComponent
				plugin={this.plugin}
				onSessionSelect={() => this.hidePopover()}
			/>,
		);

		this.positionPopover();

		doc.addEventListener("mousedown", this.onDocMouseDown, true);
		doc.addEventListener("keydown", this.onDocKeyDown, true);
	}

	private positionPopover(): void {
		if (!this.popoverEl || !this.statusBarEl) return;

		const anchor = this.statusBarEl.getBoundingClientRect();
		const popover = this.popoverEl;
		const margin = 8;
		const gap = 6;
		const width = Math.min(280, window.innerWidth - margin * 2);

		// Prefer aligning to the icon; clamp so the panel stays on-screen.
		let left = anchor.left + anchor.width / 2 - width / 2;
		left = Math.max(
			margin,
			Math.min(left, window.innerWidth - width - margin),
		);

		// Always open above the status bar (same pattern as the FAB instance menu).
		// Pin with `bottom` so we never need content height before React paints,
		// and never flip below the status bar into clipped / off-screen space.
		const bottom = window.innerHeight - anchor.top + gap;
		const maxHeight = Math.max(80, anchor.top - margin - gap);

		popover.setCssProps({
			width: `${width}px`,
			left: `${left}px`,
			right: "auto",
			top: "auto",
			bottom: `${bottom}px`,
			"max-height": `${maxHeight}px`,
		});
	}

	private hidePopover(): void {
		this.clearTimers();
		const doc = this.statusBarEl?.ownerDocument ?? document;
		doc.removeEventListener("mousedown", this.onDocMouseDown, true);
		doc.removeEventListener("keydown", this.onDocKeyDown, true);

		if (this.popoverRoot) {
			this.popoverRoot.unmount();
			this.popoverRoot = null;
		}
		this.popoverEl?.remove();
		this.popoverEl = null;
	}
}
