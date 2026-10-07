/**
 * Functional: what would be spawned, without spawning an ACP agent.
 * Settings → command resolution → secret env → harness session-open plan.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { applyHarnessConnectionError, openHarnessSession } from "../../src/harnesses";
import { CURSOR_SESSION_AUTH_METHOD } from "../../src/harnesses/cursor/preset";
import { setCursorSessionAuthTrustStorageForTests } from "../../src/harnesses/cursor/session-auth";
import { HarnessAuthRequiredError } from "../../src/harnesses/shared/harness-auth-error";
import { DEFAULT_SETTINGS } from "../../src/services/default-settings";
import {
	buildAgentConfigWithApiKey,
	buildHarnessSessionOpenEnv,
	findAgentSettings,
} from "../../src/services/session-helpers";
import { resolveHarnessSpawnCommand } from "../../src/services/harness-spawn-command";
import type { ProcessError } from "../../src/types/errors";
import type { AgentClientPluginSettings } from "../../src/types/settings";

const MISSING_CURSOR = "/tmp/missing-cursor-agent-836e";

function settings(): AgentClientPluginSettings {
	return structuredClone(DEFAULT_SETTINGS);
}

afterEach(() => {
	setCursorSessionAuthTrustStorageForTests(null);
});

describe("harness spawn plan", () => {
	it("falls back when a Cursor path is missing and injects CURSOR_API_KEY", async () => {
		const state = settings();
		state.presetAgents.cursor.command = MISSING_CURSOR;
		state.presetAgents.cursor.apiKeySecretId = "cursor-api-key";
		const agent = findAgentSettings(state, "cursor");
		expect(agent).not.toBeNull();
		if (!agent) return;

		const config = buildAgentConfigWithApiKey(agent, "cursor", "/vault");
		const command = await resolveHarnessSpawnCommand("cursor", config.command);
		const env = buildHarnessSessionOpenEnv(config, (id) =>
			id === "cursor-api-key" ? "cursor-secret" : undefined,
		);

		expect(command).toBe("agent");
		expect(config.args).toEqual(["acp"]);
		expect(env.CURSOR_API_KEY).toBe("cursor-secret");
		expect(config.apiKey?.envVarName).toBe("CURSOR_API_KEY");
	});

	it("skips authenticate when Cursor credentials are already in the env", async () => {
		const authenticate = vi.fn(async () => true);
		const newSession = vi.fn(async () => ({ sessionId: "sess-1" }));
		const opened = await openHarnessSession(
			"cursor",
			"/vault",
			{ authenticate, newSession },
			{
				command: "agent",
				args: ["acp"],
				env: { CURSOR_API_KEY: "cursor-secret" },
			},
		);
		expect(opened.sessionId).toBe("sess-1");
		expect(authenticate).not.toHaveBeenCalled();
		expect(newSession).toHaveBeenCalledWith("/vault");
	});

	it("defers Cursor auth when session open fails after credentials looked ready", async () => {
		const authenticate = vi.fn(async () => true);
		const newSession = vi.fn(async () => {
			throw new Error("authentication required");
		});
		await expect(
			openHarnessSession(
				"cursor",
				"/vault",
				{ authenticate, newSession },
				{
					command: "agent",
					args: ["acp"],
					env: { CURSOR_API_KEY: "cursor-secret" },
				},
			),
		).rejects.toBeInstanceOf(HarnessAuthRequiredError);
		expect(authenticate).not.toHaveBeenCalled();
		expect(newSession).toHaveBeenCalledOnce();
	});

	it("authenticates Cursor before newSession when no key and no trusted login", async () => {
		const saved = process.env.CURSOR_API_KEY;
		delete process.env.CURSOR_API_KEY;
		setCursorSessionAuthTrustStorageForTests({
			load: () => null,
			save: () => {},
		});
		const authenticate = vi.fn(async () => true);
		const newSession = vi.fn(async () => ({ sessionId: "sess-2" }));
		try {
			await openHarnessSession(
				"cursor",
				"/vault",
				{ authenticate, newSession },
				{ command: MISSING_CURSOR, args: ["acp"], env: {} },
			);
			expect(authenticate).toHaveBeenCalledWith(CURSOR_SESSION_AUTH_METHOD);
			expect(newSession).toHaveBeenCalledWith("/vault");
		} finally {
			if (saved === undefined) delete process.env.CURSOR_API_KEY;
			else process.env.CURSOR_API_KEY = saved;
		}
	}, 20000);

	it("opens Claude with no authenticate step", async () => {
		const authenticate = vi.fn(async () => true);
		const newSession = vi.fn(async () => ({ sessionId: "sess-c" }));
		await openHarnessSession("claude-code-acp", "/vault", {
			authenticate,
			newSession,
		});
		expect(authenticate).not.toHaveBeenCalled();
		expect(newSession).toHaveBeenCalledWith("/vault");
	});

	it("rewrites a missing-CLI process error and refuses a custom id", async () => {
		const error: ProcessError = {
			type: "spawn_failed",
			agentId: "cursor",
			title: "Spawn failed",
			message: "spawn agent ENOENT",
			errorCode: "ENOENT",
		};
		const card = applyHarnessConnectionError(error, {
			command: "agent",
			args: ["acp"],
		});
		expect(card.title).toBe("Cursor CLI Not Found");

		const state = settings();
		state.customAgents.push({
			id: "custom-1",
			displayName: "Custom",
			command: "my-agent",
			args: ["--acp"],
			env: [{ key: "FOO", value: "bar" }],
		});
		const custom = findAgentSettings(state, "custom-1");
		expect(custom).not.toBeNull();
		if (!custom) return;
		const config = buildAgentConfigWithApiKey(custom, "custom-1", "/vault");
		expect(config.apiKey).toBeUndefined();
		expect(config.env).toEqual({ FOO: "bar" });
		expect(
			await resolveHarnessSpawnCommand("custom-1", config.command),
		).toBe("my-agent");
		await expect(
			openHarnessSession("custom-1", "/vault", {
				authenticate: vi.fn(async () => true),
				newSession: vi.fn(async () => ({})),
			}),
		).rejects.toThrow('Unknown harness "custom-1"');
	});
});
