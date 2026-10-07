import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ChatSession } from "../src/types/session";
import {
	type ChatPlacementSnapshot,
	armNextSidebarAdoption,
	claimNextSidebarAdoption,
	disarmNextSidebarAdoption,
	dockTargetFromElement,
	peekPlacementHandoff,
	placementKeepsClient,
	releasePlacementHandoff,
	resetPlacementStateForTests,
	resolvePlacementDrop,
	stashPlacementHandoff,
	type PlacementHitTarget,
} from "../src/services/chat-placement";
import { ChatPlacementHost } from "../src/services/chat-placement-host";

function snapshot(
	overrides: Partial<ChatPlacementSnapshot> = {},
): ChatPlacementSnapshot {
	const session = {
		sessionId: "s1",
		state: "ready",
		agentId: "cursor",
		agentDisplayName: "Cursor",
		authMethods: [],
		createdAt: new Date(),
		lastActivityAt: new Date(),
		workingDirectory: "/vault",
	} as ChatSession;
	return {
		sourceViewId: "floating-chat-1",
		reuseClient: true,
		agentId: "cursor",
		cwd: "/vault",
		session,
		messages: [],
		isSending: false,
		input: { text: "draft", files: [] },
		queuedSends: [],
		blockedReason: null,
		...overrides,
	};
}

function hit(classNames: string[]): PlacementHitTarget {
	const target: PlacementHitTarget = {
		closest(selector: string): PlacementHitTarget | null {
			const parts = selector.split(",").map((part) => part.trim());
			const matched = classNames.some((name) =>
				parts.some(
					(part) => part === `.${name}` || part.endsWith(name),
				),
			);
			return matched ? target : null;
		},
	};
	return target;
}

