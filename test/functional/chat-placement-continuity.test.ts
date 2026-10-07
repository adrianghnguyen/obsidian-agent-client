/**
 * Functional continuity for floating chat vs docked chat.
 *
 * Tier: Vitest integration — the highest automated tier in this repo
 * (obsidian-plugin-testing). These tests do not boot Obsidian.
 *
 * Strategy: merge this suite to main before PR #65. moveWithHarness runs
 * on main and drives the real AcpClientPool and ChatViewRegistry. The
 * ChatPlacementHost cases stay skipped until placement ships in #65 after
 * rebase (that PR adds src/services/chat-placement-host.ts). They do not
 * wait for #65 to land first.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AttachedFile } from "../../src/types/chat";
import { ACP_TEARDOWN_GRACE_MS } from "../../src/services/acp-client-pool";
import { ChatViewRegistry } from "../../src/services/view-registry";
import {
	CONNECTING_NOTICE,
	FLOATING_DISABLED_NOTICE,
	MOVE_FAILED_NOTICE,
	bindHarness,
	bindProductionHost,
	createWorld,
	destination,
	loadProductionHost,
	modelFor,
	openChat,
	type ContinuityWorld,
	type PlacementDriver,
	type ProductionHostModule,
} from "./placement-continuity-harness";

const noteFile: AttachedFile = {
	id: "file-a",
	kind: "file",
	mimeType: "text/markdown",
	name: "A.md",
	path: "Notes/A.md",
};

const hostModule: ProductionHostModule | null = await loadProductionHost();

function makeView(viewId: string, viewType: "sidebar" | "floating") {
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
		getSessionStatus: () => "disconnected" as const,
		isAwaitingReply: () => false,
		getSessionTitle: () => "New session",
		getSessionId: () => null,
		closeContainer: vi.fn(),
		getContainerEl: () => ({}) as HTMLElement,
	};
}

describe("registry handoff", () => {
	it("drops a same-id replacement when close uses unregister", () => {
		const registry = new ChatViewRegistry();
		const source = makeView("floating-chat-1", "floating");
		const dest = makeView("floating-chat-1", "sidebar");
		registry.register(source);
		registry.register(dest);
		registry.unregister(source.viewId);
		expect(registry.get("floating-chat-1")).toBeNull();
	});

	it("keeps the replacement when close uses unregisterInstance", () => {
		const registry = new ChatViewRegistry();
		const source = makeView("floating-chat-1", "floating");
		const dest = makeView("floating-chat-1", "sidebar");
		registry.register(source);
		registry.register(dest);
		registry.unregisterInstance(source);
		expect(registry.get("floating-chat-1")).toBe(dest);
		expect(source.onDeactivate).not.toHaveBeenCalled();
		expect(registry.get("floating-chat-1")?.viewType).toBe("sidebar");
	});
});

function registerContinuitySuite(
	title: string,
	enabled: boolean,
	createDriver: (world: ContinuityWorld) => PlacementDriver,
): void {
	describe.skipIf(!enabled)(title, () => {
		let world: ContinuityWorld;
		let driver: PlacementDriver;

		beforeEach(() => {
			vi.useFakeTimers();
			world = createWorld();
			driver = createDriver(world);
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("keeps the ACP client and transcript when a connected chat docks", async () => {
			const inflight = Promise.resolve();
			const { model: source } = openChat(world, {
				viewId: "floating-chat-1",
				viewType: "floating",
				sessionState: "ready",
				initialized: true,
				sessionId: "sess-live",
				inputText: "still typing",
				files: [noteFile],
				queued: [{ id: "q1", text: "send later", files: [] }],
				isSending: true,
				messageText: "hello session",
				cwd: "/vault/notes",
			});
			source.client.inflight = inflight;
			const { view: sibling, model: siblingModel } = openChat(world, {
				viewId: "floating-chat-2",
				viewType: "floating",
				sessionState: "ready",
				initialized: true,
				sessionId: "sess-other",
				inputText: "other tab",
			});

			await expect(driver.dock("floating-chat-1", "right")).resolves.toBe(
				true,
			);

			const placed = destination(world);
			expect(placed.view.viewId).toBe("floating-chat-1");
			expect(placed.view.viewType).toBe("sidebar");
			expect(world.registry.get("floating-chat-1")).toBe(placed.view);
			expect(placed.client).toBe(source.client);
			expect(placed.client.token).toBe(source.client.token);
			expect(placed.client.inflight).toBe(inflight);
			expect(placed.sessionId).toBe("sess-live");
			expect(placed.sessionState).toBe("ready");
			expect(placed.isSending).toBe(true);
			expect(placed.cwd).toBe("/vault/notes");
			expect(placed.messages[0]?.content).toEqual([
				{ type: "text", text: "hello session" },
			]);
			expect(placed.input.text).toBe("still typing");
			expect(placed.input.files.map((file) => file.path)).toEqual([
				"Notes/A.md",
			]);
			expect(placed.queuedSends.map((item) => item.text)).toEqual([
				"send later",
			]);
			expect(source.client.disconnect).not.toHaveBeenCalled();
			expect(world.lastOpen).toEqual({ kind: "dock", target: "right" });

			expect(world.registry.get("floating-chat-2")).toBe(sibling);
			expect(sibling.viewType).toBe("floating");
			expect(siblingModel.client.disconnect).not.toHaveBeenCalled();
			expect(siblingModel.input.text).toBe("other tab");
			expect(siblingModel.sessionId).toBe("sess-other");
			expect(
				world.registry.getByType("floating").map((view) => view.viewId),
			).toEqual(["floating-chat-2"]);

			await vi.advanceTimersByTimeAsync(ACP_TEARDOWN_GRACE_MS + 50);
			expect(source.client.disconnect).not.toHaveBeenCalled();
			expect(world.pool.getOrCreate("floating-chat-1")).toBe(
				source.client,
			);
		});

		it("keeps the same client when a busy docked chat floats", async () => {
			const { model: source } = openChat(world, {
				viewId: "leaf-1",
				viewType: "sidebar",
				sessionState: "busy",
				initialized: true,
				sessionId: "sess-busy",
				inputText: "mid turn",
				isSending: true,
				messageText: "working",
			});

			await expect(driver.float("leaf-1")).resolves.toBe(true);

			const placed = destination(world);
			expect(placed.view.viewId).toBe("leaf-1");
			expect(placed.view.viewType).toBe("floating");
			expect(placed.client).toBe(source.client);
			expect(placed.sessionId).toBe("sess-busy");
			expect(placed.isSending).toBe(true);
			expect(placed.input.text).toBe("mid turn");
			expect(source.client.disconnect).not.toHaveBeenCalled();
			expect(world.registry.getByType("sidebar")).toHaveLength(0);
		});

		it("copies the composer onto a new client when the chat is not connected", async () => {
			const { view: sourceView, model: source } = openChat(world, {
				viewId: "floating-chat-9",
				viewType: "floating",
				sessionState: "disconnected",
				initialized: false,
				sessionId: "stale-session",
				inputText: "draft only",
				files: [noteFile],
				queued: [
					{ id: "q-draft", text: "queued draft", files: [noteFile] },
				],
				messageText: "should not hydrate",
				cwd: "/vault/drafts",
			});
			const { model: sibling } = openChat(world, {
				viewId: "floating-chat-10",
				viewType: "floating",
				sessionState: "ready",
				initialized: true,
				sessionId: "sess-stay",
				inputText: "leave me",
			});

			await expect(
				driver.dock("floating-chat-9", "editor"),
			).resolves.toBe(true);

			const placed = destination(world);
			expect(placed.view.viewId).not.toBe(sourceView.viewId);
			expect(placed.view.viewType).toBe("sidebar");
			expect(placed.client).not.toBe(source.client);
			expect(placed.client.initialized).toBe(false);
			expect(placed.sessionId).toBeNull();
			expect(placed.messages).toEqual([]);
			expect(placed.isSending).toBe(false);
			expect(placed.cwd).toBe("/vault/drafts");
			expect(placed.input.text).toBe("draft only");
			expect(placed.input.files[0]?.path).toBe("Notes/A.md");
			expect(placed.queuedSends[0]?.text).toBe("queued draft");
			expect(placed.queuedSends[0]?.files[0]?.path).toBe("Notes/A.md");
			expect(world.registry.get(sourceView.viewId)).toBeNull();
			expect(source.client.disconnect).toHaveBeenCalledOnce();
			expect(sibling.client.disconnect).not.toHaveBeenCalled();
			const stayed = world.registry.get("floating-chat-10");
			expect(stayed?.viewType).toBe("floating");
			if (!stayed) return;
			expect(modelFor(world, stayed).input.text).toBe("leave me");
			expect(world.lastOpen).toEqual({ kind: "dock", target: "editor" });

			placed.input.files.push({
				id: "extra",
				kind: "file",
				mimeType: "text/plain",
				name: "B.txt",
				path: "Notes/B.txt",
			});
			expect(source.input.files).toHaveLength(1);
		});

		it("refuses to move a chat that is still connecting", async () => {
			const { view, model } = openChat(world, {
				viewId: "floating-chat-3",
				viewType: "floating",
				sessionState: "initializing",
				initialized: true,
				sessionId: null,
				inputText: "wait",
			});

			await expect(driver.dock("floating-chat-3", "left")).resolves.toBe(
				false,
			);

			expect(world.notices).toEqual([CONNECTING_NOTICE]);
			expect(world.registry.get("floating-chat-3")).toBe(view);
			expect(view.viewType).toBe("floating");
			expect(world.registry.getAll()).toHaveLength(1);
			expect(model.client.disconnect).not.toHaveBeenCalled();
			expect(world.lastDestination).toBeNull();
			expect(world.pool.getOrCreate("floating-chat-3")).toBe(
				model.client,
			);
		});

		it("refuses to move a chat that is still authenticating", async () => {
			const { view } = openChat(world, {
				viewId: "leaf-auth",
				viewType: "sidebar",
				sessionState: "authenticating",
				initialized: true,
				sessionId: null,
				inputText: "login",
			});

			await expect(driver.float("leaf-auth")).resolves.toBe(false);
			expect(world.notices).toEqual([CONNECTING_NOTICE]);
			expect(world.registry.get("leaf-auth")).toBe(view);
			expect(world.lastDestination).toBeNull();
		});

		it("leaves the source in place when the destination cannot open", async () => {
			const { view, model } = openChat(world, {
				viewId: "floating-chat-4",
				viewType: "floating",
				sessionState: "ready",
				initialized: true,
				sessionId: "sess-keep",
				inputText: "stay",
			});
			world.failNextOpen = true;

			await expect(driver.dock("floating-chat-4", "right")).resolves.toBe(
				false,
			);

			expect(world.notices).toEqual([MOVE_FAILED_NOTICE]);
			expect(world.registry.get("floating-chat-4")).toBe(view);
			expect(model.client.disconnect).not.toHaveBeenCalled();
			expect(model.sessionId).toBe("sess-keep");
			expect(world.lastDestination).toBeNull();
			expect(world.registry.getAll()).toHaveLength(1);
		});

		it("does not float when floating chat is disabled", async () => {
			const { view, model } = openChat(world, {
				viewId: "leaf-off",
				viewType: "sidebar",
				sessionState: "ready",
				initialized: true,
				sessionId: "sess-off",
				inputText: "docked",
			});
			world.floatingEnabled = false;

			await expect(driver.float("leaf-off")).resolves.toBe(false);
			expect(world.notices).toEqual([FLOATING_DISABLED_NOTICE]);
			expect(world.registry.get("leaf-off")).toBe(view);
			expect(model.client.disconnect).not.toHaveBeenCalled();
			expect(world.lastDestination).toBeNull();
		});

		it("ignores a dock request for a chat that is already docked", async () => {
			const { view, model } = openChat(world, {
				viewId: "leaf-already",
				viewType: "sidebar",
				sessionState: "ready",
				initialized: true,
				sessionId: "sess-docked",
				inputText: "here",
			});

			await expect(driver.dock("leaf-already", "left")).resolves.toBe(
				false,
			);
			expect(world.notices).toEqual([]);
			expect(world.registry.get("leaf-already")).toBe(view);
			expect(model.client.disconnect).not.toHaveBeenCalled();
		});
	});
}

registerContinuitySuite(
	"harness move against the real pool and registry",
	true,
	(world) => bindHarness(world),
);

registerContinuitySuite(
	"ChatPlacementHost wired to the real pool and registry — enabled when placement ships in #65 after rebase",
	hostModule !== null,
	(world) => {
		if (!hostModule) {
			throw new Error("ChatPlacementHost suite ran without the module");
		}
		return bindProductionHost(world, hostModule);
	},
);
