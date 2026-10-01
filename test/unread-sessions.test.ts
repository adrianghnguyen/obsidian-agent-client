import { describe, it, expect } from "vitest";
import { ChatViewRegistry, type IChatViewContainer } from "../src/services/view-registry";

function makeView(viewId: string): IChatViewContainer {
	return {
		viewId,
		viewType: "floating",
		onActivate: () => {},
		onDeactivate: () => {},
	} as unknown as IChatViewContainer;
}

describe("ChatViewRegistry unread state", () => {
	it("starts with no unread views", () => {
		const registry = new ChatViewRegistry();
		registry.register(makeView("a"));
		expect(registry.countUnread()).toBe(0);
		expect(registry.isUnread("a")).toBe(false);
	});

	it("marks a view unread and counts it", () => {
		const registry = new ChatViewRegistry();
		registry.register(makeView("a"));
		registry.register(makeView("b"));
		registry.markUnread("a");
		registry.markUnread("b");
		expect(registry.countUnread()).toBe(2);
		expect(registry.isUnread("a")).toBe(true);
		expect(registry.isUnread("b")).toBe(true);
	});

	it("ignores markUnread for unknown views", () => {
		const registry = new ChatViewRegistry();
		expect(registry.markUnread("ghost")).toBeUndefined();
		expect(registry.countUnread()).toBe(0);
	});

	it("clears unread when the view is focused", () => {
		const registry = new ChatViewRegistry();
		registry.register(makeView("a"));
		registry.register(makeView("b"));
		registry.markUnread("b");
		expect(registry.isUnread("b")).toBe(true);
		registry.setFocused("b");
		expect(registry.isUnread("b")).toBe(false);
		expect(registry.countUnread()).toBe(0);
	});

	it("keeps other views unread when one is focused", () => {
		const registry = new ChatViewRegistry();
		registry.register(makeView("a"));
		registry.register(makeView("b"));
		registry.markUnread("a");
		registry.markUnread("b");
		registry.setFocused("a");
		expect(registry.isUnread("a")).toBe(false);
		expect(registry.isUnread("b")).toBe(true);
		expect(registry.countUnread()).toBe(1);
	});

	it("drops unread state when a view is unregistered", () => {
		const registry = new ChatViewRegistry();
		registry.register(makeView("a"));
		registry.markUnread("a");
		registry.unregister("a");
		expect(registry.countUnread()).toBe(0);
	});

	it("clears unread state on clear()", () => {
		const registry = new ChatViewRegistry();
		registry.register(makeView("a"));
		registry.markUnread("a");
		registry.clear();
		expect(registry.countUnread()).toBe(0);
	});
});
