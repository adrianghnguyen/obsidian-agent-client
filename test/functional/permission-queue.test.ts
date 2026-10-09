/**
 * Functional: permission queue through the same channel as chat updates.
 * PermissionManager emits tool calls. AcpHandler drops other session ids.
 * The transcript's active permission is what the composer gate reads.
 */
import { describe, it, expect } from "vitest";
import type * as acp from "@agentclientprotocol/sdk";
import { AcpHandler } from "../../src/acp/acp-handler";
import { PermissionManager } from "../../src/acp/permission-handler";
import { TerminalManager } from "../../src/acp/terminal-handler";
import type AgentClientPlugin from "../../src/plugin";
import { canFlushComposerSend } from "../../src/services/composer-send-queue";
import {
	applySingleUpdate,
	findActivePermission,
} from "../../src/services/message-state";
import type { ChatMessage } from "../../src/types/chat";
import type { SessionUpdate } from "../../src/types/session";
import { getLogger } from "../../src/utils/logger";

const allow = {
	optionId: "allow",
	name: "Allow",
	kind: "allow_once" as const,
};
const reject = {
	optionId: "reject",
	name: "Reject",
	kind: "reject_once" as const,
};

function request(
	sessionId: string,
	toolCallId: string,
): acp.RequestPermissionRequest {
	return {
		sessionId,
		toolCall: {
			toolCallId,
			title: toolCallId,
			status: "pending",
			kind: "edit",
		},
		options: [allow, reject],
	};
}

function wire(autoAllow: boolean): {
	permissions: PermissionManager;
	read: () => ChatMessage[];
} {
	const sessionId = "sess-a";
	let messages: ChatMessage[] = [];
	const index = new Map<string, number>();
	const bridge: { emit: (update: SessionUpdate) => void } = {
		emit: () => {},
	};
	const permissions = new PermissionManager(
		{
			onSessionUpdate: (update: SessionUpdate) => {
				bridge.emit(update);
			},
		},
		autoAllow,
	);
	const handler = new AcpHandler(
		permissions,
		new TerminalManager({} as AgentClientPlugin),
		() => "/vault",
		() => sessionId,
		getLogger(),
	);
	bridge.emit = (update) => handler.emitSessionUpdate(update);
	handler.onSessionUpdate((update) => {
		messages = applySingleUpdate(messages, update, index);
	});
	return {
		permissions,
		read: () => messages,
	};
}

function gates(messages: ChatMessage[]) {
	return canFlushComposerSend({
		isSessionReady: true,
		isSending: false,
		isRestoringSession: false,
		sessionState: "ready",
		hasActivePermission: findActivePermission(messages) !== null,
	});
}

describe("permission queue", () => {
	it("keeps one active permission and blocks the composer until each is answered", async () => {
		const { permissions, read } = wire(false);
		const first = permissions.request(request("sess-a", "edit-1"));
		const second = permissions.request(request("sess-a", "edit-2"));

		expect(findActivePermission(read())?.toolCallId).toBe("edit-1");
		expect(gates(read())).toBe(false);

		let firstOutcome = "";
		void first.then((response) => {
			if (response.outcome.outcome === "selected") {
				firstOutcome = response.outcome.optionId;
			}
		});
		permissions.respond(
			findActivePermission(read())?.requestId ?? "",
			"allow",
		);
		await first;
		expect(firstOutcome).toBe("allow");
		expect(findActivePermission(read())?.toolCallId).toBe("edit-2");
		expect(gates(read())).toBe(false);

		permissions.respond(
			findActivePermission(read())?.requestId ?? "",
			"reject",
		);
		const secondResponse = await second;
		expect(secondResponse.outcome).toEqual({
			outcome: "selected",
			optionId: "reject",
		});
		expect(findActivePermission(read())).toBeNull();
		expect(gates(read())).toBe(true);
	});

	it("auto-allows without leaving an active permission on the transcript", async () => {
		const { permissions, read } = wire(true);
		const response = await permissions.request(request("sess-a", "edit-1"));
		expect(response.outcome).toEqual({
			outcome: "selected",
			optionId: "allow",
		});
		expect(read()).toEqual([]);
		expect(gates(read())).toBe(true);
	});

	it("cancels every pending request and clears the banner", async () => {
		const { permissions, read } = wire(false);
		const pending = permissions.request(request("sess-a", "edit-1"));
		permissions.cancelAll();
		const response = await pending;
		expect(response.outcome.outcome).toBe("cancelled");
		expect(findActivePermission(read())).toBeNull();
		expect(gates(read())).toBe(true);
	});

	it("hides a permission for another session and cancel clears it", async () => {
		const { permissions, read } = wire(false);
		const foreign = permissions.request(request("sess-b", "edit-other"));
		const local = permissions.request(request("sess-a", "edit-here"));
		expect(read().some((message) => JSON.stringify(message).includes("edit-other"))).toBe(
			false,
		);
		expect(findActivePermission(read())).toBeNull();
		expect(gates(read())).toBe(true);

		permissions.cancelAll();
		expect((await foreign).outcome.outcome).toBe("cancelled");
		expect((await local).outcome.outcome).toBe("cancelled");
		expect(findActivePermission(read())).toBeNull();
	});
});
