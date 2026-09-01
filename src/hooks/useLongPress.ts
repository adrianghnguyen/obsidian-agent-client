import { useCallback, useRef, useState } from "react";

/**
 * Hook that distinguishes between a short click (tap) and a long press.
 *
 * - Pointer down starts a timer.
 * - If the pointer is released before `thresholdMs` elapses, `onShort` fires.
 * - If the pointer is held past `thresholdMs`, the "armed" state is set and
 *   releasing the pointer fires `onLong`.
 * - If the pointer leaves the element before the threshold, or the component
 *   unmounts, everything resets.
 *
 * @returns Event handlers to spread onto the target element, plus an `armed`
 *   boolean that can be used to apply visual feedback.
 */
export function useLongPress(
	onShort: () => void,
	onLong: () => void,
	thresholdMs = 800,
): {
	armed: boolean;
	onPointerDown: (e: React.PointerEvent) => void;
	onPointerUp: (e: React.PointerEvent) => void;
	onPointerLeave: (e: React.PointerEvent) => void;
} {
	const [armed, setArmed] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const armedRef = useRef(false);
	const onShortRef = useRef(onShort);
	const onLongRef = useRef(onLong);

	onShortRef.current = onShort;
	onLongRef.current = onLong;

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const onPointerDown = useCallback(
		(e: React.PointerEvent) => {
			// Only respond to primary button (mouse left / touch primary)
			if (e.button !== 0) return;

			clearTimer();
			setArmed(false);
			armedRef.current = false;

			timerRef.current = setTimeout(() => {
				armedRef.current = true;
				setArmed(true);
			}, thresholdMs);
		},
		[clearTimer, thresholdMs],
	);

	const onPointerUp = useCallback(
		(e: React.PointerEvent) => {
			if (e.button !== 0) return;

			clearTimer();
			setArmed(false);

			if (armedRef.current) {
				onLongRef.current();
			} else {
				onShortRef.current();
			}
		},
		[clearTimer],
	);

	const onPointerLeave = useCallback(
		(e: React.PointerEvent) => {
			if (e.button !== 0) return;

			clearTimer();
			setArmed(false);
			armedRef.current = false;
		},
		[clearTimer],
	);

	return { armed, onPointerDown, onPointerUp, onPointerLeave };
}