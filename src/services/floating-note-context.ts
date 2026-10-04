/**
 * Floating-chat active-note attachment mode.
 * One composer control cycles first → always → off.
 */

import type { AttachedFile } from "../types/chat";
import type { NoteMetadata } from "./vault-service";
import { extractMentionTitles } from "../utils/mention-parser";

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
	/**
	 * The active note has a live editor text selection. A selection is explicit
	 * user intent, so it attaches as context regardless of the mode icon. It
	 * keeps attaching until the selection is collapsed.
	 */
	hasSelection?: boolean;
}

/**
 * Per-send override of the active-note attach decision, driven by the composer
 * chip. "default" follows the mode (and selection); "attach" and "remove" win
 * over both, so the chip's + / × always works, even in don't-attach modes or
 * while a selection is live. Reset to "default" after each send.
 */
export type ActiveNoteOverride = "default" | "attach" | "remove";

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
 * The composer always shows the active-note chip whenever a note is open, in
 * every mode and chat variant, so its + / × context toggle is always
 * reachable. Whether the note actually attaches is a separate decision
 * (resolveActiveNoteAttach); the chip renders active (×) or struck (+)
 * accordingly.
 */
export function composerShowsActiveNoteChip(input: {
	hasActiveNote: boolean;
}): boolean {
	return input.hasActiveNote;
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

/**
 * Mode/selection decision when no chip override is active (override =
 * "default"). A live selection is explicit user intent and attaches even when
 * the floating mode is "don't attach" or sidebar auto-mention is off.
 */
export function shouldAttachActiveNote(input: ActiveNoteAttachInput): boolean {
	if (input.hasSelection) {
		return true;
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

export interface ActiveNoteResolveInput extends ActiveNoteAttachInput {
	override: ActiveNoteOverride;
}

/**
 * The single attach decision for the next send. A chip override ("attach" /
 * "remove") beats both the live selection and the mode, so the composer chip's
 * + / × always has an effect. "default" falls through to the mode/selection
 * logic in shouldAttachActiveNote.
 */
export function resolveActiveNoteAttach(
	input: ActiveNoteResolveInput,
): boolean {
	if (input.override === "attach") {
		return true;
	}
	if (input.override === "remove") {
		return false;
	}
	return shouldAttachActiveNote(input);
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
 * Floating-only: the mode glyph lives inside the merged `@Note` chip whenever
 * a note is open; it stands alone only when no note is open.
 */
export function shouldShowStandaloneNoteContextGlyph(input: {
	variant: ChatContextVariant;
	hasActiveNote: boolean;
}): boolean {
	if (!showFloatingNoteContextControl(input.variant)) {
		return false;
	}
	return !composerShowsActiveNoteChip({ hasActiveNote: input.hasActiveNote });
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

/**
 * A single context chip in the composer strip: either an `@[[note]]` mention
 * typed in the message or a manually attached file. Both share the same
 * `@name` label and hover tooltip so the strip reads consistently.
 *
 * `fullName` is the untruncated name exposed via the chip's `title` tooltip,
 * and `fileId` identifies the attached file to remove (mentions are removed by
 * editing the text).
 */
export interface ComposerContextChip {
	id: string;
	kind: "mention" | "file";
	label: string;
	fullName: string;
	fileId?: string;
}

/**
 * Ordered, de-duplicated composer chips: `@[[note]]` mentions typed in the
 * current message first (so every referenced file is visible), then manually
 * attached files. A mention wins over an attached file with the same name so
 * the same reference never shows twice.
 */
export function composerContextChips(input: {
	message: string;
	attachedFiles: AttachedFile[];
}): ComposerContextChip[] {
	const chips: ComposerContextChip[] = [];
	const seen = new Set<string>();

	for (const title of extractMentionTitles(input.message)) {
		const key = title.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		chips.push({
			id: `mention:${title}`,
			kind: "mention",
			label: `@${title}`,
			fullName: title,
		});
	}

	for (const file of input.attachedFiles) {
		if (file.kind !== "file") continue;
		const name = file.name ?? "file";
		const key = name.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		chips.push({
			id: `file:${file.id}`,
			kind: "file",
			label: `@${name}`,
			fullName: name,
			fileId: file.id,
		});
	}

	return chips;
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
