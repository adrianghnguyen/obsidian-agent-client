import * as React from "react";
const { useCallback } = React;
import { setIcon } from "obsidian";

/**
 * Scrolls the hovered assistant response to the top of the message list.
 * Uses the same action-button styling as CopyButton (fade-in via parent).
 */
export function JumpToTopButton() {
	const handleJump = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			const target =
				event.currentTarget.closest(".agent-client-virtual-item") ??
				event.currentTarget.closest(".agent-client-message-renderer");
			target?.scrollIntoView({ behavior: "smooth", block: "start" });
		},
		[],
	);

	const iconRef = useCallback((el: HTMLButtonElement | null) => {
		if (el) setIcon(el, "arrow-up-to-line");
	}, []);

	return (
		<button
			className="clickable-icon agent-client-message-action-button"
			onClick={handleJump}
			aria-label="Jump to top of response"
			ref={iconRef}
		/>
	);
}
