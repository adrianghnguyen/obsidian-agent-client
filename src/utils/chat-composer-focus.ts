export const CHAT_COMPOSER_TEXTAREA_SELECTOR =
	"textarea.agent-client-chat-input-textarea";

const COMPOSER_FOCUS_RETRY_MS = 50;

/**
 * Focus the chat composer and place the caret at the end of any draft.
 */
export function focusChatComposerTextarea(textarea: HTMLTextAreaElement): void {
	textarea.focus();
	const end = textarea.value.length;
	textarea.setSelectionRange(end, end);
}

/**
 * Find the composer textarea under `root`. When `viewId` is set, search the
 * matching floating tab panel first (tabs mode).
 */
export function queryChatComposerTextarea(
	root: ParentNode | null | undefined,
	viewId?: string | null,
): HTMLTextAreaElement | null {
	if (!root) return null;
	if (viewId) {
		const panel = root.querySelector(
			`.agent-client-floating-tab-panel[data-view-id="${CSS.escape(viewId)}"]`,
		);
		if (!panel) return null;
		const scoped = panel.querySelector(CHAT_COMPOSER_TEXTAREA_SELECTOR);
		return scoped instanceof HTMLTextAreaElement ? scoped : null;
	}
	const el = root.querySelector(CHAT_COMPOSER_TEXTAREA_SELECTOR);
	return el instanceof HTMLTextAreaElement ? el : null;
}

/**
 * Focus the composer after layout/paint. Double rAF covers expand/open
 * (display:none → visible, React 18 async commit); a short timeout retries
 * if the textarea is not in the DOM yet (launcher click vs first paint).
 */
export function scheduleChatComposerFocus(
	find: () => HTMLTextAreaElement | null,
): void {
	const tryFocus = (): boolean => {
		const textarea = find();
		if (!textarea) return false;
		focusChatComposerTextarea(textarea);
		return true;
	};
	window.requestAnimationFrame(() => {
		window.requestAnimationFrame(() => {
			if (!tryFocus()) {
				window.setTimeout(tryFocus, COMPOSER_FOCUS_RETRY_MS);
			}
		});
	});
}
