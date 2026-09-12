/**
 * Focus gating for chat-scoped commands (e.g. cycle/switch session mode).
 *
 * Obsidian hotkeys are global: without a gate, a bound shortcut fires while
 * typing in notes. These helpers enable the command only when a chat view
 * has DOM focus — or when the command palette has focus so palette invoke
 * still works (the palette steals focus from the chat).
 */

export function isObsidianCommandPaletteFocused(
	activeElement: Element | null | undefined,
): boolean {
	if (!activeElement || typeof activeElement.closest !== "function") {
		return false;
	}
	return Boolean(activeElement.closest(".prompt"));
}

/**
 * @param focusedView - Registry-focused chat view (or null if none)
 * @param activeElement - `document.activeElement` (or vault `activeDocument`)
 */
export function isFocusGatedChatCommandEnabled(
	focusedView: { hasFocus(): boolean } | null | undefined,
	activeElement: Element | null | undefined,
): boolean {
	if (!focusedView) return false;
	if (focusedView.hasFocus()) return true;
	return isObsidianCommandPaletteFocused(activeElement);
}
