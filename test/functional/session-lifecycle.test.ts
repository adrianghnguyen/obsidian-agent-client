/**
 * Functional: open a chat, restore saved mode, and send.
 * Real settings helpers, config restore, and sendPreparedPrompt.
 * No ACP process.
 */
import { describe, it, expect, vi } from "vitest";
import type { AcpClient } from "../../src/acp/acp-client";
import { AcpErrorCode } from "../../src/types/errors";
import type { PromptContent } from "../../src/types/chat";
import { DEFAULT_SETTINGS } from "../../src/services/default-settings";
import {
	buildAgentConfigWithApiKey,
	buildHarnessSessionOpenEnv,
	createInitialSession,
	findAgentSettings,
	getDefaultAgentId,
	nextEnabledAgentId,
} from "../../src/services/session-helpers";
import {
	restoreLegacyConfig,
	tryRestoreConfigOption,
} from "../../src/services/session-state";
import { sendPreparedPrompt } from "../../src/services/message-sender";
import type {
	SessionConfigOption,
	SessionModeState,
	SessionResult,
} from "../../src/types/session";
import type { AgentClientPluginSettings } from "../../src/types/settings";

const CLAUDE = "claude-code-acp";
const CURSOR = "cursor";

function settings(): AgentClientPluginSettings {
	return structuredClone(DEFAULT_SETTINGS);
}

const display: PromptContent[] = [{ type: "text", text: "hello" }];

