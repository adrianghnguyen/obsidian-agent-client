/**
 * Pure helpers for stream-downwards mode (anchoring newly sent user prompts at
 * the top of the viewport with a dynamic bottom spacer).
 * Zero React imports.
 */

import type { DisplayListItem } from "./trace-turn";

/** Default breathing room (px) kept above an anchored prompt at viewport top. */
export const STREAM_DOWNWARDS_TOP_INSET_PX = 12;

export interface StreamDownwardsSpacerInput {
	/** Whether stream-downwards mode is enabled. */
	enabled: boolean;
	/** Viewport height of the scroll container in pixels. */
	clientHeight: number;
	/** Offset (px) of the latest user turn from the top of the virtual list. */
	lastUserStart: number;
	/** Total virtualized content height (px) before the spacer. */
	totalContentHeight: number;
	/** Extra height (px) occupied by an active loading indicator below the list. */
	loadingIndicatorHeight?: number;
	/** Top inset (px) above the anchored prompt. */
	topInsetPx?: number;
}

/**
 * Find the display index of the most recent user message in `displayItems`,
 * or -1 if no user message is present.
 */
export function findLastUserDisplayIndex(
	displayItems: readonly DisplayListItem[],
): number {
	for (let i = displayItems.length - 1; i >= 0; i--) {
		const item = displayItems[i];
		if (item.type === "message" && item.message.role === "user") {
			return i;
		}
	}
	return -1;
}

/**
 * Compute the height (px) of the trailing spacer needed so the latest user
 * prompt can sit at the top of the viewport while the reply streams down.
 * Shrinks automatically to 0 as the active turn fills the viewport.
 */
export function computeStreamDownwardsSpacerHeight(
	input: StreamDownwardsSpacerInput,
): number {
	if (!input.enabled || input.clientHeight <= 0 || input.lastUserStart < 0) {
		return 0;
	}

	const activeTurnHeight =
		Math.max(0, input.totalContentHeight - input.lastUserStart) +
		Math.max(0, input.loadingIndicatorHeight ?? 0);
	const topInset = input.topInsetPx ?? STREAM_DOWNWARDS_TOP_INSET_PX;

	return Math.max(0, Math.ceil(input.clientHeight - activeTurnHeight - topInset));
}
