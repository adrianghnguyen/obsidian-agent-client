/**
 * FIFO queue for composer submits that cannot go to the harness yet.
 *
 * ChatPanel holds the React state; this module is the drain/enqueue policy
 * (connecting, restoring, mid-turn, or session error).
 */

import type { AttachedFile } from "../types/chat";
import type { SessionState } from "../types/session";

export interface QueuedComposerSend {
	id: string;
	text: string;
	files: AttachedFile[];
}

export interface ComposerSendFlushGates {
	isSessionReady: boolean;
	isSending: boolean;
	isRestoringSession: boolean;
	sessionState: SessionState;
	/** Permission banner is showing — do not auto-flush the next queued prompt. */
	hasActivePermission: boolean;
}

let queuedSendSeq = 0;

export function createQueuedComposerSend(
	text: string,
	files?: AttachedFile[],
	id?: string,
): QueuedComposerSend {
	queuedSendSeq += 1;
	return {
		id: id ?? `queued-send-${queuedSendSeq}`,
		text: text.trim(),
		files: files && files.length > 0 ? [...files] : [],
	};
}

export function hasComposerSendPayload(
	text: string,
	files?: AttachedFile[],
): boolean {
	return text.trim() !== "" || (files?.length ?? 0) > 0;
}

export function canFlushComposerSend(gates: ComposerSendFlushGates): boolean {
	return (
		gates.isSessionReady &&
		!gates.isSending &&
		!gates.isRestoringSession &&
		!gates.hasActivePermission &&
		gates.sessionState !== "error"
	);
}

/** Chip X clicked — remember so a drain that already took this id still aborts. */
export function rememberCancelledComposerSend(
	cancelledIds: Set<string>,
	id: string,
): void {
	cancelledIds.add(id);
}

export function wasComposerSendCancelled(
	cancelledIds: ReadonlySet<string>,
	id: string,
): boolean {
	return cancelledIds.has(id);
}

export function forgetCancelledComposerSend(
	cancelledIds: Set<string>,
	id: string,
): void {
	cancelledIds.delete(id);
}

export function enqueueComposerSend(
	queue: readonly QueuedComposerSend[],
	item: QueuedComposerSend,
): QueuedComposerSend[] {
	return [...queue, item];
}

export function cancelComposerSend(
	queue: readonly QueuedComposerSend[],
	id: string,
): QueuedComposerSend[] {
	return queue.filter((item) => item.id !== id);
}

export function takeNextComposerSend(
	queue: readonly QueuedComposerSend[],
): { item: QueuedComposerSend; rest: QueuedComposerSend[] } | null {
	if (queue.length === 0) return null;
	const [item, ...rest] = queue;
	return { item, rest };
}

/** Pop the head item only when the session can take a prompt. */
export function takeFlushableComposerSend(
	queue: readonly QueuedComposerSend[],
	gates: ComposerSendFlushGates,
): { item: QueuedComposerSend; rest: QueuedComposerSend[] } | null {
	if (!canFlushComposerSend(gates)) return null;
	return takeNextComposerSend(queue);
}

export type ComposerSubmitResult =
	| { kind: "empty" }
	| { kind: "send"; item: QueuedComposerSend }
	| {
			kind: "enqueue";
			item: QueuedComposerSend;
			queue: QueuedComposerSend[];
	  };

/**
 * Composer / command-palette submit: send now if the harness is idle and
 * ready, otherwise append to the FIFO (Cursor cold start, Antigravity ACP
 * bridge, harness switch, or an in-flight turn).
 */
export function resolveComposerSubmit(
	queue: readonly QueuedComposerSend[],
	text: string,
	files: AttachedFile[] | undefined,
	gates: ComposerSendFlushGates,
): ComposerSubmitResult {
	if (!hasComposerSendPayload(text, files)) {
		return { kind: "empty" };
	}
	const item = createQueuedComposerSend(text, files);
	if (canFlushComposerSend(gates) && queue.length === 0) {
		return { kind: "send", item };
	}
	return {
		kind: "enqueue",
		item,
		queue: enqueueComposerSend(queue, item),
	};
}

export function summarizeQueuedSend(
	item: QueuedComposerSend,
	maxLength = 60,
): string {
	const text = item.text.trim();
	if (text) {
		return text.length <= maxLength
			? text
			: `${text.slice(0, maxLength - 1)}…`;
	}
	const count = item.files.length;
	if (count === 1) {
		return item.files[0]?.name ?? "1 file";
	}
	if (count > 1) {
		return `${count} files`;
	}
	return "Queued message";
}
