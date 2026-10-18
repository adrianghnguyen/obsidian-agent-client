// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, render, act } from "@testing-library/react";

const scrollToIndex = vi.fn();
let lastItemHeight = 100;

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
		getTotalSize: () =>
			opts.count > 0
				? (opts.count - 1) * 100 + lastItemHeight
				: 0,
		getOffsetForIndex: (index: number) => {
			if (index < 0 || index >= opts.count) return undefined;
			const start = index * 100;
			return [start, "start"] as const;
		},
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
	scrollTop?: number;
	lastItemHeight?: number;
}

function setScrollerMetrics(layout: ScrollerLayout = {}) {
	const { scrollTop = 0, lastItemHeight: height = 100 } = layout;
	lastItemHeight = height;
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
	const last = items[items.length - 1] as HTMLElement | undefined;
	if (last) {
		Object.defineProperty(last, "offsetHeight", {
			configurable: true,
			value: height,
		});
	}
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
beforeEach(() => {
	scrollToIndex.mockClear();
	lastItemHeight = 100;
});

describe("MessageList jump-to-top button", () => {
	it("mounts the rail for a long latest message but keeps it collapsed at the chat bottom", () => {
		renderList(true);
		setScrollerMetrics({ scrollTop: 700, lastItemHeight: 800 });
		scrollContainer();
		const rail = document.querySelector(".agent-client-jump-to-top-rail");
		expect(rail).not.toBeNull();
		expect(
			rail?.classList.contains("agent-client-jump-to-top-rail-visible"),
		).toBe(false);
	});

	it("expands the rail when scrolled up and near the end of the long reply", () => {
		renderList(false);
		setScrollerMetrics({ scrollTop: 550, lastItemHeight: 800 });
		scrollContainer();
		expect(
			document.querySelector(
				".agent-client-jump-to-top-rail.agent-client-jump-to-top-rail-visible",
			),
		).not.toBeNull();
	});

	it("does not mount the rail when the latest message top is visible", () => {
		renderList(true);
		setScrollerMetrics({ scrollTop: 0, lastItemHeight: 800 });
		scrollContainer();
		expect(
			document.querySelector(".agent-client-jump-to-top-rail"),
		).toBeNull();
	});

	it("scrolls the container to the top of the last item when clicked", () => {
		renderList(false);
		const container = setScrollerMetrics({
			scrollTop: 550,
			lastItemHeight: 800,
		});
		scrollContainer();
		const inner = container.querySelector(
			".agent-client-virtual-list-inner",
		) as HTMLElement;
		const items = inner.querySelectorAll(".agent-client-virtual-item");
		const last = items[items.length - 1] as HTMLElement;
		container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
		last.getBoundingClientRect = () => ({ top: -50 }) as DOMRect;
		const button = document.querySelector(
			".agent-client-scroll-to-top",
		) as HTMLButtonElement;
		button.click();
		expect(container.scrollTop).toBe(500);
	});

	it("keeps the rail collapsed when the viewport is mid-response (not near message bottom)", () => {
		renderList(true);
		setScrollerMetrics({ scrollTop: 200, lastItemHeight: 800 });
		scrollContainer();
		const rail = document.querySelector(".agent-client-jump-to-top-rail");
		expect(rail).not.toBeNull();
		expect(
			rail?.classList.contains("agent-client-jump-to-top-rail-visible"),
		).toBe(false);
	});

	it("places the rail as a sibling below the scroller, not inside a virtual item", () => {
		renderList(true);
		setScrollerMetrics({ scrollTop: 550, lastItemHeight: 800 });
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
