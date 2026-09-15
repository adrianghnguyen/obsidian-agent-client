// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
	CHAT_COMPOSER_TEXTAREA_SELECTOR,
	focusChatComposerTextarea,
	queryChatComposerTextarea,
	scheduleChatComposerFocus,
} from "../src/utils/chat-composer-focus";

function makeComposer(
	value = "",
	attrs: { viewId?: string; active?: boolean } = {},
): { root: HTMLDivElement; textarea: HTMLTextAreaElement } {
	const root = document.createElement("div");
	const panel = document.createElement("div");
	panel.className = "agent-client-floating-tab-panel";
	if (attrs.active) panel.classList.add("is-active");
	if (attrs.viewId) panel.setAttribute("data-view-id", attrs.viewId);
	const textarea = document.createElement("textarea");
	textarea.className = "agent-client-chat-input-textarea";
	textarea.value = value;
	panel.appendChild(textarea);
	root.appendChild(panel);
	document.body.appendChild(root);
	return { root, textarea };
}

describe("focusChatComposerTextarea", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("focuses and places the caret at the end of a draft", () => {
		const { textarea } = makeComposer("hello draft");
		textarea.setSelectionRange(0, 0);
		focusChatComposerTextarea(textarea);
		expect(document.activeElement).toBe(textarea);
		expect(textarea.selectionStart).toBe("hello draft".length);
		expect(textarea.selectionEnd).toBe("hello draft".length);
	});
});

describe("queryChatComposerTextarea", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("finds the composer under a root", () => {
		const { root, textarea } = makeComposer("x", {
			viewId: "floating-chat-0",
		});
		expect(queryChatComposerTextarea(root)).toBe(textarea);
		expect(CHAT_COMPOSER_TEXTAREA_SELECTOR).toContain(
			"agent-client-chat-input-textarea",
		);
	});

	it("scopes to the matching tab panel when viewId is set", () => {
		const { root } = makeComposer("one", { viewId: "floating-chat-0" });
		const other = document.createElement("div");
		other.className = "agent-client-floating-tab-panel";
		other.setAttribute("data-view-id", "floating-chat-1");
		const otherTa = document.createElement("textarea");
		otherTa.className = "agent-client-chat-input-textarea";
		otherTa.value = "two";
		other.appendChild(otherTa);
		root.appendChild(other);

		expect(queryChatComposerTextarea(root, "floating-chat-1")).toBe(
			otherTa,
		);
		expect(queryChatComposerTextarea(root, "floating-chat-0")?.value).toBe(
			"one",
		);
	});

	it("returns null when the viewId panel is missing", () => {
		const { root } = makeComposer("x", { viewId: "floating-chat-0" });
		expect(
			queryChatComposerTextarea(root, "floating-chat-missing"),
		).toBeNull();
	});

	it("returns null when root is missing", () => {
		expect(queryChatComposerTextarea(null)).toBeNull();
	});
});

describe("scheduleChatComposerFocus", () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.unstubAllGlobals();
		document.body.replaceChildren();
	});

	function stubImmediateRaf(): void {
		vi.stubGlobal(
			"requestAnimationFrame",
			(cb: FrameRequestCallback): number => {
				cb(0);
				return 0;
			},
		);
	}

	it("focuses after double rAF", () => {
		stubImmediateRaf();
		const { textarea } = makeComposer("later");
		const other = document.createElement("button");
		document.body.appendChild(other);
		other.focus();
		expect(document.activeElement).toBe(other);

		scheduleChatComposerFocus(() => textarea);

		expect(document.activeElement).toBe(textarea);
		expect(textarea.selectionStart).toBe("later".length);
	});

	it("retries shortly when the composer is not mounted on the first frames", () => {
		vi.useFakeTimers();
		stubImmediateRaf();
		let textarea: HTMLTextAreaElement | null = null;
		scheduleChatComposerFocus(() => textarea);

		const created = makeComposer("retry");
		textarea = created.textarea;
		vi.advanceTimersByTime(50);
		expect(document.activeElement).toBe(created.textarea);
	});
});
