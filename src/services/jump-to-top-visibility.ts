/** Pixels of slack when deciding whether the top of the latest item is still visible. */
export const JUMP_TOP_TOLERANCE_PX = 4;

/** Show jump-to-top once the viewport bottom is within this distance of the message bottom. */
export const JUMP_TO_TOP_NEAR_MESSAGE_END_PX = 100;

export interface JumpToTopVisibilityInput {
	scrollTop: number;
	clientHeight: number;
	latestItemStart: number;
	latestItemHeight: number;
	isAtConversationBottom: boolean;
	jumpTopTolerancePx?: number;
	nearMessageEndPx?: number;
}

/**
 * Whether the conversation-level "Jump to top" pill should be shown (full opacity).
 * Uses scroll coordinates so tall virtualized rows (one item = whole reply) still
 * gate correctly. Requires a long latest message, scrolling up from the chat bottom,
 * and the viewport bottom within ~100px of that reply's end.
 */
export function computeJumpToTopVisible(
	input: JumpToTopVisibilityInput,
): boolean {
	const tolerance = input.jumpTopTolerancePx ?? JUMP_TOP_TOLERANCE_PX;
	const nearEndPx = input.nearMessageEndPx ?? JUMP_TO_TOP_NEAR_MESSAGE_END_PX;
	const latestItemEnd = input.latestItemStart + input.latestItemHeight;
	const viewportBottom = input.scrollTop + input.clientHeight;

	// Short message or user already at the start of the latest response.
	if (input.scrollTop <= input.latestItemStart + tolerance) {
		return false;
	}

	// Latest message no longer intersects the viewport (scrolled past it).
	if (latestItemEnd <= input.scrollTop + tolerance) {
		return false;
	}

	// Still pinned to the bottom of the transcript — do not pop in while auto-follow.
	if (input.isAtConversationBottom) {
		return false;
	}

	// Viewport bottom must be within the tail of the long response.
	const gapToMessageEnd = latestItemEnd - viewportBottom;
	if (gapToMessageEnd > nearEndPx) {
		return false;
	}

	return true;
}

/** Read scroll-space position from a rendered virtual row (translateY + height). */
export function readVirtualItemMetrics(
	element: HTMLElement | null | undefined,
): { itemStart: number; itemHeight: number } | null {
	if (!element) return null;
	const match = element.style.transform.match(/translateY\(([-\d.]+)px\)/);
	const itemStart = match ? Number.parseFloat(match[1]) : 0;
	const itemHeight = element.offsetHeight;
	if (itemHeight <= 0) return null;
	return { itemStart, itemHeight };
}

/** Whether the latest item is tall enough that its start can scroll off-screen. */
export function isLatestMessageLong(input: {
	scrollTop: number;
	latestItemStart: number;
	jumpTopTolerancePx?: number;
}): boolean {
	const tolerance = input.jumpTopTolerancePx ?? JUMP_TOP_TOLERANCE_PX;
	return input.scrollTop > input.latestItemStart + tolerance;
}
