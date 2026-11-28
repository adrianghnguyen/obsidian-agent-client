/**
 * Pure helpers for the scrollbar conversation turn navigator rail.
 * Zero React imports.
 */

import type { ChatMessage } from "../types/chat";
import type { DisplayListItem } from "./trace-turn";

export interface TurnNavEntry {
	/** 1-based user turn number in the conversation. */
	turnNumber: number;
	/** Index of the user message in `displayItems`. */
	displayIndex: number;
	/** Stable virtualizer key for this user message. */
	key: string;
	/** Single-line truncated preview of the user's prompt. */
	preview: string;
	/** Normalized vertical position along the rail (0..1). */
	positionRatio: number;
}

const DEFAULT_PREVIEW_MAX_LENGTH = 72;
const DEFAULT_ACTIVE_TOLERANCE_PX = 24;
const MIN_RAIL_RATIO = 0.02;
const MAX_RAIL_RATIO = 0.96;

/**
 * Extract a concise single-line preview from a user message for tooltip display.
 */
export function extractUserPromptPreview(
	message: ChatMessage,
	maxLength = DEFAULT_PREVIEW_MAX_LENGTH,
): string {
	for (const block of message.content) {
		if (block.type === "text" || block.type === "text_with_context") {
			const normalized = block.text.replace(/\s+/g, " ").trim();
			if (normalized.length === 0) continue;
			if (normalized.length <= maxLength) {
				return normalized;
			}
			return `${normalized.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
		}
	}
	return message.content.length > 0 ? "Attachment" : "";
}

function clampRatio(ratio: number): number {
	return Math.min(MAX_RAIL_RATIO, Math.max(MIN_RAIL_RATIO, ratio));
}

/**
 * Build turn markers for every user message in `displayItems`, positioned
 * proportionally by virtualized scroll offset (falling back to even spacing
 * before layout metrics are available).
 */
export function buildTurnNavEntries(
	displayItems: readonly DisplayListItem[],
	getItemStart?: (displayIndex: number) => number | undefined,
	totalSize = 0,
): TurnNavEntry[] {
	const rawTurns: Array<{
		displayIndex: number;
		key: string;
		message: ChatMessage;
	}> = [];

	for (let i = 0; i < displayItems.length; i++) {
		const item = displayItems[i];
		if (item.type === "message" && item.message.role === "user") {
			rawTurns.push({
				displayIndex: i,
				key: item.key,
				message: item.message,
			});
		}
	}

	const count = rawTurns.length;
	return rawTurns.map((turn, idx) => {
		const offset = getItemStart?.(turn.displayIndex);
		let positionRatio: number;

		if (
			totalSize > 0 &&
			offset !== undefined &&
			Number.isFinite(offset) &&
			offset >= 0
		) {
			positionRatio = clampRatio(offset / totalSize);
		} else if (count <= 1) {
			positionRatio = 0.5;
		} else {
			positionRatio =
				0.04 + (idx / (count - 1)) * (MAX_RAIL_RATIO - 0.04);
		}

		return {
			turnNumber: idx + 1,
			displayIndex: turn.displayIndex,
			key: turn.key,
			preview: extractUserPromptPreview(turn.message),
			positionRatio,
		};
	});
}

/**
 * Determine which turn entry (0-based index into `entries`) is currently active
 * for the given `scrollTop`. Returns -1 when `entries` is empty.
 */
export function findActiveTurnIndex(
	entries: readonly TurnNavEntry[],
	scrollTop: number,
	getItemStart: (displayIndex: number) => number | undefined,
	tolerancePx = DEFAULT_ACTIVE_TOLERANCE_PX,
): number {
	if (entries.length === 0) return -1;

	let activeIndex = 0;
	const threshold = scrollTop + tolerancePx;

	for (let i = 0; i < entries.length; i++) {
		const start = getItemStart(entries[i].displayIndex);
		if (start !== undefined && Number.isFinite(start) && start <= threshold) {
			activeIndex = i;
		}
	}

	return activeIndex;
}
