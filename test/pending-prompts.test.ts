import { describe, it, expect, vi, beforeEach } from "vitest";
import { PendingPrompts } from "../src/services/pending-prompts";

describe("PendingPrompts", () => {
	let broker: PendingPrompts;

	beforeEach(() => {
		broker = new PendingPrompts();
	});

	it("delivers synchronously when a handler is already registered", () => {
		const handler = vi.fn();
		broker.register("v1", handler);
		broker.deliver("v1", "hello", true);
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith("hello", true);
	});

	it("queues then drains in order when the handler registers later", () => {
		broker.deliver("v1", "first", false);
		broker.deliver("v1", "second", true);
		const handler = vi.fn();
		broker.register("v1", handler);
		expect(handler).toHaveBeenCalledTimes(2);
		expect(handler).toHaveBeenNthCalledWith(1, "first", false);
		expect(handler).toHaveBeenNthCalledWith(2, "second", true);
	});

	it("queues again after unregister until a new handler registers", () => {
		const handler = vi.fn();
		const unregister = broker.register("v1", handler);
		unregister();
		broker.deliver("v1", "queued", true);
		expect(handler).not.toHaveBeenCalled();
		const next = vi.fn();
		broker.register("v1", next);
		expect(next).toHaveBeenCalledWith("queued", true);
	});

	it("stale-handler unregister is a no-op when a newer handler is registered", () => {
		const first = vi.fn();
		const unregisterFirst = broker.register("v1", first);
		const second = vi.fn();
		broker.register("v1", second);
		unregisterFirst();
		broker.deliver("v1", "keep", false);
		expect(second).toHaveBeenCalledWith("keep", false);
		expect(first).not.toHaveBeenCalled();
	});

	it("replacing a handler routes future delivers to the new one", () => {
		const first = vi.fn();
		broker.register("v1", first);
		const second = vi.fn();
		broker.register("v1", second);
		broker.deliver("v1", "x", true);
		expect(second).toHaveBeenCalledWith("x", true);
		expect(first).not.toHaveBeenCalled();
	});

	it("clear drops queued prompts so a later register does not replay them", () => {
		broker.deliver("v1", "lost", true);
		broker.clear();
		const handler = vi.fn();
		broker.register("v1", handler);
		expect(handler).not.toHaveBeenCalled();
	});
});
