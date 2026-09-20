import { describe, it, expect } from "vitest";
import type { AttachedFile } from "../src/types/chat";
import type { SessionState } from "../src/types/session";
import {
	canFlushComposerSend,
	cancelComposerSend,
	createQueuedComposerSend,
	enqueueComposerSend,
	forgetCancelledComposerSend,
	rememberCancelledComposerSend,
	resolveComposerSubmit,
	summarizeQueuedSend,
	takeFlushableComposerSend,
	wasComposerSendCancelled,
	type ComposerSendFlushGates,
	type QueuedComposerSend,
} from "../src/services/composer-send-queue";

function gates(
	overrides: Partial<ComposerSendFlushGates> = {},
): ComposerSendFlushGates {
	return {
		isSessionReady: true,
		isSending: false,
		isRestoringSession: false,
		sessionState: "ready",
		hasActivePermission: false,
		...overrides,
	};
}

function connecting(
	state: SessionState = "initializing",
): ComposerSendFlushGates {
	return gates({
		isSessionReady: false,
		sessionState: state,
	});
}

const imageFile: AttachedFile = {
	id: "att-1",
	kind: "image",
	mimeType: "image/png",
	data: "abc",
	name: "shot.png",
};

describe("canFlushComposerSend", () => {
	it("is true only when ready, idle, and not restoring", () => {
		expect(canFlushComposerSend(gates())).toBe(true);
	});

	it("is false while connecting (Cursor-fast or Antigravity-slow)", () => {
		expect(canFlushComposerSend(connecting("initializing"))).toBe(false);
		expect(canFlushComposerSend(connecting("authenticating"))).toBe(false);
		expect(
			canFlushComposerSend(
				gates({
					isSessionReady: false,
					sessionState: "disconnected",
				}),
			),
		).toBe(false);
	});

	it("is false during an in-flight turn", () => {
		expect(canFlushComposerSend(gates({ isSending: true }))).toBe(false);
	});

	it("is false while a permission request is waiting", () => {
		expect(canFlushComposerSend(gates({ hasActivePermission: true }))).toBe(
			false,
		);
	});

	it("is false while restoring a session", () => {
		expect(canFlushComposerSend(gates({ isRestoringSession: true }))).toBe(
			false,
		);
	});

	it("is false on session error even if isSessionReady were true", () => {
		expect(
			canFlushComposerSend(
				gates({ isSessionReady: true, sessionState: "error" }),
			),
		).toBe(false);
	});
});

