/**
 * Floating-chat active-note attachment mode.
 * One composer control cycles first → always → off.
 */

import type { AttachedFile } from "../types/chat";
import type { NoteMetadata } from "./vault-service";

export type ChatContextVariant = "sidebar" | "floating" | "embedded";

/** first = only the first message; always = every message; off = never. */
export type FloatingNoteContextMode = "first" | "always" | "off";

export const FLOATING_NOTE_CONTEXT_CYCLE: readonly FloatingNoteContextMode[] = [
	"first",
	"always",
	"off",
];

export interface ActiveNoteAttachInput {
	variant: ChatContextVariant;
	globalAutoMention: boolean;
	floatingNoteContextMode: FloatingNoteContextMode;
	messageCount: number;
	/** User dismissed auto-mention for the current send via the @ badge × control. */
	isAutoMentionDisabled: boolean;
	/**
	 * The active note has a live editor text selection. A selection is explicit
	 * user intent, so it attaches as context regardless of the mode icon or an
	 * explicit dismiss. It keeps attaching until the selection is collapsed.
	 */
	hasSelection?: boolean;
}

export function cycleFloatingNoteContextMode(
	mode: FloatingNoteContextMode,
): FloatingNoteContextMode {
	const index = FLOATING_NOTE_CONTEXT_CYCLE.indexOf(mode);
	const next =
		FLOATING_NOTE_CONTEXT_CYCLE[
			(index + 1) % FLOATING_NOTE_CONTEXT_CYCLE.length
		];
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

/** Composer glyph: file+1, file with infinity, or x. */
export type FloatingNoteContextIconId = "file-plus-one" | "file-infinity" | "x";

export function floatingNoteContextIcon(
	mode: FloatingNoteContextMode,
): FloatingNoteContextIconId {
	if (mode === "always") return "file-infinity";
	if (mode === "off") return "x";
	return "file-plus-one";
}

/**
 * Composer shows the active-note chip when that note *would* attach on the
 * next send (first message of a "first" session, every message in "always",
 * or the sidebar's global auto-mention). A temporary dismiss does not hide
 * the chip; the badge stays (struck through) so it can be turned back on.
 *
 * Shared by every chat variant so the chip appears and behaves the same way
 * in sidebar, floating, and embedded composers.
 */
export function composerShowsActiveNoteChip(input: {
	variant: ChatContextVariant;
	hasActiveNote: boolean;
	/** Sidebar/embedded global auto-mention setting (unused when floating). */
	globalAutoMention: boolean;
	floatingNoteContextMode: FloatingNoteContextMode;
	messageCount: number;
	/** A live selection forces the chip visible even in "don't attach". */
	hasSelection?: boolean;
}): boolean {
	if (!input.hasActiveNote) {
		return false;
	}
	return shouldAttachActiveNote({
		variant: input.variant,
		globalAutoMention: input.globalAutoMention,
		floatingNoteContextMode: input.floatingNoteContextMode,
		messageCount: input.messageCount,
		isAutoMentionDisabled: false,
		hasSelection: input.hasSelection,
	});
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
	// A live selection is explicit user intent and overrides the attach icon:
	// the temporary @ dismiss, floating "don't attach", and sidebar auto-mention
	// off all still attach while the user has text selected in the note.
	if (input.hasSelection) {
		return true;
	}
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

/**
 * Single source of truth for "the composer chip must read as active": a live
 * selection forces attach, so the UI must not strike the chip through.
 */
export function selectionForcesAttach(
	note: { selection?: unknown } | null | undefined,
): boolean {
	return !!note?.selection;
}

export function showFloatingNoteContextControl(
	variant: ChatContextVariant,
): boolean {
	return variant === "floating";
}

/**
 * Floating-only: keep a standalone mode glyph in the row while the merged
 * `@Note` chip is hidden (off mode, first mode after the first send, or no
 * active note). When the chip is visible the glyph lives inside it instead.
 */
export function shouldShowStandaloneNoteContextGlyph(input: {
	variant: ChatContextVariant;
	hasActiveNote: boolean;
	floatingNoteContextMode: FloatingNoteContextMode;
	messageCount: number;
	hasSelection?: boolean;
}): boolean {
	if (!showFloatingNoteContextControl(input.variant)) {
		return false;
	}
	return !composerShowsActiveNoteChip({
		variant: input.variant,
		hasActiveNote: input.hasActiveNote,
		globalAutoMention: false,
		floatingNoteContextMode: input.floatingNoteContextMode,
		messageCount: input.messageCount,
		hasSelection: input.hasSelection,
	});
}

/** @ chip label for a manually attached file (same `@name` pattern as auto-mention). */
export function composerAttachedFileChipLabel(file: AttachedFile): string {
	const name = file.name ?? "file";
	return `@${name}`;
}

/** One @ chip per attached non-image file, in composer order. */
export function composerAttachedFileChipLabels(
	files: AttachedFile[],
): string[] {
	return files
		.filter((file) => file.kind === "file")
		.map((file) => composerAttachedFileChipLabel(file));
}

/** Active-note @ chip label (matches sidebar auto-mention badge text). */
export function composerActiveNoteChipLabel(note: NoteMetadata): string {
	let label = `@${note.name}`;
	if (note.selection) {
		const from = note.selection.from.line + 1;
		const to = note.selection.to.line + 1;
		label += `:${from}-${to}`;
	}
	return label;
}

/**
 * Floating context-row chip labels: active note (when mode attaches it) plus
 * each user-attached file. Mirrors main composer @ badges, one chip per file.
 */
export function floatingComposerContextChipLabels(input: {
	showActiveNoteChip: boolean;
	activeNote: NoteMetadata | null;
	attachedFiles: AttachedFile[];
}): string[] {
	const labels: string[] = [];
	if (input.showActiveNoteChip && input.activeNote) {
		labels.push(composerActiveNoteChipLabel(input.activeNote));
	}
	labels.push(...composerAttachedFileChipLabels(input.attachedFiles));
	return labels;
}
