/**
 * Functional: forking a prior message copies a truncated transcript to a
 * sibling view without mutating the source list or delivering to it.
 */
import { describe, it, expect, vi } from "vitest";
import type { ChatMessage, PromptContent } from "../../src/types/chat";
import {
	sliceMessagesThrough,
	consumePendingForkContext,
} from "../../src/services/conversation-fork";
import {
	PendingForks,
	type PendingForkPayload,
} from "../../src/services/pending-forks";

function msg(
	id: string,
	role: "user" | "assistant",
	text: string,
): ChatMessage {
	return {
		id,
		role,
		content: [{ type: "text", text }],
		timestamp: new Date(),
	};
}

describe("conversation fork sibling isolation", () => {
	const sourceTranscript = [
		msg("m1", "user", "first"),
		msg("m2", "assistant", "ok"),
		msg("m3", "user", "later"),
		msg("m4", "assistant", "done"),
	];

	it("keeps the source transcript intact and gives the sibling a truncated copy", () => {
		const sliced = sliceMessagesThrough(sourceTranscript, "m2");
		expect(sliced?.map((m) => m.id)).toEqual(["m1", "m2"]);
		expect(sourceTranscript.map((m) => m.id)).toEqual([
			"m1",
			"m2",
			"m3",
			"m4",
		]);
		expect(sliced).not.toBe(sourceTranscript);
	});

	it("delivers the fork payload only to the destination view", () => {
		const bus = new PendingForks();
		const source = vi.fn();
		const dest = vi.fn();
		bus.register("source-view", source);
		bus.register("dest-view", dest);

		const payload: PendingForkPayload = {
			messages: sliceMessagesThrough(sourceTranscript, "m2") ?? [],
			agentId: "cursor",
			cwd: "/vault",
			sourceTitle: "Original",
			throughMessageId: "m2",
		};
		bus.deliver("dest-view", payload);

		expect(dest).toHaveBeenCalledOnce();
		expect(dest).toHaveBeenCalledWith(payload);
		expect(source).not.toHaveBeenCalled();
		expect(payload.messages).toHaveLength(2);
	});

	it("prepends forked history on the first send only", () => {
		const history = sliceMessagesThrough(sourceTranscript, "m2") ?? [];
		const original: PromptContent[] = [
			{ type: "text", text: "new direction" },
		];

		const first = consumePendingForkContext({
			inject: true,
			history,
			agentContent: original,
		});
		expect(first.injected).toBe(true);
		expect(first.agentContent[0]).toMatchObject({ type: "text" });
		expect((first.agentContent[0] as { text: string }).text).toContain(
			"User:\nfirst",
		);
		expect(first.agentContent.at(-1)).toEqual({
			type: "text",
			text: "new direction",
		});

		const second = consumePendingForkContext({
			inject: false,
			history,
			agentContent: original,
		});
		expect(second.injected).toBe(false);
		expect(second.agentContent).toEqual(original);
	});
});
