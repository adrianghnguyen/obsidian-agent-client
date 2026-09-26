/** Level bars replace the mic glyph while recording, in a 24×24 viewBox. */
export const MIC_LEVEL_BAR_COUNT = 5;

const BAR_WIDTH = 2;
const BAR_GAP = 2;
const BAR_MAX_HEIGHT = 14;
const BAR_BASE_Y = 20;

function clampLevel(level: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export interface MicLevelBarRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Vertical bars that stand in for the mic while recording.
 * Heights follow `level` in [0, 1]; center bars react slightly more than edges.
 */
export function micLevelBars(
	level: number,
	barCount: number = MIC_LEVEL_BAR_COUNT,
): MicLevelBarRect[] {
	const clamped = clampLevel(level);
	const count = Math.max(1, Math.floor(barCount));
	const totalWidth = count * BAR_WIDTH + (count - 1) * BAR_GAP;
	const startX = (24 - totalWidth) / 2;

	return Array.from({ length: count }, (_, i) => {
		const weight =
			1 - Math.abs(i - (count - 1) / 2) / count;
		const heightFrac = 0.12 + clamped * weight * 0.88;
		const height = BAR_MAX_HEIGHT * heightFrac;
		return {
			x: round2(startX + i * (BAR_WIDTH + BAR_GAP)),
			y: round2(BAR_BASE_Y - height),
			width: BAR_WIDTH,
			height: round2(height),
		};
	});
}
