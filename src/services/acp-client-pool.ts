/**
 * Per-view AcpClient pool with graceful teardown for embedded remount churn.
 *
 * Inject factory, disconnect, and timers so unit tests do not touch real
 * AcpClient or window.
 */

export const ACP_TEARDOWN_GRACE_MS = 250;

export interface AcpClientLike {
	updateAutoAllow(autoAllow: boolean): void;
	disconnect(): Promise<void>;
}

export interface AcpClientPoolOptions<T extends AcpClientLike> {
	create: () => T;
	/** Defaults to client.disconnect() */
	disconnect?: (client: T) => Promise<void>;
	setTimeoutFn?: (fn: () => void, ms: number) => number;
	clearTimeoutFn?: (id: number) => void;
	graceMs?: number;
	onDisconnectError?: (viewId: string, error: unknown) => void;
}

export class AcpClientPool<T extends AcpClientLike> {
	private clients = new Map<string, T>();
	private teardownTimers = new Map<string, number>();
	private readonly create: () => T;
	private readonly disconnectClient: (client: T) => Promise<void>;
	private readonly setTimeoutFn: (fn: () => void, ms: number) => number;
	private readonly clearTimeoutFn: (id: number) => void;
	private readonly graceMs: number;
	private readonly onDisconnectError?: (viewId: string, error: unknown) => void;

	constructor(options: AcpClientPoolOptions<T>) {
		this.create = options.create;
		this.disconnectClient =
			options.disconnect ?? ((client) => client.disconnect());
		this.setTimeoutFn =
			options.setTimeoutFn ??
			((fn, ms) => window.setTimeout(fn, ms) as unknown as number);
		this.clearTimeoutFn =
			options.clearTimeoutFn ?? ((id) => window.clearTimeout(id));
		this.graceMs = options.graceMs ?? ACP_TEARDOWN_GRACE_MS;
		this.onDisconnectError = options.onDisconnectError;
	}

	getOrCreate(viewId: string): T {
		let client = this.clients.get(viewId);
		if (!client) {
			client = this.create();
			this.clients.set(viewId, client);
		}
		return client;
	}

	updateAllAutoAllow(autoAllow: boolean): void {
		for (const client of this.clients.values()) {
			client.updateAutoAllow(autoAllow);
		}
	}

	async remove(viewId: string): Promise<void> {
		const client = this.clients.get(viewId);
		if (!client) return;
		try {
			await this.disconnectClient(client);
		} catch (error) {
			this.onDisconnectError?.(viewId, error);
		}
		this.clients.delete(viewId);
	}

	/** Cancel a pending graceful teardown (called on remount). */
	acquire(viewId: string): void {
		const timer = this.teardownTimers.get(viewId);
		if (timer !== undefined) {
			this.clearTimeoutFn(timer);
			this.teardownTimers.delete(viewId);
		}
	}

	/**
	 * Schedule graceful teardown. A re-acquire within the grace window cancels
	 * it. A second release while a timer is pending is a no-op.
	 */
	release(viewId: string): void {
		if (this.teardownTimers.has(viewId)) return;
		const timer = this.setTimeoutFn(() => {
			this.teardownTimers.delete(viewId);
			void this.remove(viewId);
		}, this.graceMs);
		this.teardownTimers.set(viewId, timer);
	}

	/** Cancel timers and disconnect all clients (plugin unload / quit). */
	async clear(): Promise<void> {
		for (const timer of this.teardownTimers.values()) {
			this.clearTimeoutFn(timer);
		}
		this.teardownTimers.clear();
		const ids = Array.from(this.clients.keys());
		await Promise.all(ids.map((id) => this.remove(id)));
	}

	/** Fire-and-forget disconnect for quit paths that must not block. */
	disconnectAllFireAndForget(): void {
		for (const timer of this.teardownTimers.values()) {
			this.clearTimeoutFn(timer);
		}
		this.teardownTimers.clear();
		for (const [viewId, client] of this.clients) {
			this.disconnectClient(client).catch((error) => {
				this.onDisconnectError?.(viewId, error);
			});
		}
		this.clients.clear();
	}
}
