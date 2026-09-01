import * as React from "react";
const { useRef, useEffect } = React;
import { setIcon } from "obsidian";
import { useLongPress } from "../../hooks/useLongPress";

interface WindowMinimizeCloseButtonProps {
	onMinimize: () => void;
	onCloseAll: () => void;
	className?: string;
	/** Duration in ms before the button becomes armed (default 800ms). */
	thresholdMs?: number;
}

/**
 * A combined minimize/close button for floating chat windows.
 *
 * - Quick click (tap) minimizes the window.
 * - Long press (~800ms) arms the button (icon turns red, switches to 'x'), then
 *   releasing fires the close-all action.
 * - If the pointer leaves the button before the threshold, the timer is cancelled.
 */
export function WindowMinimizeCloseButton({
	onMinimize,
	onCloseAll,
	className = "",
	thresholdMs = 800,
}: WindowMinimizeCloseButtonProps) {
	const { armed, onPointerDown, onPointerUp, onPointerLeave } = useLongPress(
		onMinimize,
		onCloseAll,
		thresholdMs,
	);

	const buttonRef = useRef<HTMLButtonElement>(null);
	const prevArmed = useRef(false);

	// Update icon when armed state changes
	useEffect(() => {
		if (!buttonRef.current) return;
		setIcon(buttonRef.current, armed ? "x" : "minimize-2");
	}, [armed]);

	// Track previous armed state for cleanup
	useEffect(() => {
		prevArmed.current = armed;
	});

	return (
		<button
			ref={buttonRef}
			type="button"
			className={[
				"clickable-icon agent-client-header-button",
				"agent-client-window-close",
				armed ? "is-armed" : "",
				className,
			]
				.filter(Boolean)
				.join(" ")}
			title={armed ? "Release to close all sessions" : "Minimize (hold to close all)"}
			onPointerDown={onPointerDown}
			onPointerUp={onPointerUp}
			onPointerLeave={onPointerLeave}
		/>
	);
}