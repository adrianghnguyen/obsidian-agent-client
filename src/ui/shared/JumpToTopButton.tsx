import * as React from "react";
const { useCallback } = React;
import { setIcon } from "obsidian";

/**
 * Scrolls the hovered assistant response to the top of the message list.
 * Uses the same action-button styling as CopyButton (fade-in via parent).
 *
 * Prefer scrolling `.agent-client-chat-view-messages` directly: Electron’s
 * scrollIntoView({ behavior: "smooth" }) often no-ops on this virtualized
 * overflow container.
 */
export function JumpToTopButton() {
	const handleJump = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			const target =
				event.currentTarget.closest(".agent-client-virtual-item") ??
				event.currentTarget.closest(".agent-client-message-renderer");
			if (!target) return;

			const container = event.currentTarget.closest(
				".agent-client-chat-view-messages",
			);
			if (container instanceof HTMLElement) {
				const delta =
					target.getBoundingClientRect().top -
					container.getBoundingClientRect().top;
				// Electron often no-ops scrollTo({ behavior: "smooth" }) on this
				// overflow scroller; assign scrollTop (instant) instead.
				container.scrollTop = container.scrollTop + delta;
				return;
			}

			target.scrollIntoView({ block: "start" });
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
