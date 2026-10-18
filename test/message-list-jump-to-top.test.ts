// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, act } from "@testing-library/react";

const scrollToIndex = vi.fn();

vi.mock("../src/ui/MessageBubble", () => ({
	MessageBubble: ({ message }: { message: ChatMessage }) =>
		React.createElement(
			"div",
			{ "data-msg": message.id },
			message.content[0]?.type === "text"
				? (message.content[0] as { text: string }).text
				: "",
		),
}));

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: (opts: { count: number }) => ({
		getVirtualItems: () =>
			Array.from({ length: opts.count }, (_, i) => ({
				key: i,
				index: i,
				start: i * 100,
				end: i * 100 + 100,
				size: 100,
			})),
		getTotalSize: () => opts.count * 100,
		measureElement: () => {},
		scrollToIndex,
		shouldAdjustScrollPositionOnItemSizeChange: undefined,
	}),
}));

import { MessageList } from "../src/ui/MessageList";
import type { ChatMessage } from "../src/types/chat";

vi.mock("../src/ui/TurnTraceRenderer", () => ({
	TurnTraceRenderer: () => null,
}));

function assistantMessage(id: string, text: string): ChatMessage {
	return {
		id,
		role: "assistant",
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

const view = {
	app: {},
	registerDomEvent: (
		target: EventTarget,
		type: string,
		cb: EventListenerOrEventListenerObject,
	) => {
		target.addEventListener(type, cb);
	},
};

function renderList(isSending: boolean) {
	return render(
		React.createElement(MessageList, {
			messages: [
				assistantMessage("m1", "hello"),
				assistantMessage("m2", "streaming..."),
			],
			isSending,
			isSessionReady: true,
			isRestoringSession: false,
			agentLabel: "Agent",
			plugin: {},
			view,
			traceVerbosity: "full",
			toolCallFailureAnalysis: "off",
			hasActivePermission: false,
		} as never),
	);
}

interface ScrollerLayout {
	itemTopAbove: boolean;
	scrollTop?: number;
	itemBottom?: number;
}

/**
 * Force the scroller's layout metrics so the component sees a tall, scrolled
 * container whose last item top sits above the viewport.
 */
function setScrollerMetrics(layout: ScrollerLayout) {
	const {
		itemTopAbove,
		scrollTop = 0,
		itemBottom = itemTopAbove ? 350 : 450,
	} = layout;
	const container = document.querySelector(
		".agent-client-chat-view-messages",
	) as HTMLElement;
	Object.defineProperty(container, "clientHeight", {
		configurable: true,
		value: 300,
	});
	Object.defineProperty(container, "scrollHeight", {
		configurable: true,
		value: 1000,
	});
	Object.defineProperty(container, "scrollTop", {
		configurable: true,
		writable: true,
		value: scrollTop,
	});
	const inner = container.querySelector(
		".agent-client-virtual-list-inner",
	) as HTMLElement;
	const items = inner.querySelectorAll(".agent-client-virtual-item");
	const last = items[items.length - 1] as HTMLElement;
	container.getBoundingClientRect = () =>
		({ top: 0, bottom: 300 }) as DOMRect;
	last.getBoundingClientRect = () =>
		({
			top: itemTopAbove ? -50 : 150,
			bottom: itemBottom,
		}) as DOMRect;
	return container;
}

function scrollContainer() {
	act(() => {
		document
			.querySelector(".agent-client-chat-view-messages")!
			.dispatchEvent(new Event("scroll"));
	});
}

afterEach(cleanup);
beforeEach(() => scrollToIndex.mockClear());

describe("MessageList jump-to-top button", () => {
	it("mounts the rail for a long latest message but keeps it collapsed at the chat bottom", () => {
		renderList(true);
		setScrollerMetrics({ itemTopAbove: true, scrollTop: 700 });
		scrollContainer();
		const rail = document.querySelector(".agent-client-jump-to-top-rail");
		expect(rail).not.toBeNull();
		expect(
			rail?.classList.contains("agent-client-jump-to-top-rail-visible"),
		).toBe(false);
	});

	it("expands the rail when scrolled up and near the end of the long reply", () => {
		renderList(false);
		setScrollerMetrics({ itemTopAbove: true, scrollTop: 200 });
		scrollContainer();
		expect(
			document.querySelector(
				".agent-client-jump-to-top-rail.agent-client-jump-to-top-rail-visible",
			),
		).not.toBeNull();
	});

	it("does not mount the rail when the latest message top is visible", () => {
		renderList(true);
		setScrollerMetrics({ itemTopAbove: false });
		scrollContainer();
		expect(
			document.querySelector(".agent-client-jump-to-top-rail"),
		).toBeNull();
	});

	it("scrolls the container to the top of the last item when clicked", () => {
		renderList(false);
		const container = setScrollerMetrics({
			itemTopAbove: true,
			scrollTop: 200,
		});
		scrollContainer();
		const button = document.querySelector(
			".agent-client-scroll-to-top",
		) as HTMLButtonElement;
		button.click();
		// delta = lastTop(-50) - containerTop(0) => scrollTop 200 + (-50) = 150
		expect(container.scrollTop).toBe(150);
	});

	it("keeps the rail collapsed when the viewport is mid-response (not near message bottom)", () => {
		renderList(true);
		setScrollerMetrics({
			itemTopAbove: true,
			scrollTop: 200,
			itemBottom: 800,
		});
		scrollContainer();
		const rail = document.querySelector(".agent-client-jump-to-top-rail");
		expect(rail).not.toBeNull();
		expect(
			rail?.classList.contains("agent-client-jump-to-top-rail-visible"),
		).toBe(false);
	});

	it("places the rail as a sibling below the scroller, not inside a virtual item", () => {
		renderList(true);
		setScrollerMetrics({ itemTopAbove: true, scrollTop: 200 });
		scrollContainer();
		const scroller = document.querySelector(
			".agent-client-chat-view-messages",
		);
		const rail = document.querySelector(".agent-client-jump-to-top-rail");
		const shell = document.querySelector(".agent-client-messages-shell");
		expect(scroller).not.toBeNull();
		expect(rail).not.toBeNull();
		expect(shell).not.toBeNull();
		expect(rail?.closest(".agent-client-virtual-item")).toBeNull();
		expect(
			scroller?.nextElementSibling?.classList.contains(
				"agent-client-jump-to-top-rail",
			),
		).toBe(true);
		expect(
			rail && shell && shell.contains(rail) && !scroller?.contains(rail),
		).toBe(true);
		expect(
			rail?.closest(".agent-client-chat-input-container"),
		).toBeNull();
		expect(
			document.querySelector(".agent-client-scroll-to-bottom"),
		).not.toBeNull();
	});
});
