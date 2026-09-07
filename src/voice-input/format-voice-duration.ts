/**
 * Format elapsed recording milliseconds as M:SS (e.g. 70000 → "1:10").
 */
export function formatVoiceDuration(elapsedMs: number): string {
	const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Capture the message text to send when stopping voice and submitting.
 * Trims whitespace; empty string means nothing to send.
 */
export function captureVoiceMessageForSend(inputValue: string): string {
	return inputValue.trim();
}
