/**
 * Functional: composer submit policy used by ChatPanel.
 * Queues while the session cannot take a prompt, then flushes FIFO.
 * Permission gate comes from the transcript (findActivePermission).
 */
import { describe, it, expect } from "vitest";
import type { AttachedFile, ChatMessage } from "../../src/types/chat";
import {
	cancelComposerSend,
	enqueueComposerSend,
	forgetCancelledComposerSend,
	rememberCancelledComposerSend,
	resolveComposerSubmit,
	takeFlushableComposerSend,
	wasComposerSendCancelled,
	type ComposerSendFlushGates,
	type QueuedComposerSend,
} from "../../src/services/composer-send-queue";
import {
	applySingleUpdate,
	findActivePermission,
} from "../../src/services/message-state";
import type { SessionState } from "../../src/types/session";

const note: AttachedFile = {
	id: "file-a",
	kind: "file",
	mimeType: "text/markdown",
	name: "A.md",
	path: "Notes/A.md",
};

function gates(
	partial: Partial<ComposerSendFlushGates> = {},
): ComposerSendFlushGates {
	return {
		isSessionReady: true,
		isSending: false,
		isRestoringSession: false,
		sessionState: "ready",
		hasActivePermission: false,
		...partial,
	};
}

/** Mirrors ChatPanel enqueueOrSendComposerPayload + the drain effect. */
class ComposerPipeline {
	queue: QueuedComposerSend[] = [];
	cancelled = new Set<string>();
	sent: string[] = [];
	flushing = false;

	submit(
		text: string,
		files: AttachedFile[] | undefined,
		flushGates: ComposerSendFlushGates,
	): "empty" | "sent" | "queued" {
		const result = resolveComposerSubmit(
			this.queue,
			text,
			files,
			flushGates,
		);
		if (result.kind === "empty") return "empty";
		const sendNow = result.kind === "send" && !this.flushing;
		if (sendNow) {
			this.sent.push(result.item.text);
			return "sent";
		}
		this.queue = enqueueComposerSend(this.queue, result.item);
		return "queued";
	}

	drain(flushGates: ComposerSendFlushGates): void {
		if (this.flushing) return;
		const taken = takeFlushableComposerSend(this.queue, flushGates);
		if (!taken) return;
		const itemId = taken.item.id;
		if (wasComposerSendCancelled(this.cancelled, itemId)) {
			forgetCancelledComposerSend(this.cancelled, itemId);
			this.queue = cancelComposerSend(this.queue, itemId);
			return;
		}
		this.flushing = true;
		if (wasComposerSendCancelled(this.cancelled, itemId)) {
			forgetCancelledComposerSend(this.cancelled, itemId);
			this.queue = cancelComposerSend(this.queue, itemId);
			this.flushing = false;
			return;
		}
		this.queue = cancelComposerSend(taken.rest, itemId);
		this.sent.push(taken.item.text || taken.item.files[0]?.name || "");
		this.flushing = false;
	}
}

describe("composer send pipeline", () => {
	it("keeps FIFO order across connecting, a busy turn, and restore", () => {
		const pipe = new ComposerPipeline();
		const connecting = gates({
			isSessionReady: false,
			sessionState: "initializing",
		});
		expect(pipe.submit("first", undefined, connecting)).toBe("queued");
		expect(pipe.submit("  ", [note], connecting)).toBe("queued");
		expect(pipe.submit("   ", undefined, connecting)).toBe("empty");
		expect(pipe.queue).toHaveLength(2);

		pipe.drain(connecting);
		expect(pipe.sent).toEqual([]);

		const ready = gates();
		pipe.drain(ready);
		expect(pipe.sent).toEqual(["first"]);
		pipe.drain(ready);
		expect(pipe.sent).toEqual(["first", "A.md"]);

		const busy = gates({ isSending: true, sessionState: "busy" });
		expect(pipe.submit("third", undefined, busy)).toBe("queued");
		pipe.drain(busy);
		expect(pipe.sent).toEqual(["first", "A.md"]);

		const restoring = gates({ isRestoringSession: true });
		pipe.drain(restoring);
		expect(pipe.queue).toHaveLength(1);

		pipe.drain(ready);
		expect(pipe.sent).toEqual(["first", "A.md", "third"]);
		expect(pipe.queue).toEqual([]);
	});

	it("does not flush while the session is in error", () => {
		const pipe = new ComposerPipeline();
		const errored = gates({
			isSessionReady: true,
			sessionState: "error" satisfies SessionState,
		});
		expect(pipe.submit("kept", undefined, errored)).toBe("queued");
		pipe.drain(errored);
		expect(pipe.sent).toEqual([]);
		expect(pipe.queue).toHaveLength(1);
	});

	it("drops a chip cancelled after the drain already took it", () => {
		const pipe = new ComposerPipeline();
		const waiting = gates({ isSessionReady: false });
		pipe.submit("keep-me", undefined, waiting);
		pipe.submit("drop-me", undefined, waiting);
		const ready = gates();
		pipe.drain(ready);
		expect(pipe.sent).toEqual(["keep-me"]);

		const taken = takeFlushableComposerSend(pipe.queue, ready);
		expect(taken).not.toBeNull();
		if (!taken) return;
		rememberCancelledComposerSend(pipe.cancelled, taken.item.id);
		pipe.flushing = true;
		if (wasComposerSendCancelled(pipe.cancelled, taken.item.id)) {
			forgetCancelledComposerSend(pipe.cancelled, taken.item.id);
			pipe.queue = cancelComposerSend(pipe.queue, taken.item.id);
			pipe.flushing = false;
		}
		expect(pipe.sent).toEqual(["keep-me"]);
		expect(pipe.queue).toEqual([]);
	});

	it("holds the queue while the transcript has an active permission", () => {
		const index = new Map<string, number>();
		let messages: ChatMessage[] = [];
		messages = applySingleUpdate(
			messages,
			{
				type: "tool_call",
				sessionId: "sess-1",
				toolCallId: "edit-1",
				title: "Edit A.md",
				status: "pending",
				permissionRequest: {
					requestId: "req-1",
					options: [
						{
							optionId: "allow",
							name: "Allow",
							kind: "allow_once",
						},
					],
					isActive: true,
				},
			},
			index,
		);
		const blocked = gates({
			hasActivePermission: findActivePermission(messages) !== null,
		});
		const pipe = new ComposerPipeline();
		expect(pipe.submit("after approval", undefined, blocked)).toBe(
			"queued",
		);
		pipe.drain(blocked);
		expect(pipe.sent).toEqual([]);

		messages = applySingleUpdate(
			messages,
			{
				type: "tool_call_update",
				sessionId: "sess-1",
				toolCallId: "edit-1",
				permissionRequest: {
					requestId: "req-1",
					options: [],
					selectedOptionId: "allow",
					isActive: false,
				},
			},
			index,
		);
		const open = gates({
			hasActivePermission: findActivePermission(messages) !== null,
		});
		pipe.drain(open);
		expect(pipe.sent).toEqual(["after approval"]);
	});
});
