/**
 * Deterministic pending-prompt handshake between runPromptInChat and ChatPanel.
 *
 * Delivers immediately if a handler is registered for the viewId; otherwise
 * queues until register() drains the queue in order.
 */

export type PendingPromptHandler = (
	prompt: string,
	autoSend: boolean,
) => void;

export class PendingPrompts {
	private handlers = new Map<string, PendingPromptHandler>();
	private queues = new Map<
		string,
		Array<{ prompt: string; autoSend: boolean }>
	>();

	/**
	 * Register a ChatPanel handler. Drains any queued prompts for this viewId
	 * synchronously. Returns an unregister that only removes this handler instance.
	 */
	register(viewId: string, handler: PendingPromptHandler): () => void {
		this.handlers.set(viewId, handler);
		const queued = this.queues.get(viewId);
		if (queued) {
			this.queues.delete(viewId);
			for (const item of queued) {
				handler(item.prompt, item.autoSend);
			}
		}
		return () => {
			if (this.handlers.get(viewId) === handler) {
				this.handlers.delete(viewId);
			}
		};
	}

	/**
	 * Deliver a prompt now if a handler exists; otherwise queue for later drain.
	 */
	deliver(viewId: string, prompt: string, autoSend: boolean): void {
		const handler = this.handlers.get(viewId);
		if (handler) {
			handler(prompt, autoSend);
			return;
		}
		const queue = this.queues.get(viewId);
		if (queue) {
			queue.push({ prompt, autoSend });
		} else {
			this.queues.set(viewId, [{ prompt, autoSend }]);
		}
	}

	/** Drop all handlers and queues (plugin onunload). */
	clear(): void {
		this.handlers.clear();
		this.queues.clear();
	}
}
