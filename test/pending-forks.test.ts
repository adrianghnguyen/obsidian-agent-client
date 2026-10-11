import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	PendingForks,
	type PendingForkPayload,
} from "../src/services/pending-forks";
import type { ChatMessage } from "../src/types/chat";

function payload(throughMessageId: string): PendingForkPayload {
	const messages: ChatMessage[] = [
		{
			id: throughMessageId,
			role: "user",
			content: [{ type: "text", text: "hi" }],
			timestamp: new Date(),
		},
	];
	return {
		messages,
		agentId: "cursor",
		cwd: "/vault",
		sourceTitle: "Session",
		throughMessageId,
	};
}

describe("PendingForks", () => {
	let broker: PendingForks;

	beforeEach(() => {
		broker = new PendingForks();
	});

	it("delivers synchronously when a handler is already registered", () => {
		const handler = vi.fn();
		broker.register("v1", handler);
		const item = payload("m1");
		broker.deliver("v1", item);
		expect(handler).toHaveBeenCalledOnce();
		expect(handler).toHaveBeenCalledWith(item);
	});

	it("queues then drains in order when the handler registers later", () => {
		const first = payload("a");
		const second = payload("b");
		broker.deliver("v1", first);
		broker.deliver("v1", second);
		const handler = vi.fn();
		broker.register("v1", handler);
		expect(handler).toHaveBeenCalledTimes(2);
		expect(handler).toHaveBeenNthCalledWith(1, first);
		expect(handler).toHaveBeenNthCalledWith(2, second);
	});

	it("does not deliver a source view's payload to a sibling view", () => {
		const source = vi.fn();
		const dest = vi.fn();
		broker.register("source", source);
		broker.register("dest", dest);
		const item = payload("m1");
		broker.deliver("dest", item);
		expect(dest).toHaveBeenCalledWith(item);
		expect(source).not.toHaveBeenCalled();
	});

	it("queues again after unregister until a new handler registers", () => {
		const handler = vi.fn();
		const unregister = broker.register("v1", handler);
		unregister();
		const item = payload("queued");
		broker.deliver("v1", item);
		expect(handler).not.toHaveBeenCalled();
		const next = vi.fn();
		broker.register("v1", next);
		expect(next).toHaveBeenCalledWith(item);
	});

	it("stale-handler unregister is a no-op when a newer handler is registered", () => {
		const first = vi.fn();
		const unregisterFirst = broker.register("v1", first);
		const second = vi.fn();
		broker.register("v1", second);
		unregisterFirst();
		const item = payload("keep");
		broker.deliver("v1", item);
		expect(second).toHaveBeenCalledWith(item);
		expect(first).not.toHaveBeenCalled();
	});

	it("clear drops queued payloads so a later register does not replay them", () => {
		broker.deliver("v1", payload("lost"));
		broker.clear();
		const handler = vi.fn();
		broker.register("v1", handler);
		expect(handler).not.toHaveBeenCalled();
	});
});