describe("resolveComposerSubmit", () => {
	it("sends immediately when the harness is ready and idle", () => {
		const result = resolveComposerSubmit([], "hello", undefined, gates());
		expect(result.kind).toBe("send");
		if (result.kind !== "send") return;
		expect(result.item.text).toBe("hello");
		expect(result.item.files).toEqual([]);
	});

	it("queues while connecting and flushes only after ready", () => {
		const submitted = resolveComposerSubmit(
			[],
			"/status",
			undefined,
			connecting(),
		);
		expect(submitted.kind).toBe("enqueue");
		if (submitted.kind !== "enqueue") return;

		expect(
			takeFlushableComposerSend(submitted.queue, connecting()),
		).toBeNull();

		const flushed = takeFlushableComposerSend(submitted.queue, gates());
		expect(flushed?.item.text).toBe("/status");
		expect(flushed?.rest).toEqual([]);
	});

	it("keeps a follow-up queued until the current turn completes", () => {
		const first = resolveComposerSubmit([], "first", undefined, gates());
		expect(first.kind).toBe("send");

		const second = resolveComposerSubmit(
			[],
			"follow-up",
			undefined,
			gates({ isSending: true }),
		);
		expect(second.kind).toBe("enqueue");
		if (second.kind !== "enqueue") return;

		expect(
			takeFlushableComposerSend(second.queue, gates({ isSending: true })),
		).toBeNull();

		const flushed = takeFlushableComposerSend(second.queue, gates());
		expect(flushed?.item.text).toBe("follow-up");
	});

	it("keeps the queue across a harness switch (ready → initializing → ready)", () => {
		const whileSwitching = resolveComposerSubmit(
			[],
			"after switch",
			undefined,
			connecting("initializing"),
		);
		expect(whileSwitching.kind).toBe("enqueue");
		if (whileSwitching.kind !== "enqueue") return;

		// Old session is gone; new Cursor/Antigravity session is still coming up.
		expect(
			takeFlushableComposerSend(
				whileSwitching.queue,
				connecting("initializing"),
			),
		).toBeNull();

		const flushed = takeFlushableComposerSend(
			whileSwitching.queue,
			gates(),
		);
		expect(flushed?.item.text).toBe("after switch");
	});

	it("does not flush while the new harness is in error", () => {
		const queued = resolveComposerSubmit(
			[],
			"retry later",
			undefined,
			connecting(),
		);
		expect(queued.kind).toBe("enqueue");
		if (queued.kind !== "enqueue") return;

		expect(
			takeFlushableComposerSend(
				queued.queue,
				gates({
					isSessionReady: false,
					sessionState: "error",
				}),
			),
		).toBeNull();
	});

	it("appends behind existing queued items instead of jumping the FIFO", () => {
		const first = resolveComposerSubmit(
			[],
			"first",
			undefined,
			connecting(),
		);
		expect(first.kind).toBe("enqueue");
		if (first.kind !== "enqueue") return;

		const second = resolveComposerSubmit(
			first.queue,
			"second",
			undefined,
			gates(),
		);
		expect(second.kind).toBe("enqueue");
		if (second.kind !== "enqueue") return;
		expect(second.queue.map((item) => item.text)).toEqual([
			"first",
			"second",
		]);
	});

	it("rejects an empty composer", () => {
		expect(resolveComposerSubmit([], "   ", undefined, gates()).kind).toBe(
			"empty",
		);
	});

	it("queues attachments-only payloads", () => {
		const result = resolveComposerSubmit([], "", [imageFile], connecting());
		expect(result.kind).toBe("enqueue");
		if (result.kind !== "enqueue") return;
		expect(result.item.files).toHaveLength(1);
		expect(result.item.text).toBe("");
	});
});

describe("FIFO cancel and drain", () => {
	it("aborts a taken item when X is clicked before send commits", () => {
		const drop = createQueuedComposerSend(
			"CANCEL_ME_DO_NOT_SEND",
			undefined,
			"q-cancel",
		);
		const keep = createQueuedComposerSend(
			"KEEP_ME_SHOULD_SEND",
			undefined,
			"q-keep",
		);
		let queue = enqueueComposerSend(enqueueComposerSend([], drop), keep);
		const cancelledIds = new Set<string>();

		const taken = takeFlushableComposerSend(queue, gates());
		expect(taken?.item.text).toBe("CANCEL_ME_DO_NOT_SEND");
		queue = taken?.rest ?? [];

		rememberCancelledComposerSend(cancelledIds, "q-cancel");
		expect(wasComposerSendCancelled(cancelledIds, "q-cancel")).toBe(true);
		expect(wasComposerSendCancelled(cancelledIds, "q-keep")).toBe(false);

		forgetCancelledComposerSend(cancelledIds, "q-cancel");
		expect(wasComposerSendCancelled(cancelledIds, "q-cancel")).toBe(false);

		const flushed = takeFlushableComposerSend(queue, gates());
		expect(flushed?.item.text).toBe("KEEP_ME_SHOULD_SEND");
	});

	it("cancels one id and flushes the remaining item", () => {
		const a = createQueuedComposerSend("one", undefined, "q-a");
		const b = createQueuedComposerSend("two", undefined, "q-b");
		const queue = enqueueComposerSend(enqueueComposerSend([], a), b);
		const afterCancel = cancelComposerSend(queue, "q-a");
		expect(afterCancel.map((item) => item.id)).toEqual(["q-b"]);

		const flushed = takeFlushableComposerSend(afterCancel, gates());
		expect(flushed?.item.text).toBe("two");
		expect(flushed?.rest).toEqual([]);
	});

	it("drains FIFO one item per ready+idle snapshot (runPromptInChat / auto-send)", () => {
		let queue: QueuedComposerSend[] = [];
		for (const text of ["injected-1", "injected-2"]) {
			const result = resolveComposerSubmit(
				queue,
				text,
				undefined,
				connecting(),
			);
			expect(result.kind).toBe("enqueue");
			if (result.kind === "enqueue") queue = result.queue;
		}

		const first = takeFlushableComposerSend(queue, gates());
		expect(first?.item.text).toBe("injected-1");
		queue = first?.rest ?? [];

		// Still sending the first injected prompt.
		expect(
			takeFlushableComposerSend(queue, gates({ isSending: true })),
		).toBeNull();

		const second = takeFlushableComposerSend(queue, gates());
		expect(second?.item.text).toBe("injected-2");
		expect(second?.rest).toEqual([]);
	});
});

