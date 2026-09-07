import { describe, it, expect, vi, beforeEach } from "vitest";
import {
	HarnessWarmer,
	agentsWithWarmupOnStartup,
	type ParkedHarness,
} from "../src/services/harness-warmer";
import type { AgentClientPluginSettings } from "../src/types/settings";
import { DEFAULT_SETTINGS } from "../src/services/default-settings";
import type { AcpClient } from "../src/acp/acp-client";
import type { InitializeResult, SessionResult } from "../src/types/session";

function makeSettings(
	overrides: Partial<AgentClientPluginSettings> = {},
): AgentClientPluginSettings {
	return {
		...DEFAULT_SETTINGS,
		...overrides,
		harnessWarmup: {
			...DEFAULT_SETTINGS.harnessWarmup,
			...(overrides.harnessWarmup ?? {}),
		},
		presetAgents: {
			...DEFAULT_SETTINGS.presetAgents,
			...(overrides.presetAgents ?? {}),
		},
		customAgents: overrides.customAgents ?? [],
	};
}

function makeFakeClient(agentId = "agy"): AcpClient {
	const initResult: InitializeResult = {
		authMethods: [],
		protocolVersion: 1,
	};
	const sessionResult: SessionResult = {
		sessionId: "warm-session-1",
		configOptions: [],
	};
	return {
		initialize: vi.fn(async () => initResult),
		newSession: vi.fn(async () => sessionResult),
		disconnect: vi.fn(async () => {}),
		isInitialized: vi.fn(() => true),
		getCurrentAgentId: vi.fn(() => agentId),
		getCurrentSessionId: vi.fn(() => sessionResult.sessionId),
		getWorkingDirectory: vi.fn(() => "C:/vault"),
		getLastInitResult: vi.fn(() => initResult),
		getLastSessionResult: vi.fn(() => sessionResult),
		updateAutoAllow: vi.fn(),
	} as unknown as AcpClient;
}

describe("agentsWithWarmupOnStartup", () => {
	it("returns empty when master switch is off", () => {
		const settings = makeSettings({
			harnessWarmup: { enabled: false, delayMs: 1000 },
			customAgents: [
				{
					id: "agy",
					displayName: "Anti-Gravity",
					command: "agy",
					args: [],
					env: [],
					warmupOnStartup: true,
				},
			],
		});
		expect(agentsWithWarmupOnStartup(settings)).toEqual([]);
	});

	it("lists enabled custom and preset agents with warmupOnStartup", () => {
		const settings = makeSettings({
			harnessWarmup: { enabled: true, delayMs: 1000 },
			presetAgents: {
				...DEFAULT_SETTINGS.presetAgents,
				"gemini-cli": {
					...DEFAULT_SETTINGS.presetAgents["gemini-cli"],
					warmupOnStartup: true,
				},
			},
			customAgents: [
				{
					id: "agy",
					displayName: "Anti-Gravity",
					command: "agy",
					args: [],
					env: [],
					warmupOnStartup: true,
				},
				{
					id: "other",
					displayName: "Other",
					command: "other",
					args: [],
					env: [],
					warmupOnStartup: false,
				},
			],
		});
		expect(agentsWithWarmupOnStartup(settings).sort()).toEqual([
			"agy",
			"gemini-cli",
		]);
	});
});

describe("HarnessWarmer", () => {
	let liveAgents: Set<string>;
	let createClient: ReturnType<typeof vi.fn>;
	let warmer: HarnessWarmer;

	beforeEach(() => {
		liveAgents = new Set();
		createClient = vi.fn(() => makeFakeClient("agy"));
		warmer = new HarnessWarmer({
			createClient: createClient as () => AcpClient,
			getSettings: () =>
				makeSettings({
					harnessWarmup: { enabled: true, delayMs: 0 },
					customAgents: [
						{
							id: "agy",
							displayName: "Anti-Gravity",
							command: "agy-acp",
							args: [],
							env: [],
							warmupOnStartup: true,
						},
					],
				}),
			getVaultCwd: () => "C:/vault",
			hasLiveAgent: (id) => liveAgents.has(id),
		});
	});

	it("warm initialize + newSession and parks the client", async () => {
		await warmer.warm("agy");
		expect(createClient).toHaveBeenCalledOnce();
		const client = createClient.mock.results[0].value as AcpClient;
		expect(client.initialize).toHaveBeenCalledOnce();
		expect(client.newSession).toHaveBeenCalledWith("C:/vault");
		expect(warmer.hasParked("agy")).toBe(true);
	});

	it("skips warm when a live view already owns the agent", async () => {
		liveAgents.add("agy");
		await warmer.warm("agy");
		expect(createClient).not.toHaveBeenCalled();
	});

	it("skips a second warm while parked", async () => {
		await warmer.warm("agy");
		await warmer.warm("agy");
		expect(createClient).toHaveBeenCalledOnce();
	});

	it("adopt transfers parked client when cwd matches", async () => {
		await warmer.warm("agy");
		const parked = warmer.adopt("agy", "C:/vault");
		expect(parked).not.toBeNull();
		expect((parked as ParkedHarness).sessionResult.sessionId).toBe(
			"warm-session-1",
		);
		expect(warmer.hasParked("agy")).toBe(false);
		expect(warmer.adopt("agy", "C:/vault")).toBeNull();
	});

	it("adopt returns null on cwd mismatch and keeps park", async () => {
		await warmer.warm("agy");
		expect(warmer.adopt("agy", "D:/other")).toBeNull();
		expect(warmer.hasParked("agy")).toBe(true);
	});

	it("disconnectAll tears down parked clients", async () => {
		await warmer.warm("agy");
		const client = createClient.mock.results[0].value as AcpClient;
		warmer.disconnectAll();
		expect(client.disconnect).toHaveBeenCalledOnce();
		expect(warmer.hasParked("agy")).toBe(false);
	});
});
