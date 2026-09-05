import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	ChatViewRegistry,
	type IChatViewContainer,
	type ChatViewType,
} from "../src/services/view-registry";
import type { ChatInputState } from "../src/types/chat";

function makeView(
	viewId: string,
	viewType: ChatViewType = "sidebar",
): IChatViewContainer {
	return {
		viewId,
		viewType,
		getDisplayName: vi.fn(() => viewId),
		onActivate: vi.fn(),
		onDeactivate: vi.fn(),
		focus: vi.fn(),
		hasFocus: vi.fn(() => false),
		isExpanded: vi.fn(() => true),
		expand: vi.fn(),
		collapse: vi.fn(),
		getInputState: vi.fn((): ChatInputState | null => null),
		setInputState: vi.fn(),
		canSend: vi.fn(() => false),
		sendMessage: vi.fn(async () => false),
		cancelOperation: vi.fn(async () => {}),
		getSessionStatus: vi.fn(() => "disconnected" as const),
		getSessionTitle: vi.fn(() => "New session"),
		getSessionId: vi.fn(() => null),
		closeContainer: vi.fn(),
		getContainerEl: vi.fn(() => document.createElement("div")),
	};
}

describe("ChatViewRegistry", () => {
	let registry: ChatViewRegistry;

	beforeEach(() => {
		registry = new ChatViewRegistry();
	});

	it("focuses and activates the first registered view", () => {
		const a = makeView("a");
		registry.register(a);
		expect(registry.getFocusedId()).toBe("a");
		expect(a.onActivate).toHaveBeenCalledTimes(1);
	});

	it("does not steal focus when a later view registers", () => {
		const a = makeView("a");
		const b = makeView("b");
		registry.register(a);
		registry.register(b);
		expect(registry.getFocusedId()).toBe("a");
		expect(b.onActivate).not.toHaveBeenCalled();
	});

	it("moves focus to the first remaining view when the focused view unregisters", () => {
		const a = makeView("a");
		const b = makeView("b");
		registry.register(a);
		registry.register(b);
		registry.unregister("a");
		expect(a.onDeactivate).toHaveBeenCalled();
		expect(registry.getFocusedId()).toBe("b");
		expect(b.onActivate).toHaveBeenCalledTimes(1);
	});

	it("nulls focus when the last view unregisters", () => {
		const a = makeView("a");
		registry.register(a);
		registry.unregister("a");
		expect(registry.getFocusedId()).toBeNull();
		expect(registry.getFocused()).toBeNull();
	});

	it("setFocused deactivates previous and activates next", () => {
		const a = makeView("a");
		const b = makeView("b");
		registry.register(a);
		registry.register(b);
		registry.setFocused("b");
		expect(a.onDeactivate).toHaveBeenCalled();
		expect(b.onActivate).toHaveBeenCalledTimes(1);
		expect(registry.getFocusedId()).toBe("b");
	});

	it("setFocused ignores unknown ids and no-ops on the same id", () => {
		const a = makeView("a");
		registry.register(a);
		vi.clearAllMocks();
		registry.setFocused("missing");
		registry.setFocused("a");
		expect(a.onActivate).not.toHaveBeenCalled();
		expect(a.onDeactivate).not.toHaveBeenCalled();
		expect(registry.getFocusedId()).toBe("a");
	});

	it("focusNext and focusPrevious wrap and call focus()", () => {
		const a = makeView("a");
		const b = makeView("b");
		const c = makeView("c");
		registry.register(a);
		registry.register(b);
		registry.register(c);

		registry.focusNext();
		expect(registry.getFocusedId()).toBe("b");
		expect(b.focus).toHaveBeenCalled();

		registry.focusPrevious();
		expect(registry.getFocusedId()).toBe("a");
		expect(a.focus).toHaveBeenCalled();

		registry.focusPrevious();
		expect(registry.getFocusedId()).toBe("c");
		expect(c.focus).toHaveBeenCalled();
	});

	it("getByType filters by viewType", () => {
		registry.register(makeView("s", "sidebar"));
		registry.register(makeView("f", "floating"));
		registry.register(makeView("e", "embedded"));
		expect(registry.getByType("floating").map((v) => v.viewId)).toEqual([
			"f",
		]);
		expect(registry.getByType("embedded")).toHaveLength(1);
		expect(registry.getAll()).toHaveLength(3);
	});

	it("clear deactivates all views and nulls focus", () => {
		const a = makeView("a");
		const b = makeView("b");
		registry.register(a);
		registry.register(b);
		registry.clear();
		expect(a.onDeactivate).toHaveBeenCalled();
		expect(b.onDeactivate).toHaveBeenCalled();
		expect(registry.size).toBe(0);
		expect(registry.getFocusedId()).toBeNull();
	});

	it("subscribe and getSnapshot keep identity until notifyChange", () => {
		const listener = vi.fn();
		const unsubscribe = registry.subscribe(listener);
		const a = makeView("a");
		registry.register(a);
		expect(listener).toHaveBeenCalled();

		const snap1 = registry.getSnapshot();
		const snap2 = registry.getSnapshot();
		expect(snap1).toBe(snap2);
		expect(snap1.focusedId).toBe("a");

		registry.notifyChange();
		const snap3 = registry.getSnapshot();
		expect(snap3).not.toBe(snap1);

		unsubscribe();
		listener.mockClear();
		registry.notifyChange();
		expect(listener).not.toHaveBeenCalled();
	});

	it("toFocused and toAll operate on the expected views", () => {
		const a = makeView("a");
		const b = makeView("b");
		registry.register(a);
		registry.register(b);
		const focusedId = registry.toFocused((v) => v.viewId);
		expect(focusedId).toBe("a");

		const seen: string[] = [];
		registry.toAll((v) => seen.push(v.viewId));
		expect(seen).toEqual(["a", "b"]);
	});
});
