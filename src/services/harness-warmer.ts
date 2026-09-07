/**
 * Background ACP harness warmup: spawn + initialize + session/new without a
 * chat view, then hand the live client to the first matching view.
 *
 * Agent-agnostic — any preset or custom id works via warm(agentId).
 */

import type { AcpClient } from "../acp/acp-client";
import type { AgentClientPluginSettings } from "../types/settings";
import type { InitializeResult, SessionResult } from "../types/session";
import {
	buildAgentConfigWithApiKey,
	findAgentSettings,
	isAgentEnabled,
} from "./session-helpers";
import { PRESET_AGENTS } from "./preset-agents";
import { isSameDirectory } from "../utils/platform";
import { getLogger } from "../utils/logger";

export interface ParkedHarness {
	client: AcpClient;
	agentId: string;
	cwd: string;
	sessionResult: SessionResult;
	initResult: InitializeResult;
}

export interface HarnessWarmerDeps {
	createClient: () => AcpClient;
	getSettings: () => AgentClientPluginSettings;
	getVaultCwd: () => string;
	/** True when any live chat view already owns this agent process. */
	hasLiveAgent: (agentId: string) => boolean;
}

/** Agent ids with warmupOnStartup when the master switch is on. */
export function agentsWithWarmupOnStartup(
	settings: AgentClientPluginSettings,
): string[] {
	if (!settings.harnessWarmup.enabled) {
		return [];
	}
	const ids: string[] = [];
	for (const def of PRESET_AGENTS) {
		const preset = settings.presetAgents[def.presetId];
		if (preset?.warmupOnStartup && isAgentEnabled(preset)) {
			ids.push(def.presetId);
		}
	}
	for (const custom of settings.customAgents) {
		if (custom.warmupOnStartup && isAgentEnabled(custom)) {
			ids.push(custom.id);
		}
	}
	return ids;
}

export class HarnessWarmer {
	private parked = new Map<string, ParkedHarness>();
	private warming = new Set<string>();
	private readonly createClient: () => AcpClient;
	private readonly getSettings: () => AgentClientPluginSettings;
	private readonly getVaultCwd: () => string;
	private readonly hasLiveAgent: (agentId: string) => boolean;

	constructor(deps: HarnessWarmerDeps) {
		this.createClient = deps.createClient;
		this.getSettings = deps.getSettings;
		this.getVaultCwd = deps.getVaultCwd;
		this.hasLiveAgent = deps.hasLiveAgent;
	}

	/**
	 * Spawn + ACP initialize + session/new; park the client for later adopt.
	 * Idempotent per agentId. Failures are logged; never throws to callers.
	 */
	async warm(agentId: string): Promise<void> {
		const logger = getLogger();
		if (
			this.parked.has(agentId) ||
			this.warming.has(agentId) ||
			this.hasLiveAgent(agentId)
		) {
			logger.log(
				`[HarnessWarmer] Skip warm(${agentId}): already parked, warming, or live`,
			);
			return;
		}

		const settings = this.getSettings();
		const agentSettings = findAgentSettings(settings, agentId);
		if (!agentSettings) {
			logger.warn(
				`[HarnessWarmer] warm(${agentId}): agent not found in settings`,
			);
			return;
		}
		if (!agentSettings.command?.trim()) {
			logger.warn(
				`[HarnessWarmer] warm(${agentId}): command not configured`,
			);
			return;
		}

		this.warming.add(agentId);
		const cwd = this.getVaultCwd();
		const client = this.createClient();

		try {
			logger.log(`[HarnessWarmer] Warming ${agentId} in ${cwd}`);
			const config = buildAgentConfigWithApiKey(
				agentSettings,
				agentId,
				cwd,
			);
			const initResult = await client.initialize(config);
			const sessionResult = await client.newSession(cwd);
			this.parked.set(agentId, {
				client,
				agentId,
				cwd,
				sessionResult,
				initResult,
			});
			logger.log(
				`[HarnessWarmer] Parked ${agentId} session ${sessionResult.sessionId}`,
			);
		} catch (error) {
			logger.warn(`[HarnessWarmer] warm(${agentId}) failed:`, error);
			try {
				await client.disconnect();
			} catch {
				// ignore teardown errors after warm failure
			}
		} finally {
			this.warming.delete(agentId);
		}
	}

	/**
	 * Steal a parked client when agentId + cwd match. Returns null on miss.
	 */
	adopt(agentId: string, cwd: string): ParkedHarness | null {
		const parked = this.parked.get(agentId);
		if (!parked) return null;
		if (!isSameDirectory(parked.cwd, cwd)) {
			getLogger().log(
				`[HarnessWarmer] adopt(${agentId}): cwd mismatch (parked=${parked.cwd}, want=${cwd})`,
			);
			return null;
		}
		this.parked.delete(agentId);
		getLogger().log(
			`[HarnessWarmer] Adopted ${agentId} session ${parked.sessionResult.sessionId}`,
		);
		return parked;
	}

	/** Whether a matching parked harness exists (tests / diagnostics). */
	hasParked(agentId: string): boolean {
		return this.parked.has(agentId);
	}

	/** Disconnect all parked clients (plugin unload / quit). */
	disconnectAll(): void {
		for (const parked of this.parked.values()) {
			void parked.client.disconnect().catch(() => {});
		}
		this.parked.clear();
		this.warming.clear();
	}
}
