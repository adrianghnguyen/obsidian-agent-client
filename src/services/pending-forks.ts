/**
 * Deterministic pending-fork handshake between the source ChatPanel and the
 * sibling view that should receive the sliced transcript.
 *
 * Same shape as PendingPrompts: deliver now if a handler is registered for
 * the viewId, otherwise queue until register() drains it.
 */

import type { ChatMessage } from "../types/chat";

export interface PendingForkPayload {
	messages: ChatMessage[];
	agentId: string;
	cwd: string;
	sourceTitle: string;
	throughMessageId: string;
}

export type PendingForkHandler = (payload: PendingForkPayload) => void;

export class PendingForks {
	private handlers = new Map<string, PendingForkHandler>();
	private queues = new Map<string, PendingForkPayload[]>();

	/**
	 * Register a ChatPanel handler. Drains any queued payloads for this viewId
	 * synchronously. Returns an unregister that only removes this handler instance.
	 */
	register(viewId: string, handler: PendingForkHandler): () => void {
		this.handlers.set(viewId, handler);
		const queued = this.queues.get(viewId);
		if (queued) {
			this.queues.delete(viewId);
			for (const item of queued) {
				handler(item);
			}
		}
		return () => {
			if (this.handlers.get(viewId) === handler) {
				this.handlers.delete(viewId);
			}
		};
	}

	/**
	 * Deliver a payload now if a handler exists; otherwise queue for later drain.
	 */
	deliver(viewId: string, payload: PendingForkPayload): void {
		const handler = this.handlers.get(viewId);
		if (handler) {
			handler(payload);
			return;
		}
		const queue = this.queues.get(viewId);
		if (queue) {
			queue.push(payload);
		} else {
			this.queues.set(viewId, [payload]);
		}
	}

	/** Drop all handlers and queues (plugin onunload). */
	clear(): void {
		this.handlers.clear();
		this.queues.clear();
	}
}
