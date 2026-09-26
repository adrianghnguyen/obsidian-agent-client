/** Lucide mic head center, in a 24×24 viewBox. */
const WAVE_MID_Y = 7;
const WAVE_LEFT = 9.35;
const WAVE_RIGHT = 14.65;
const WAVE_MAX_AMP = 4.2;
const WAVE_POINTS = 5;

function clampLevel(level: number): number {
	return Math.max(0, Math.min(1, Number.isFinite(level) ? level : 0));
}

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * Live wave inside the mic head. Amplitude follows `level` in [0, 1].
 * `phase` scrolls the wave so a steady tone still moves.
 * Silence is a flat line through the middle of the head.
 */
export function micWavePath(level: number, phase: number): string {
	const amp = clampLevel(level) * WAVE_MAX_AMP;
	const shift = Number.isFinite(phase) ? phase : 0;
	const parts: string[] = [];
	for (let i = 0; i < WAVE_POINTS; i++) {
		const t = i / (WAVE_POINTS - 1);
		const x = WAVE_LEFT + t * (WAVE_RIGHT - WAVE_LEFT);
		const y = WAVE_MID_Y - Math.sin(t * Math.PI * 2 + shift) * amp;
		parts.push(`${i === 0 ? "M" : "L"}${round2(x)} ${round2(y)}`);
	}
	return parts.join(" ");
}
