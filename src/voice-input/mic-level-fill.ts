/** Lucide mic head spans y=2..12 in a 24×24 viewBox. */
export const MIC_HEAD_TOP = 2;
export const MIC_HEAD_HEIGHT = 10;

/**
 * Bottom-up fill rect for the mic head. Level is clamped to [0, 1].
 * Height 0 means silence (outline only).
 */
export function micHeadFill(level: number): { y: number; height: number } {
	const clamped = Math.max(
		0,
		Math.min(1, Number.isFinite(level) ? level : 0),
	);
	const height = MIC_HEAD_HEIGHT * clamped;
	return {
		y: MIC_HEAD_TOP + MIC_HEAD_HEIGHT - height,
		height,
	};
}