describe("session lifecycle", () => {
	it("starts a new chat on the enabled default and still resolves a disabled agent", () => {
		const fresh = settings();
		expect(getDefaultAgentId(fresh)).toBe(CURSOR);
		const opened = createInitialSession(
			getDefaultAgentId(fresh),
			"Cursor",
			"/vault",
		);
		expect(opened.state).toBe("disconnected");
		expect(opened.sessionId).toBeNull();
		expect(opened.workingDirectory).toBe("/vault");

		fresh.presetAgents[CURSOR].enabled = false;
		expect(getDefaultAgentId(fresh)).toBe(CLAUDE);

		const disabled = findAgentSettings(fresh, CURSOR);
		expect(disabled).not.toBeNull();
		expect(disabled?.command).toBe("agent");

		const switched = nextEnabledAgentId(fresh, CLAUDE);
		const next = createInitialSession(switched, switched, "/vault");
		expect(next.agentId).toBe("codex-acp");
		expect(next.sessionId).toBeNull();
		expect(next.state).toBe("disconnected");
	});

	it("injects an API key only when a secret id is set", () => {
		const state = settings();
		const claude = findAgentSettings(state, CLAUDE);
		expect(claude).not.toBeNull();
		if (!claude) return;

		const withoutKey = buildAgentConfigWithApiKey(claude, CLAUDE, "/vault");
		expect(withoutKey.apiKey).toBeUndefined();
		expect(
			buildHarnessSessionOpenEnv(withoutKey, () => "should-not-be-read")
				.ANTHROPIC_API_KEY,
		).toBeUndefined();

		const withPointer = {
			...claude,
			apiKeySecretId: "claude-api-key",
			env: [{ key: "EXTRA", value: "1" }],
		};
		const config = buildAgentConfigWithApiKey(withPointer, CLAUDE, "/vault");
		expect(config.apiKey).toEqual({
			secretId: "claude-api-key",
			envVarName: "ANTHROPIC_API_KEY",
		});
		expect(config.command).toBe("claude-agent-acp");

		const env = buildHarnessSessionOpenEnv(config, (id) =>
			id === "claude-api-key" ? "sk-test" : "",
		);
		expect(env.ANTHROPIC_API_KEY).toBe("sk-test");
		expect(env.EXTRA).toBe("1");

		const blank = buildHarnessSessionOpenEnv(config, () => "  ");
		expect(blank.ANTHROPIC_API_KEY).toBeUndefined();
	});

	it("restores a saved mode on the client before the session is marked ready", async () => {
		const setSessionMode = vi.fn(async () => {});
		const setSessionConfigOption = vi.fn(
			async (): Promise<SessionConfigOption[]> => [
				{
					id: "model",
					name: "Model",
					type: "select",
					category: "model",
					currentValue: "opus",
					options: [
						{ value: "fast", name: "Fast" },
						{ value: "opus", name: "Opus" },
					],
				},
			],
		);
		const client = {
			setSessionMode,
			setSessionConfigOption,
		} as unknown as AcpClient;

		const modes: SessionModeState = {
			currentModeId: "agent",
			availableModes: [
				{ id: "agent", name: "Agent" },
				{ id: "plan", name: "Plan" },
			],
		};
		const sessionResult = {
			sessionId: "sess-1",
			modes,
		} as SessionResult;

		const restored = await restoreLegacyConfig(client, sessionResult, "plan");
		expect(setSessionMode).toHaveBeenCalledWith("sess-1", "plan");
		expect(restored.modes?.currentModeId).toBe("plan");

		setSessionMode.mockClear();
		const stale = await restoreLegacyConfig(
			client,
			sessionResult,
			"missing-mode",
		);
		expect(setSessionMode).not.toHaveBeenCalled();
		expect(stale.modes?.currentModeId).toBe("agent");

		const options: SessionConfigOption[] = [
			{
				id: "model",
				name: "Model",
				type: "select",
				category: "model",
				currentValue: "fast",
				options: [
					{ value: "fast", name: "Fast" },
					{ value: "opus", name: "Opus" },
				],
			},
		];
		const nextOptions = await tryRestoreConfigOption(
			client,
			"sess-1",
			options,
			"model",
			"opus",
		);
		expect(setSessionConfigOption).toHaveBeenCalledWith(
			"sess-1",
			"model",
			"opus",
		);
		const model = nextOptions.find((option) => option.id === "model");
		expect(model?.type === "select" && model.currentValue).toBe("opus");
	});

	it("retries a send once when authentication is required and a single method exists", async () => {
		const calls: string[] = [];
		let attempts = 0;
		const client = {
			sendPrompt: vi.fn(async () => {
				attempts += 1;
				calls.push("send");
				if (attempts === 1) {
					throw Object.assign(new Error("Authentication required"), {
						code: AcpErrorCode.AUTHENTICATION_REQUIRED,
					});
				}
			}),
			authenticate: vi.fn(async (methodId: string) => {
				calls.push(`auth:${methodId}`);
				return true;
			}),
		} as unknown as AcpClient;

		const retried = await sendPreparedPrompt(
			{
				sessionId: "sess-1",
				agentContent: display,
				displayContent: display,
				authMethods: [{ id: "cursor_login", name: "Cursor" }],
			},
			client,
		);
		expect(retried.success).toBe(true);
		expect(retried.retriedSuccessfully).toBe(true);
		expect(calls).toEqual(["send", "auth:cursor_login", "send"]);

		const choose = await sendPreparedPrompt(
			{
				sessionId: "sess-1",
				agentContent: display,
				displayContent: display,
				authMethods: [
					{ id: "a", name: "A" },
					{ id: "b", name: "B" },
				],
			},
			{
				sendPrompt: vi.fn(async () => {
					throw Object.assign(new Error("Authentication required"), {
						code: AcpErrorCode.AUTHENTICATION_REQUIRED,
					});
				}),
				authenticate: vi.fn(async () => true),
			} as unknown as AcpClient,
		);
		expect(choose.success).toBe(false);
		expect(choose.requiresAuth).toBe(true);

		const empty = await sendPreparedPrompt(
			{
				sessionId: "sess-1",
				agentContent: display,
				displayContent: display,
				authMethods: [],
			},
			{
				sendPrompt: vi.fn(async () => {
					throw Object.assign(new Error("empty response text"), {
						code: AcpErrorCode.INTERNAL_ERROR,
					});
				}),
				authenticate: vi.fn(),
			} as unknown as AcpClient,
		);
		expect(empty.success).toBe(true);
		expect(empty.error).toBeUndefined();
	});
});
