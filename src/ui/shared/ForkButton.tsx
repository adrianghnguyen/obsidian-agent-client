import * as React from "react";
const { useCallback } = React;
import { setIcon } from "obsidian";

/**
 * Fork this message into a new sibling chat.
 * Uses the same action-button styling as CopyButton (fade-in via parent).
 */
export function ForkButton({
	disabled,
	onClick,
}: {
	disabled?: boolean;
	onClick: () => void;
}) {
	const iconRef = useCallback((el: HTMLButtonElement | null) => {
		if (el) setIcon(el, "git-branch");
	}, []);

	const label = disabled
		? "Wait until this reply finishes"
		: "Fork into a new chat from here";

	return (
		<button
			className="clickable-icon agent-client-message-action-button"
			onClick={onClick}
			disabled={disabled}
			aria-label={label}
			title={label}
			ref={iconRef}
		/>
	);
}
