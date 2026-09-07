import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	AcpClientPool,
	ACP_TEARDOWN_GRACE_MS,
	type AcpClientLike,
} from "../src/services/acp-client-pool";

function makeClient(): AcpClientLike {
	return {
		updateAutoAllow: vi.fn(),
		disconnect: vi.fn(async () => {}),
	};
}

describe("AcpClientPool", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	function makePool(create = makeClient) {
		return new AcpClientPool({
			create,
			setTimeoutFn: (fn, ms) =>
				setTimeout(fn, ms) as unknown as number,
			clearTimeoutFn: (id) => clearTimeout(id as unknown as NodeJS.Timeout),
		});
	}

	it("getOrCreate reuses the same client for a viewId", () => {
		const create = vi.fn(makeClient);
		const pool = makePool(create);
		const a = pool.getOrCreate("v1");
		const b = pool.getOrCreate("v1");
		expect(a).toBe(b);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it("updateAllAutoAllow fans out to every live client", () => {
		const pool = makePool();
		const c1 = pool.getOrCreate("v1");
		const c2 = pool.getOrCreate("v2");
		pool.updateAllAutoAllow(true);
		expect(c1.updateAutoAllow).toHaveBeenCalledWith(true);
		expect(c2.updateAutoAllow).toHaveBeenCalledWith(true);
	});

	it("remove disconnects and deletes the client", async () => {
		const pool = makePool();
		const client = pool.getOrCreate("v1");
		await pool.remove("v1");
		expect(client.disconnect).toHaveBeenCalledOnce();
		const next = pool.getOrCreate("v1");
		expect(next).not.toBe(client);
	});

	it("release does not disconnect until the grace window elapses", async () => {
		const pool = makePool();
		const client = pool.getOrCreate("v1");
		pool.release("v1");
		expect(client.disconnect).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS - 1);
		expect(client.disconnect).not.toHaveBeenCalled();
		await vi.advanceTimersByTimeAsync(1);
		expect(client.disconnect).toHaveBeenCalledOnce();
	});

	it("acquire during grace cancels the pending disconnect", async () => {
		const pool = makePool();
		const client = pool.getOrCreate("v1");
		pool.release("v1");
		pool.acquire("v1");
		await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS + 50);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(pool.getOrCreate("v1")).toBe(client);
	});

	it("second release while a timer is pending is a no-op", async () => {
		const pool = makePool();
		const client = pool.getOrCreate("v1");
		pool.release("v1");
		pool.release("v1");
		await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS);
		expect(client.disconnect).toHaveBeenCalledOnce();
	});

	it("clear cancels timers and disconnects remaining clients", async () => {
		const pool = makePool();
		const c1 = pool.getOrCreate("v1");
		const c2 = pool.getOrCreate("v2");
		pool.release("v1");
		await pool.clear();
		expect(c1.disconnect).toHaveBeenCalledOnce();
		expect(c2.disconnect).toHaveBeenCalledOnce();
		await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS);
		expect(c1.disconnect).toHaveBeenCalledOnce();
	});
});
