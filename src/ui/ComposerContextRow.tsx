import * as React from "react";
import { setIcon } from "obsidian";

import type { NoteMetadata } from "../services/vault-service";
import type { AttachedFile } from "../types/chat";
import type {
	ChatContextVariant,
	FloatingNoteContextMode,
} from "../services/floating-note-context";
import {
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
	/** The pill is dismissed for this send (sidebar A- toggle or floating ×). */
	isAutoMentionDisabled: boolean;
	/** A live editor selection makes the dispose action inapplicable. */
	selectionForces: boolean;
	floatingNoteContextMode: FloatingNoteContextMode;
	onCycleNoteContextMode?: () => void;
	onToggleAutoMention: (disabled: boolean) => void;
	attachedFiles: AttachedFile[];
	onRemoveFile: (id: string) => void;
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
	isAutoMentionDisabled,
	selectionForces,
	floatingNoteContextMode,
	onCycleNoteContextMode,
	onToggleAutoMention,
	attachedFiles,
	onRemoveFile,
}: ComposerContextRowProps) {
	const isFloatingContext = showFloatingNoteContextControl(variant);
	const showStandaloneModeGlyph = isFloatingContext && !showActiveNoteChip;
	const fileChips = attachedFiles.filter((file) => file.kind === "file");

	if (
		!showActiveNoteChip &&
		!showStandaloneModeGlyph &&
		fileChips.length === 0
	) {
		return null;
	}

	const chipDisabled = isAutoMentionDisabled && !selectionForces;
	const toggleTitle = selectionForces
		? "The selected text is attached as context. This toggle applies to sends without a selection."
		: isAutoMentionDisabled
			? "Enable auto-mention"
			: "Temporarily disable auto-mention";

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
						onClick={() =>
							onToggleAutoMention(!isAutoMentionDisabled)
						}
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

			{fileChips.map((file) => (
				<button
					key={file.id}
					type="button"
					className="agent-client-auto-mention-inline"
					onClick={() => onRemoveFile(file.id)}
					title="Remove attachment"
				>
					<span className="agent-client-mention-badge">
						@{file.name ?? "file"}
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
