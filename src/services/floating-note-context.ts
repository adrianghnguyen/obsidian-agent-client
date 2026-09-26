/**
 * Floating-chat active-note attachment mode.
 * One composer control cycles first → always → off.
 */

export type ChatContextVariant = "sidebar" | "floating" | "embedded";

/** first = only the first message; always = every message; off = never. */
export type FloatingNoteContextMode = "first" | "always" | "off";

export const FLOATING_NOTE_CONTEXT_CYCLE: readonly FloatingNoteContextMode[] =
	["first", "always", "off"];

export interface ActiveNoteAttachInput {
	variant: ChatContextVariant;
	globalAutoMention: boolean;
	floatingNoteContextMode: FloatingNoteContextMode;
	messageCount: number;
	/** User dismissed auto-mention for the current send via the @ badge × control. */
	isAutoMentionDisabled: boolean;
}

export function cycleFloatingNoteContextMode(
	mode: FloatingNoteContextMode,
): FloatingNoteContextMode {
	const index = FLOATING_NOTE_CONTEXT_CYCLE.indexOf(mode);
	const next = FLOATING_NOTE_CONTEXT_CYCLE[(index + 1) % FLOATING_NOTE_CONTEXT_CYCLE.length];
	return next ?? "first";
}

export function parseFloatingNoteContextMode(
	value: unknown,
	legacyFirstMessageOnly?: unknown,
): FloatingNoteContextMode {
	if (value === "first" || value === "always" || value === "off") {
		return value;
	}
	if (legacyFirstMessageOnly === false) {
		return "off";
	}
	return "first";
}

export function floatingNoteContextIcon(
	mode: FloatingNoteContextMode,
): string {
	if (mode === "always") return "file-check";
	if (mode === "off") return "x";
	return "file-plus";
}

export function floatingNoteContextTooltip(
	mode: FloatingNoteContextMode,
): string {
	if (mode === "first") {
		return "Attach the active note on the first message only. Click to keep attaching it.";
	}
	if (mode === "always") {
		return "Keep attaching the active note. Click to attach nothing.";
	}
	return "Don't attach the active note. Click for first message only.";
}

/** True when the next send should include activeNote in preparePrompt. */
export function shouldAttachActiveNote(input: ActiveNoteAttachInput): boolean {
	if (input.isAutoMentionDisabled) {
		return false;
	}
	if (input.variant === "floating") {
		if (input.floatingNoteContextMode === "off") {
			return false;
		}
		if (input.floatingNoteContextMode === "first") {
			return input.messageCount === 0;
		}
		return true;
	}
	return input.globalAutoMention;
}

export function showFloatingNoteContextControl(
	variant: ChatContextVariant,
): boolean {
	return variant === "floating";
}
