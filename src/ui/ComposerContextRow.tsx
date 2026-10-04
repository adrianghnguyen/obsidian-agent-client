import * as React from "react";
import { setIcon } from "obsidian";

import type { NoteMetadata } from "../services/vault-service";
import type { AttachedFile } from "../types/chat";
import type {
	ChatContextVariant,
	FloatingNoteContextMode,
} from "../services/floating-note-context";
import {
	composerContextChips,
	floatingNoteContextIcon,
	floatingNoteContextTooltip,
	showFloatingNoteContextControl,
} from "../services/floating-note-context";
import {
	FloatingNoteContextButton,
	FloatingNoteContextGlyph,
} from "./FloatingNoteContextButton";

export interface ComposerContextRowProps {
	variant: ChatContextVariant;
	activeNote: NoteMetadata | null;
	/** The active-note pill is offered (see composerShowsActiveNoteChip). */
	showActiveNoteChip: boolean;
	/** Whether the next send attaches the active note. */
	isAttached: boolean;
	floatingNoteContextMode: FloatingNoteContextMode;
	onCycleNoteContextMode?: () => void;
	/** Drop the active note from the next send (chip ×). */
	onRemoveActiveNote: () => void;
	/** Force the active note onto the next send (chip +). */
	onAttachActiveNote: () => void;
	attachedFiles: AttachedFile[];
	onRemoveFile: (id: string) => void;
	/** Current composer text — parsed for `@[[note]]` mention chips. */
	message: string;
	/** Remove a `@[[note]]` mention from the composer text. */
	onRemoveMention: (noteTitle: string) => void;
}

/**
 * Shared composer context row: the active-note `@` chip, the floating
 * attach-mode glyph (merged into the chip when it will attach, standalone when
 * it will not), and one `@` chip per manually attached file.
 *
 * Every chat variant renders this one component so chip behaviour, tooltips,
 * and toggle semantics stay identical across sidebar, floating, and embedded.
 * The floating attach-mode control stays floating-only; sidebar and embedded
 * keep their global Auto-mention toggle without the mode glyph.
 */
export function ComposerContextRow({
	variant,
	activeNote,
	showActiveNoteChip,
	isAttached,
	floatingNoteContextMode,
	onCycleNoteContextMode,
	onRemoveActiveNote,
	onAttachActiveNote,
	attachedFiles,
	onRemoveFile,
	message,
	onRemoveMention,
}: ComposerContextRowProps) {
	const isFloatingContext = showFloatingNoteContextControl(variant);
	const showStandaloneModeGlyph = isFloatingContext && !showActiveNoteChip;
	const contextChips = composerContextChips({ message, attachedFiles });

	if (
		!showActiveNoteChip &&
		!showStandaloneModeGlyph &&
		contextChips.length === 0
	) {
		return null;
	}

	const chipDisabled = !isAttached;
	const toggleTitle = isAttached
		? "Remove the active note from the next message"
		: "Attach the active note to the next message";
	const onToggleChip = isAttached ? onRemoveActiveNote : onAttachActiveNote;

	const noteBadge = activeNote && (
		<span
			className={`agent-client-mention-badge ${chipDisabled ? "agent-client-disabled" : ""}`}
		>
			@{activeNote.name}
			{activeNote.selection && (
				<span className="agent-client-selection-indicator">
					{":"}
					{activeNote.selection.from.line + 1}-
					{activeNote.selection.to.line + 1}
				</span>
			)}
		</span>
	);

	return (
		<div className="agent-client-composer-context-row">
			{showStandaloneModeGlyph && (
				<FloatingNoteContextButton
					iconId={floatingNoteContextIcon(floatingNoteContextMode)}
					mode={floatingNoteContextMode}
					tooltip={floatingNoteContextTooltip(
						floatingNoteContextMode,
					)}
					onClick={() => onCycleNoteContextMode?.()}
				/>
			)}

			{showActiveNoteChip && activeNote && (
				<div className="agent-client-auto-mention-inline agent-client-auto-mention-merged">
					{isFloatingContext && (
						<button
							type="button"
							className={`clickable-icon agent-client-floating-note-context-cycle is-${floatingNoteContextMode}`}
							title={floatingNoteContextTooltip(
								floatingNoteContextMode,
							)}
							aria-label={floatingNoteContextTooltip(
								floatingNoteContextMode,
							)}
							onClick={() => onCycleNoteContextMode?.()}
						>
							<FloatingNoteContextGlyph
								id={floatingNoteContextIcon(
									floatingNoteContextMode,
								)}
							/>
						</button>
					)}
					<button
						type="button"
						className="agent-client-mention-toggle"
						title={toggleTitle}
						onClick={onToggleChip}
					>
						{noteBadge}
						<span
							className="agent-client-auto-mention-toggle-icon"
							ref={(el) => {
								if (el) {
									setIcon(el, chipDisabled ? "plus" : "x");
								}
							}}
						/>
					</button>
				</div>
			)}

			{contextChips.map((chip) => (
				<button
					key={chip.id}
					type="button"
					className="agent-client-auto-mention-inline agent-client-context-chip"
					onClick={() =>
						chip.kind === "file"
							? onRemoveFile(chip.fileId ?? "")
							: onRemoveMention(chip.fullName)
					}
					title={chip.fullName}
					aria-label={`Remove ${chip.label}`}
				>
					<span className="agent-client-mention-badge">
						{chip.label}
					</span>
					<span
						className="agent-client-auto-mention-toggle-icon"
						ref={(el) => {
							if (el) {
								setIcon(el, "x");
							}
						}}
					/>
				</button>
			))}
		</div>
	);
}
