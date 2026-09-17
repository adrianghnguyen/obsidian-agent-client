import * as React from "react";
const { useState, useCallback } = React;
import { setIcon } from "obsidian";
import type { MessageContent } from "../../types/chat";
import { extractTextContent } from "../../utils/message-copy";

/**
 * Copy button that shows a check icon briefly after copying.
 * Uses callback ref for Obsidian's setIcon DOM manipulation.
 */
export function CopyButton({ contents }: { contents: MessageContent[] }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(() => {
		const text = extractTextContent(contents);
		if (!text) return;
		void navigator.clipboard
			.writeText(text)
			.then(() => {
				setCopied(true);
				window.setTimeout(() => setCopied(false), 2000);
			})
			.catch(() => {});
	}, [contents]);

	const iconRef = useCallback(
		(el: HTMLButtonElement | null) => {
			if (el) setIcon(el, copied ? "check" : "copy");
		},
		[copied],
	);

	return (
		<button
			className="clickable-icon agent-client-message-action-button"
			onClick={handleCopy}
			aria-label="Copy message"
			ref={iconRef}
		/>
	);
}
