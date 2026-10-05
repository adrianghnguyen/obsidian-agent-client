import * as React from "react";
const { useState, useEffect } = React;

const TICK_MS = 1000;

/**
 * Live elapsed time since harness boot started (for empty-state connecting copy).
 */
export function useHarnessBootElapsed(
	showConnecting: boolean,
	bootStartedAtMs: number | null,
): number {
	const [elapsedMs, setElapsedMs] = useState(0);

	useEffect(() => {
		if (!showConnecting || bootStartedAtMs == null) {
			setElapsedMs(0);
			return;
		}

		const update = () => {
			setElapsedMs(Math.max(0, Date.now() - bootStartedAtMs));
		};
		update();
		const id = window.setInterval(update, TICK_MS);
		return () => window.clearInterval(id);
	}, [showConnecting, bootStartedAtMs]);

	return showConnecting && bootStartedAtMs != null ? elapsedMs : 0;
}
