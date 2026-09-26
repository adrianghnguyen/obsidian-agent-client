/**
 * Whether to auto-attach the active note when sending a message.
 * Floating chat can attach on the first message only (per-session toggle).
 */

export type ChatContextVariant = "sidebar" | "floating" | "embedded";

export interface ActiveNoteAttachInput {
	variant: ChatContextVariant;
	globalAutoMention: boolean;
	/** Per-session toggle in floating chat (Settings default seeds initial value). */
	floatingSessionToggle: boolean;
	messageCount: number;
	/** User dismissed auto-mention for the current send via the @ badge × control. */
	isAutoMentionDisabled: boolean;
}

/** True when the next send should include activeNote in preparePrompt. */
export function shouldAttachActiveNote(input: ActiveNoteAttachInput): boolean {
	if (input.isAutoMentionDisabled) {
		return false;
	}
	if (input.variant === "floating") {
		if (input.messageCount > 0) {
			return false;
		}
		return input.floatingSessionToggle;
	}
	return input.globalAutoMention;
}

export function showFloatingNoteContextToggle(
	variant: ChatContextVariant,
): boolean {
	return variant === "floating";
}

/** After the first outbound message, the floating composer toggle is read-only. */
export function isFloatingNoteContextToggleLocked(
	messageCount: number,
): boolean {
	return messageCount > 0;
}
