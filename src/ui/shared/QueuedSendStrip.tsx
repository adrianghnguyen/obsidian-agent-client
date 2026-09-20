import * as React from "react";
import { useRef, useEffect } from "react";
import { setIcon } from "obsidian";
import type { QueuedComposerSend } from "../../services/composer-send-queue";
import { summarizeQueuedSend } from "../../services/composer-send-queue";

interface QueuedSendStripProps {
	items: QueuedComposerSend[];
	onCancel: (id: string) => void;
}

function CancelQueuedSendButton({
	id,
	onCancel,
}: {
	id: string;
	onCancel: (id: string) => void;
}) {
	const ref = useRef<HTMLButtonElement>(null);
	useEffect(() => {
		if (ref.current) setIcon(ref.current, "x");
	}, []);
	return (
		<button
			ref={ref}
			type="button"
			className="agent-client-queued-send-cancel"
			onClick={() => onCancel(id)}
			title="Cancel queued message"
			aria-label="Cancel queued message"
		/>
	);
}

/**
 * Compact FIFO of composer submits waiting for harness ready / turn idle.
 */
export function QueuedSendStrip({ items, onCancel }: QueuedSendStripProps) {
	if (items.length === 0) return null;

	return (
		<div
			className="agent-client-queued-send-strip"
			role="list"
			aria-label="Queued messages"
		>
			{items.map((item) => (
				<div
					key={item.id}
					className="agent-client-queued-send-item"
					role="listitem"
				>
					<span className="agent-client-queued-send-label">
						{summarizeQueuedSend(item)}
					</span>
					<CancelQueuedSendButton id={item.id} onCancel={onCancel} />
				</div>
			))}
		</div>
	);
}