describe("chat placement", () => {
	beforeEach(() => {
		resetPlacementStateForTests();
	});

	it("stashes a handoff until it is released", () => {
		const snap = snapshot();
		stashPlacementHandoff(snap);
		expect(peekPlacementHandoff("floating-chat-1")).toBe(snap);
		releasePlacementHandoff("floating-chat-1");
		expect(peekPlacementHandoff("floating-chat-1")).toBeNull();
	});

	it("claims the next sidebar view id only once", () => {
		armNextSidebarAdoption("floating-chat-1");
		expect(claimNextSidebarAdoption()).toBe("floating-chat-1");
		expect(claimNextSidebarAdoption()).toBeNull();
		armNextSidebarAdoption("floating-chat-2");
		disarmNextSidebarAdoption();
		expect(claimNextSidebarAdoption()).toBeNull();
	});

	it("keeps the client only for a live, connected move", () => {
		expect(placementKeepsClient(snapshot())).toBe(true);
		expect(placementKeepsClient(snapshot({ reuseClient: false }))).toBe(
			false,
		);
		expect(
			placementKeepsClient(
				snapshot({ blockedReason: "still connecting" }),
			),
		).toBe(false);
	});

	it("docks a floating drag onto the sidebar or editor, not onto a floating window", () => {
		const drag = { viewId: "floating-chat-1", origin: "floating" as const };
		expect(dockTargetFromElement(hit(["mod-right-split"]))).toBe("right");
		expect(dockTargetFromElement(hit(["mod-left-split"]))).toBe("left");
		expect(dockTargetFromElement(hit(["mod-root"]))).toBe("editor");
		expect(
			dockTargetFromElement(hit(["agent-client-floating-window"])),
		).toBeNull();
		expect(resolvePlacementDrop(drag, hit(["mod-right-split"]))).toEqual({
			kind: "dock",
			viewId: "floating-chat-1",
			dock: "right",
		});
		expect(
			resolvePlacementDrop(drag, hit(["agent-client-floating-window"])),
		).toBeNull();
	});

	it("floats a sidebar drag dropped on a floating window", () => {
		expect(
			resolvePlacementDrop(
				{ viewId: "leaf-1", origin: "sidebar" },
				hit(["agent-client-floating-window"]),
			),
		).toEqual({ kind: "float", viewId: "leaf-1" });
		expect(
			resolvePlacementDrop(
				{ viewId: "leaf-1", origin: "sidebar" },
				hit(["mod-root"]),
			),
		).toBeNull();
	});

	it("docks one floating chat into the requested pane", async () => {
		const snap = snapshot();
		const closeContainer = vi.fn();
		const notice = vi.fn();
		const openSidebar = vi.fn(async () => {});
		const host = new ChatPlacementHost({
			getView: () => ({
				viewId: snap.sourceViewId,
				viewType: "floating",
				preparePlacementMove: () => snap,
				closeContainer,
			}),
			isFloatingEnabled: () => true,
			notice,
			openSidebar,
			openFloating: vi.fn(),
		});

		await expect(host.dock(snap.sourceViewId, "right")).resolves.toBe(true);
		expect(openSidebar).toHaveBeenCalledWith(snap, "right");
		expect(closeContainer).toHaveBeenCalledOnce();
		expect(openSidebar.mock.invocationCallOrder[0]).toBeLessThan(
			closeContainer.mock.invocationCallOrder[0],
		);
		expect(peekPlacementHandoff(snap.sourceViewId)).toBe(snap);
		expect(notice).not.toHaveBeenCalled();
	});

	it("does not close a chat that is still connecting", async () => {
		const snap = snapshot({
			blockedReason:
				"[Agent Client] Wait for this chat to finish connecting before moving it.",
		});
		const closeContainer = vi.fn();
		const notice = vi.fn();
		const host = new ChatPlacementHost({
			getView: () => ({
				viewId: snap.sourceViewId,
				viewType: "floating",
				preparePlacementMove: () => snap,
				closeContainer,
			}),
			isFloatingEnabled: () => true,
			notice,
			openSidebar: vi.fn(async () => {}),
			openFloating: vi.fn(),
		});

		await expect(host.dock(snap.sourceViewId)).resolves.toBe(false);
		expect(closeContainer).not.toHaveBeenCalled();
		expect(notice).toHaveBeenCalledWith(snap.blockedReason);
		expect(peekPlacementHandoff(snap.sourceViewId)).toBeNull();
	});

	it("floats a docked chat when floating chat is enabled", async () => {
		const snap = snapshot({ sourceViewId: "leaf-1" });
		const closeContainer = vi.fn();
		const openFloating = vi.fn();
		const host = new ChatPlacementHost({
			getView: () => ({
				viewId: "leaf-1",
				viewType: "sidebar",
				preparePlacementMove: () => snap,
				closeContainer,
			}),
			isFloatingEnabled: () => true,
			notice: vi.fn(),
			openSidebar: vi.fn(async () => {}),
			openFloating,
		});

		await expect(host.float("leaf-1")).resolves.toBe(true);
		expect(closeContainer).toHaveBeenCalledOnce();
		expect(openFloating).toHaveBeenCalledWith(snap);
	});

	it("refuses to float when floating chat is disabled", async () => {
		const closeContainer = vi.fn();
		const notice = vi.fn();
		const host = new ChatPlacementHost({
			getView: () => ({
				viewId: "leaf-1",
				viewType: "sidebar",
				preparePlacementMove: () =>
					snapshot({ sourceViewId: "leaf-1" }),
				closeContainer,
			}),
			isFloatingEnabled: () => false,
			notice,
			openSidebar: vi.fn(async () => {}),
			openFloating: vi.fn(),
		});

		await expect(host.float("leaf-1")).resolves.toBe(false);
		expect(closeContainer).not.toHaveBeenCalled();
		expect(notice).toHaveBeenCalledWith(
			"[Agent Client] Floating chat is disabled in settings.",
		);
	});

	it("releases the handoff when opening the destination fails", async () => {
		const snap = snapshot();
		const notice = vi.fn();
		const closeContainer = vi.fn();
		const host = new ChatPlacementHost({
			getView: () => ({
				viewId: snap.sourceViewId,
				viewType: "floating",
				preparePlacementMove: () => snap,
				closeContainer,
			}),
			isFloatingEnabled: () => true,
			notice,
			openSidebar: vi.fn(async () => {
				throw new Error("no leaf");
			}),
			openFloating: vi.fn(),
		});

		await expect(host.dock(snap.sourceViewId, "editor")).resolves.toBe(
			false,
		);
		expect(closeContainer).not.toHaveBeenCalled();
		expect(peekPlacementHandoff(snap.sourceViewId)).toBeNull();
		expect(notice).toHaveBeenCalledWith(
			"[Agent Client] Couldn't move this chat.",
		);
	});
});
