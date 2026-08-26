import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { setIcon } from "obsidian";

import type AgentClientPlugin from "../plugin";
import { SessionManagerComponent } from "./SessionManagerView";

const HOVER_SHOW_DELAY_MS = 175;
const HOVER_HIDE_DELAY_MS = 175;

/**
 * Status-bar entry for floating chat when floatingChatEntry === "status-bar".
 * Click toggles floating chat; hover shows a Session Manager popover.
 */
export class FloatingChatStatusBar {
	private statusBarEl: HTMLElement | null = null;
	private popoverEl: HTMLElement | null = null;
	private popoverRoot: Root | null = null;
	private unsubscribe: (() => void) | null = null;
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
		this.statusBarEl.setAttr("aria-label", "Agent floating chat");
		this.statusBarEl.setAttr("title", "Agent floating chat");

		const iconEl = this.statusBarEl.createSpan({
			cls: "agent-client-floating-status-bar-icon",
		});
		setIcon(iconEl, "bot-message-square");

		this.statusBarEl.addEventListener("click", (e) => {
			e.preventDefault();
			this.hidePopover();
			this.plugin.toggleFloatingChat();
		});
		this.statusBarEl.addEventListener("mouseenter", () => {
			this.cancelHide();
			this.scheduleShow();
		});
		this.statusBarEl.addEventListener("mouseleave", () => {
			this.cancelShow();
			this.scheduleHide();
		});

		this.unsubscribe = this.plugin.settingsService.subscribe(() => {
			this.syncVisibility();
		});
		this.syncVisibility();
	}

	unmount(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.clearTimers();
		this.hidePopover();
		this.statusBarEl?.remove();
		this.statusBarEl = null;
	}

	private syncVisibility(): void {
		const visible = this.plugin.settings.floatingChatEntry === "status-bar";
		this.statusBarEl?.toggleClass("is-hidden", !visible);
		if (!visible) this.hidePopover();
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

		popover.style.setProperty("width", `${width}px`);
		popover.style.setProperty("left", `${left}px`);
		popover.style.setProperty("right", "auto");
		popover.style.setProperty("top", "auto");
		popover.style.setProperty("bottom", `${bottom}px`);
		popover.style.setProperty("max-height", `${maxHeight}px`);
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
