/**
 * Functional: two chats share a registry, a client pool, and a prompt bus.
 * Closing or focusing one must not drop the other's client, unread, or prompt.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AcpClientPool, ACP_TEARDOWN_GRACE_MS } from "../../src/services/acp-client-pool";
import { PendingPrompts } from "../../src/services/pending-prompts";
import {
	ChatViewRegistry,
	type IChatViewContainer,
	type SessionStatus,
} from "../../src/services/view-registry";

interface FakeClient {
	id: number;
	updateAutoAllow: ReturnType<typeof vi.fn>;
	disconnect: ReturnType<typeof vi.fn>;
}

function makeView(
	viewId: string,
	viewType: "sidebar" | "floating",
	status: SessionStatus = "ready",
): IChatViewContainer {
	return {
		viewId,
		viewType,
		getDisplayName: () => viewId,
		onActivate: vi.fn(),
		onDeactivate: vi.fn(),
		focus: vi.fn(),
		hasFocus: () => false,
		isExpanded: () => true,
		expand: vi.fn(),
		collapse: vi.fn(),
		getInputState: () => null,
		setInputState: vi.fn(),
		canSend: () => false,
		sendMessage: vi.fn(async () => false),
		cancelOperation: vi.fn(async () => {}),
		openSessionHistory: vi.fn(),
		getSessionStatus: () => status,
		isAwaitingReply: () => false,
		getSessionTitle: () => "New session",
		getSessionId: () => null,
		closeContainer: vi.fn(),
		getContainerEl: () => ({}) as HTMLElement,
	};
}

describe("multi-view isolation", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("gives each view its own client and tears down only the one that closed", async () => {
		let seq = 0;
		const pool = new AcpClientPool<FakeClient>({
			create: () => ({
				id: ++seq,
				updateAutoAllow: vi.fn(),
				disconnect: vi.fn(async () => {}),
			}),
			setTimeoutFn: (fn, ms) => setTimeout(fn, ms) as unknown as number,
			clearTimeoutFn: (id) => clearTimeout(id),
		});
		const registry = new ChatViewRegistry();
		const docked = makeView("dock-1", "sidebar", "ready");
		const floating = makeView("float-1", "floating", "busy");
		registry.register(docked);
		registry.register(floating);

		const dockClient = pool.getOrCreate(docked.viewId);
		const floatClient = pool.getOrCreate(floating.viewId);
		expect(dockClient).not.toBe(floatClient);

		registry.setFocused(floating.viewId);
		expect(docked.onDeactivate).toHaveBeenCalled();
		expect(floating.onActivate).toHaveBeenCalled();
		expect(dockClient.disconnect).not.toHaveBeenCalled();
		expect(floatClient.disconnect).not.toHaveBeenCalled();

		registry.markUnread(docked.viewId);
		registry.markUnread(floating.viewId);
		registry.setFocused(docked.viewId);
		expect(registry.isUnread(docked.viewId)).toBe(false);
		expect(registry.isUnread(floating.viewId)).toBe(true);
		expect(registry.countUnread()).toBe(1);
		expect(registry.countBusy()).toBe(1);

		registry.toType("floating", (view) => {
			void view.sendMessage();
		});
		expect(floating.sendMessage).toHaveBeenCalledOnce();
		expect(docked.sendMessage).not.toHaveBeenCalled();

		pool.updateAllAutoAllow(true);
		expect(dockClient.updateAutoAllow).toHaveBeenCalledWith(true);
		expect(floatClient.updateAutoAllow).toHaveBeenCalledWith(true);

		registry.unregister(floating.viewId);
		pool.release(floating.viewId);
		expect(registry.get(floating.viewId)).toBeNull();
		expect(registry.get(docked.viewId)).toBe(docked);
		expect(pool.getOrCreate(floating.viewId)).toBe(floatClient);

		await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS);
		expect(floatClient.disconnect).toHaveBeenCalledOnce();
		expect(dockClient.disconnect).not.toHaveBeenCalled();
		expect(pool.getOrCreate(docked.viewId)).toBe(dockClient);
		expect(pool.getOrCreate(floating.viewId).id).not.toBe(floatClient.id);
	});

	it("cancels teardown when the same view mounts again inside the grace window", async () => {
		const pool = new AcpClientPool<FakeClient>({
			create: () => ({
				id: 1,
				updateAutoAllow: vi.fn(),
				disconnect: vi.fn(async () => {}),
			}),
			setTimeoutFn: (fn, ms) => setTimeout(fn, ms) as unknown as number,
			clearTimeoutFn: (id) => clearTimeout(id),
		});
		const client = pool.getOrCreate("float-1");
		pool.release("float-1");
		pool.acquire("float-1");
		await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS);
		expect(client.disconnect).not.toHaveBeenCalled();
		expect(pool.getOrCreate("float-1")).toBe(client);
	});

	it("delivers a pending prompt only to the view that owns that id", () => {
		const prompts = new PendingPrompts();
		const seen: Record<string, string[]> = { "dock-1": [], "float-1": [] };

		prompts.deliver("float-1", "from the note", true);
		prompts.deliver("dock-1", "dock only", false);

		const unregisterFloat = prompts.register("float-1", (prompt) => {
			seen["float-1"].push(prompt);
		});
		prompts.register("dock-1", (prompt) => {
			seen["dock-1"].push(prompt);
		});

		expect(seen["float-1"]).toEqual(["from the note"]);
		expect(seen["dock-1"]).toEqual(["dock only"]);

		prompts.deliver("float-1", "second", true);
		expect(seen["float-1"]).toEqual(["from the note", "second"]);
		expect(seen["dock-1"]).toEqual(["dock only"]);

		unregisterFloat();
		prompts.deliver("float-1", "after close", true);
		prompts.clear();
		prompts.register("float-1", (prompt) => {
			seen["float-1"].push(prompt);
		});
		expect(seen["float-1"]).toEqual(["from the note", "second"]);
	});
});
