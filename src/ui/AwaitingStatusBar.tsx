import { setIcon } from "obsidian";

import type AgentClientPlugin from "../plugin";
import { countAwaitingSessions } from "../services/view-registry";

/**
 * Status-bar entry showing how many open chat sessions have finished their
 * turn and are idle awaiting the user's next prompt.
 *
 * Deliberately non-interactive and subdued: it renders a muted icon plus a
 * live count, is hidden when the count is 0 (or the setting is off), and only
 * exposes a hover tooltip — no click handler, no pointer cursor.
 *
 * Independent of the Floating chat entry setting; always mounted while the
 * plugin is loaded.
 */
export class AwaitingStatusBar {
	private statusBarEl: HTMLElement | null = null;
	private countEl: HTMLElement | null = null;
	private unsubscribers: Array<() => void> = [];
	private lastCount = -1;

	constructor(private plugin: AgentClientPlugin) {}

	mount(): void {
		this.statusBarEl = this.plugin.addStatusBarItem();
		this.statusBarEl.addClass("agent-client-awaiting-status-bar");

		const iconEl = this.statusBarEl.createSpan({
			cls: "agent-client-awaiting-status-bar-icon",
		});
		setIcon(iconEl, "circle-check");

		this.countEl = this.statusBarEl.createSpan({
			cls: "agent-client-awaiting-status-bar-count",
		});

		// React to view register/unregister/focus and to turn-state changes
		// (ChatPanel notifies the registry on those transitions).
		this.unsubscribers.push(
			this.plugin.viewRegistry.subscribe(() => this.sync()),
		);

		// Re-sync when the setting toggles.
		this.unsubscribers.push(
			this.plugin.settingsService.subscribe(() => this.sync()),
		);

		this.sync();
	}

	unmount(): void {
		for (const unsubscribe of this.unsubscribers) unsubscribe();
		this.unsubscribers = [];
		this.statusBarEl?.remove();
		this.statusBarEl = null;
		this.countEl = null;
	}

	private sync(): void {
		const count = countAwaitingSessions(this.plugin.viewRegistry.getAll());
		const visible = this.plugin.settings.showAwaitingStatusBar && count > 0;

		this.statusBarEl?.toggleClass("is-hidden", !visible);

		if (count === this.lastCount) return;
		this.lastCount = count;

		this.countEl?.setText(String(count));

		const label =
			count === 1
				? "1 session awaiting your reply"
				: `${count} sessions awaiting your reply`;
		this.statusBarEl?.setAttr("aria-label", label);
		this.statusBarEl?.setAttr("title", label);
	}
}
