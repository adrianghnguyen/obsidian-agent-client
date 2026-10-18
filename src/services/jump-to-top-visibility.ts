/** Pixels of slack when deciding whether the top of the latest item is still visible. */
export const JUMP_TOP_TOLERANCE_PX = 4;

/** Show jump-to-top once the viewport bottom is within this distance of the message bottom. */
export const JUMP_TO_TOP_NEAR_MESSAGE_END_PX = 100;

export interface JumpToTopVisibilityInput {
	containerTop: number;
	containerBottom: number;
	itemTop: number;
	itemBottom: number;
	isAtConversationBottom: boolean;
	jumpTopTolerancePx?: number;
	nearMessageEndPx?: number;
}

/**
 * Whether the conversation-level "Jump to top" pill should be shown (full opacity).
 * Requires a long latest message, the user scrolled up from the chat bottom, and
 * the viewport is reading within the last ~100px of that response.
 */
export function computeJumpToTopVisible(
	input: JumpToTopVisibilityInput,
): boolean {
	const tolerance = input.jumpTopTolerancePx ?? JUMP_TOP_TOLERANCE_PX;
	const nearEndPx = input.nearMessageEndPx ?? JUMP_TO_TOP_NEAR_MESSAGE_END_PX;

	// Short message or user already at the start of the latest response.
	if (input.itemTop >= input.containerTop - tolerance) {
		return false;
	}

	// Latest message no longer intersects the viewport (scrolled past it).
	if (input.itemBottom <= input.containerTop + tolerance) {
		return false;
	}

	// Still pinned to the bottom of the transcript — do not pop in while auto-follow.
	if (input.isAtConversationBottom) {
		return false;
	}

	// Viewport bottom must be within the tail of the long response.
	const gapToMessageBottom = input.itemBottom - input.containerBottom;
	if (gapToMessageBottom > nearEndPx) {
		return false;
	}

	return true;
}

/** Whether the latest item is tall enough that its start can scroll off-screen. */
export function isLatestMessageLong(input: {
	containerTop: number;
	itemTop: number;
	jumpTopTolerancePx?: number;
}): boolean {
	const tolerance = input.jumpTopTolerancePx ?? JUMP_TOP_TOLERANCE_PX;
	return input.itemTop < input.containerTop - tolerance;
}
