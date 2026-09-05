import { describe, it, expect, vi, beforeEach } from "vitest";
import { ChatPanelDelegate } from "../src/ui/chat-panel-delegate";
import type { ChatPanelCallbacks } from "../src/ui/ChatPanel";
import type { ChatInputState } from "../src/types/chat";

function makeCallbacks(
	overrides: Partial<ChatPanelCallbacks> = {},
): ChatPanelCallbacks {
	return {
		getDisplayName: vi.fn(() => "Agent"),
		getSessionStatus: vi.fn(() => "ready" as const),
		getSessionTitle: vi.fn(() => "Title"),
		getSessionId: vi.fn(() => "sess-1"),
		getInputState: vi.fn(
			(): ChatInputState => ({ text: "hi", files: [] }),
		),
		setInputState: vi.fn(),
		canSend: vi.fn(() => true),
		sendMessage: vi.fn(async () => true),
		cancelOperation: vi.fn(async () => {}),
		...overrides,
	};
}

describe("ChatPanelDelegate", () => {
	let delegate: ChatPanelDelegate;

	beforeEach(() => {
		delegate = new ChatPanelDelegate();
	});

	it("uses fallbacks before callbacks are registered", async () => {
		expect(delegate.getDisplayName()).toBe("Chat");
		expect(delegate.getSessionStatus()).toBe("disconnected");
		expect(delegate.getSessionTitle()).toBe("New session");
		expect(delegate.getSessionId()).toBeNull();
		expect(delegate.getInputState()).toBeNull();
		expect(delegate.canSend()).toBe(false);
		expect(await delegate.sendMessage()).toBe(false);
		await expect(delegate.cancelOperation()).resolves.toBeUndefined();
		delegate.setInputState({ text: "x", files: [] });
	});

	it("forwards each method after setCallbacks", async () => {
		const cbs = makeCallbacks();
		delegate.setCallbacks(cbs);
		expect(delegate.getDisplayName()).toBe("Agent");
		expect(delegate.getSessionStatus()).toBe("ready");
		expect(delegate.getSessionTitle()).toBe("Title");
		expect(delegate.getSessionId()).toBe("sess-1");
		expect(delegate.getInputState()).toEqual({ text: "hi", files: [] });
		expect(delegate.canSend()).toBe(true);
		expect(await delegate.sendMessage()).toBe(true);
		await delegate.cancelOperation();
		delegate.setInputState({ text: "n", files: [] });
		expect(cbs.setInputState).toHaveBeenCalledWith({
			text: "n",
			files: [],
		});
		expect(cbs.sendMessage).toHaveBeenCalledOnce();
		expect(cbs.cancelOperation).toHaveBeenCalledOnce();
	});

	it("replacing callbacks switches targets", () => {
		const first = makeCallbacks({ getDisplayName: () => "first" });
		const second = makeCallbacks({ getDisplayName: () => "second" });
		delegate.setCallbacks(first);
		delegate.setCallbacks(second);
		expect(delegate.getDisplayName()).toBe("second");
	});

	it("setCallbacks(null) returns to fallbacks", () => {
		delegate.setCallbacks(makeCallbacks());
		delegate.setCallbacks(null);
		expect(delegate.getDisplayName()).toBe("Chat");
		expect(delegate.getSessionStatus()).toBe("disconnected");
		expect(delegate.canSend()).toBe(false);
	});
});
