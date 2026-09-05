/**
 * Shared ChatPanel → IChatViewContainer callback handover.
 *
 * Containers hold this delegate and forward panel methods. Until
 * setCallbacks runs (or after null), fallbacks match the pre-extract behavior.
 */

import type { ChatInputState } from "../types/chat";
import type { SessionStatus } from "../services/view-registry";
import type { ChatPanelCallbacks } from "./ChatPanel";

export class ChatPanelDelegate {
	private callbacks: ChatPanelCallbacks | null = null;

	setCallbacks(callbacks: ChatPanelCallbacks | null): void {
		this.callbacks = callbacks;
	}

	getDisplayName(): string {
		return this.callbacks?.getDisplayName() ?? "Chat";
	}

	getSessionStatus(): SessionStatus {
		return this.callbacks?.getSessionStatus() ?? "disconnected";
	}

	getSessionTitle(): string {
		return this.callbacks?.getSessionTitle() ?? "New session";
	}

	getSessionId(): string | null {
		return this.callbacks?.getSessionId() ?? null;
	}

	getInputState(): ChatInputState | null {
		return this.callbacks?.getInputState() ?? null;
	}

	setInputState(state: ChatInputState): void {
		this.callbacks?.setInputState(state);
	}

	canSend(): boolean {
		return this.callbacks?.canSend() ?? false;
	}

	async sendMessage(): Promise<boolean> {
		return (await this.callbacks?.sendMessage()) ?? false;
	}

	async cancelOperation(): Promise<void> {
		await this.callbacks?.cancelOperation();
	}
}