describe("summarizeQueuedSend", () => {
	it("truncates long text", () => {
		const item = createQueuedComposerSend("a".repeat(80));
		const label = summarizeQueuedSend(item, 10);
		expect(label).toBe(`${"a".repeat(9)}…`);
	});

	it("uses file name or count when there is no text", () => {
		expect(
			summarizeQueuedSend(createQueuedComposerSend("", [imageFile])),
		).toBe("shot.png");
		expect(
			summarizeQueuedSend(
				createQueuedComposerSend("", [
					imageFile,
					{ ...imageFile, id: "att-2" },
				]),
			),
		).toBe("2 files");
	});
});

describe("floating chat: Cursor and Antigravity", () => {
	it("open floating chat on Cursor: submit while initializing, send on ready", () => {
		const submitted = resolveComposerSubmit(
			[],
			"hello cursor",
			undefined,
			connecting("initializing"),
		);
		expect(submitted.kind).toBe("enqueue");
		if (submitted.kind !== "enqueue") return;
		expect(
			takeFlushableComposerSend(
				submitted.queue,
				connecting("initializing"),
			),
		).toBeNull();
		expect(
			takeFlushableComposerSend(submitted.queue, gates())?.item.text,
		).toBe("hello cursor");
	});

	it("open floating chat on Antigravity: submit during long init/auth, send on ready", () => {
		const duringBridge = resolveComposerSubmit(
			[],
			"hello agy",
			undefined,
			connecting("initializing"),
		);
		expect(duringBridge.kind).toBe("enqueue");
		if (duringBridge.kind !== "enqueue") return;

		expect(
			takeFlushableComposerSend(
				duringBridge.queue,
				connecting("authenticating"),
			),
		).toBeNull();

		expect(
			takeFlushableComposerSend(duringBridge.queue, gates())?.item.text,
		).toBe("hello agy");
	});

	it("open floating chat, switch Cursor → Antigravity, buffer, submit when ready", () => {
		const cursorReady = resolveComposerSubmit(
			[],
			"stays on cursor",
			undefined,
			gates(),
		);
		expect(cursorReady.kind).toBe("send");

		const whileSwitching = resolveComposerSubmit(
			[],
			"for antigravity",
			undefined,
			connecting("initializing"),
		);
		expect(whileSwitching.kind).toBe("enqueue");
		if (whileSwitching.kind !== "enqueue") return;

		expect(
			takeFlushableComposerSend(
				whileSwitching.queue,
				connecting("initializing"),
			),
		).toBeNull();

		const flushed = takeFlushableComposerSend(
			whileSwitching.queue,
			gates(),
		);
		expect(flushed?.item.text).toBe("for antigravity");
	});

	it("during turn completion, queue a follow-up then cancel one chip", () => {
		const a = createQueuedComposerSend("keep", undefined, "q-keep");
		const b = createQueuedComposerSend("drop", undefined, "q-drop");
		let queue = enqueueComposerSend(enqueueComposerSend([], a), b);
		queue = cancelComposerSend(queue, "q-drop");

		expect(
			takeFlushableComposerSend(queue, gates({ isSending: true })),
		).toBeNull();
		expect(takeFlushableComposerSend(queue, gates())?.item.text).toBe(
			"keep",
		);
	});
});
