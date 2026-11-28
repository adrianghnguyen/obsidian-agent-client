// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";

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

vi.mock("../src/ui/TurnTraceRenderer", () => ({
	TurnTraceRenderer: () => null,
}));

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: (opts: { count: number }) => ({
		getVirtualItems: () =>
			Array.from({ length: opts.count }, (_, i) => ({
				key: i,
				index: i,
				start: i * 120,
				end: i * 120 + 120,
				size: 120,
			})),
		getTotalSize: () => opts.count * 120,
		getOffsetForIndex: (index: number) => {
			if (index < 0 || index >= opts.count) return undefined;
			return [index * 120, "start"] as const;
		},
		measureElement: () => {},
		scrollToIndex,
		shouldAdjustScrollPositionOnItemSizeChange: undefined,
	}),
}));

import { MessageList } from "../src/ui/MessageList";
import type { ChatMessage } from "../src/types/chat";

function userMessage(id: string, text: string): ChatMessage {
	return {
		id,
		role: "user",
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

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

function renderMessages(
	messages: ChatMessage[],
	opts: {
		isSending?: boolean;
		streamResponsesDownwards?: boolean;
		onToggleStreamResponsesDownwards?: () => void;
	} = {},
) {
	return render(
		React.createElement(MessageList, {
			messages,
			isSending: opts.isSending ?? false,
			isSessionReady: true,
			isRestoringSession: false,
			agentLabel: "Agent",
			sessionState: "ready",
			bootStartedAtMs: 0,
			plugin: {},
			view,
			traceVerbosity: "full",
			toolCallFailureAnalysis: "lenient",
			showLinkedNotesOnAssistantMessages: true,
			streamResponsesDownwards: opts.streamResponsesDownwards ?? false,
			onToggleStreamResponsesDownwards:
				opts.onToggleStreamResponsesDownwards,
			hasActivePermission: false,
		} as never),
	);
}

beforeEach(() => {
	scrollToIndex.mockClear();
	vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
		cb(0);
		return 1;
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	cleanup();
});

describe("MessageList stream downwards & turn navigation", () => {
	it("renders the stream-downwards toggle button and invokes the toggle handler", () => {
		const onToggle = vi.fn();
		renderMessages([userMessage("u1", "hi")], {
			streamResponsesDownwards: true,
			onToggleStreamResponsesDownwards: onToggle,
		});

		const btn = document.querySelector(
			".agent-client-stream-mode-toggle",
		) as HTMLButtonElement;
		expect(btn).not.toBeNull();
		expect(btn.getAttribute("aria-pressed")).toBe("true");
		expect(btn.classList.contains("is-active")).toBe(true);

		fireEvent.click(btn);
		expect(onToggle).toHaveBeenCalledTimes(1);
	});

	it("anchors newly sent user prompt to the top and avoids bottom auto-follow when stream-downwards is ON", () => {
		const messages1 = [
			userMessage("u1", "Turn 1"),
			assistantMessage("a1", "Answer 1"),
		];
		const { rerender } = renderMessages(messages1, {
			isSending: false,
			streamResponsesDownwards: true,
			onToggleStreamResponsesDownwards: () => {},
		});

		const scroller = document.querySelector(
			".agent-client-chat-view-messages",
		) as HTMLElement;
		Object.defineProperty(scroller, "clientHeight", {
			configurable: true,
			value: 400,
		});
		act(() => {
			scroller.dispatchEvent(new Event("scroll"));
		});

		scrollToIndex.mockClear();

		// User sends a new turn
		const messages2 = [...messages1, userMessage("u2", "Turn 2")];
		rerender(
			React.createElement(MessageList, {
				messages: messages2,
				isSending: true,
				isSessionReady: true,
				isRestoringSession: false,
				agentLabel: "Agent",
				sessionState: "ready",
				bootStartedAtMs: 0,
				plugin: {},
				view,
				traceVerbosity: "full",
				toolCallFailureAnalysis: "lenient",
				showLinkedNotesOnAssistantMessages: true,
				streamResponsesDownwards: true,
				onToggleStreamResponsesDownwards: () => {},
				hasActivePermission: false,
			} as never),
		);

		expect(scrollToIndex).toHaveBeenCalledWith(2, { align: "start" });

		const spacer = document.querySelector(
			".agent-client-stream-spacer",
		) as HTMLElement;
		expect(Number.parseInt(spacer.style.height, 10)).toBeGreaterThan(0);

		scrollToIndex.mockClear();

		// Assistant streams a chunk — should NOT pull viewport to bottom
		const messages3 = [
			...messages2,
			assistantMessage("a2", "Streaming answer..."),
		];
		rerender(
			React.createElement(MessageList, {
				messages: messages3,
				isSending: true,
				isSessionReady: true,
				isRestoringSession: false,
				agentLabel: "Agent",
				sessionState: "ready",
				bootStartedAtMs: 0,
				plugin: {},
				view,
				traceVerbosity: "full",
				toolCallFailureAnalysis: "lenient",
				showLinkedNotesOnAssistantMessages: true,
				streamResponsesDownwards: true,
				onToggleStreamResponsesDownwards: () => {},
				hasActivePermission: false,
			} as never),
		);

		expect(scrollToIndex).not.toHaveBeenCalled();
	});

	it("hides the turn rail for fewer than 2 turns and shows hover preview + click-to-jump for 2+ turns", () => {
		const { rerender } = renderMessages(
			[userMessage("u1", "Only turn"), assistantMessage("a1", "Reply")],
			{},
		);
		expect(document.querySelector(".agent-client-turn-rail")).toBeNull();

		rerender(
			React.createElement(MessageList, {
				messages: [
					userMessage("u1", "First question"),
					assistantMessage("a1", "First reply"),
					userMessage("u2", "Second question"),
					assistantMessage("a2", "Second reply"),
				],
				isSending: false,
				isSessionReady: true,
				isRestoringSession: false,
				agentLabel: "Agent",
				sessionState: "ready",
				bootStartedAtMs: 0,
				plugin: {},
				view,
				traceVerbosity: "full",
				toolCallFailureAnalysis: "lenient",
				showLinkedNotesOnAssistantMessages: true,
				hasActivePermission: false,
			} as never),
		);

		const markers = document.querySelectorAll(
			".agent-client-turn-rail-marker",
		);
		expect(markers).toHaveLength(2);

		fireEvent.mouseEnter(markers[1]);
		const tooltip = document.querySelector(".agent-client-turn-rail-tooltip");
		expect(tooltip?.textContent).toContain("Turn 2");
		expect(tooltip?.textContent).toContain("Second question");

		scrollToIndex.mockClear();
		fireEvent.click(markers[0]);
		expect(scrollToIndex).toHaveBeenCalledWith(0, { align: "start" });
	});
});
