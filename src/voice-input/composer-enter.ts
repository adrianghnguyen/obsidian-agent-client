import type { SendMessageShortcut } from "../types/settings";

/**
 * Subset of a keyboard event needed to decide whether Enter should send.
 */
export interface ComposerEnterKeyEvent {
	key: string;
	shiftKey: boolean;
	metaKey: boolean;
	ctrlKey: boolean;
	isComposing?: boolean;
}

/**
 * True when this keydown should submit the composer — the same action as
 * the send button / voice "stop and send" control.
 *
 * Shift+Enter is a newline in "enter" mode. In "cmd-enter" mode, only
 * Cmd/Ctrl+Enter sends. IME composition Enter is ignored unless a
 * modifier send is held. Voice listening does not change the shortcut;
 * callers still send the current buffer when this returns true.
 */
export function composerEnterShouldSend(
	e: ComposerEnterKeyEvent,
	shortcut: SendMessageShortcut,
): boolean {
	if (e.key !== "Enter") return false;
	const hasCmdCtrl = e.metaKey || e.ctrlKey;
	if (e.isComposing && !hasCmdCtrl) return false;
	if (shortcut === "enter") return !e.shiftKey;
	return hasCmdCtrl;
}
