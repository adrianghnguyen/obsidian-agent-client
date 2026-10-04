// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
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

/**
 * Force the scroller's layout metrics so the component sees a tall, scrolled
 * container whose last item top sits above the viewport.
 */
function setScrollerMetrics(itemTopAbove: boolean, scrollTop = 0) {
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
	container.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
	last.getBoundingClientRect = () =>
		({ top: itemTopAbove ? -50 : 150 }) as DOMRect;
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
	it("shows the button while streaming when the latest message top is off-screen", () => {
		renderList(true);
		setScrollerMetrics(true);
		scrollContainer();
		expect(
			document.querySelector(".agent-client-scroll-to-top"),
		).not.toBeNull();
	});

	it("shows the button for a long latest message even when not streaming", () => {
		renderList(false);
		setScrollerMetrics(true);
		scrollContainer();
		expect(
			document.querySelector(".agent-client-scroll-to-top"),
		).not.toBeNull();
	});

	it("hides the button when the latest message top is visible", () => {
		renderList(true);
		setScrollerMetrics(false);
		scrollContainer();
		expect(
			document.querySelector(".agent-client-scroll-to-top"),
		).toBeNull();
	});

	it("scrolls the container to the top of the last item when clicked", () => {
		renderList(false);
		const container = setScrollerMetrics(true, 200);
		scrollContainer();
		const button = document.querySelector(
			".agent-client-scroll-to-top",
		) as HTMLButtonElement;
		button.click();
		// delta = lastTop(-50) - containerTop(0) => scrollTop 200 + (-50) = 150
		expect(container.scrollTop).toBe(150);
	});

	it("stays solid while pinned to the bottom of the conversation", () => {
		renderList(true);
		// scrollTop 700 + clientHeight 300 === scrollHeight 1000 => at bottom.
		setScrollerMetrics(true, 700);
		scrollContainer();
		const button = document.querySelector(
			".agent-client-scroll-to-top",
		) as HTMLButtonElement;
		expect(button).not.toBeNull();
		expect(button.classList.contains("agent-client-scroll-to-top-dimmed")).toBe(
			false,
		);
	});

	it("fades once the user has scrolled away from the bottom", () => {
		renderList(true);
		setScrollerMetrics(true, 200);
		scrollContainer();
		expect(
			document.querySelector(".agent-client-scroll-to-top-dimmed"),
		).not.toBeNull();
	});
});
