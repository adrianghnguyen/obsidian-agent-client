/**
 * Pick the nearest embedded chat block in a note for button → chat routing.
 *
 * Prefer the closest chat at/above the target line; if none, the earliest chat
 * below. Secondary sort by lineStart keeps the "below" pick deterministic.
 */

export interface EmbeddedChatRef {
	viewId: string;
	sourcePath: string;
	lineStart: number;
}

export function findNearestEmbeddedChat(
	embeds: readonly EmbeddedChatRef[],
	sourcePath: string,
	lineStart: number,
): string | null {
	let above: EmbeddedChatRef | null = null;
	let aboveDistance = Number.POSITIVE_INFINITY;
	let below: EmbeddedChatRef | null = null;

	for (const container of embeds) {
		if (container.sourcePath !== sourcePath) continue;
		const distance = lineStart - container.lineStart;
		if (distance >= 0) {
			if (distance < aboveDistance) {
				above = container;
				aboveDistance = distance;
			}
		} else if (!below || container.lineStart < below.lineStart) {
			below = container;
		}
	}

	return (above ?? below)?.viewId ?? null;
}
