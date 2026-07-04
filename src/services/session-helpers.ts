/**
 * Pure helper functions for agent session management.
 * Extracted from useSession hook for reusability and testability.
 */

import type { AgentClientPluginSettings } from "../plugin";
import type {
	BaseAgentSettings,
	PresetAgentUserSettings,
} from "../types/agent";
import type { ChatSession, SavedSessionInfo } from "../types/session";
import type { ChatMessage } from "../types/chat";
import { toAgentConfig } from "./settings-normalizer";
import { PRESET_AGENTS } from "./preset-agents";
import { truncateTitle } from "../utils/text";
import type { AgentUpdateNotification } from "./update-checker";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent information for display.
 * (Inlined from SwitchAgentUseCase)
 */
export interface AgentDisplayInfo {
	/** Unique agent ID */
	id: string;
	/** Display name for UI */
	displayName: string;
}

// ============================================================================
// Helper Functions (Inlined from SwitchAgentUseCase)
// ============================================================================

/**
 * Get the default agent ID from settings (for new views).
 */
export function getDefaultAgentId(settings: AgentClientPluginSettings): string {
	return settings.defaultAgentId || PRESET_AGENTS[0].presetId;
}

/**
 * Get list of all available agents from settings.
 *
 * The single enumeration implementation (plugin.getAvailableAgents delegates
 * here): registry-ordered presets first, then custom agents. Unknown
 * presetAgents entries (version skew) are deliberately not enumerated.
 */
export function getAvailableAgentsFromSettings(
	settings: AgentClientPluginSettings,
): AgentDisplayInfo[] {
	return [
		...PRESET_AGENTS.map((def) => {
			const preset = settings.presetAgents[def.presetId];
			return {
				id: def.presetId,
				displayName: preset?.displayName || def.presetId,
			};
		}),
		...settings.customAgents.map((agent) => ({
			id: agent.id,
			displayName: agent.displayName || agent.id,
		})),
	];
}

/**
 * Get the currently active agent information from settings.
 */
export function getCurrentAgent(
	settings: AgentClientPluginSettings,
	agentId?: string,
): AgentDisplayInfo {
	const activeId = agentId || getDefaultAgentId(settings);
	const agents = getAvailableAgentsFromSettings(settings);
	return (
		agents.find((agent) => agent.id === activeId) || {
			id: activeId,
			displayName: activeId,
		}
	);
}

// ============================================================================
// Helper Functions (Inlined from ManageSessionUseCase)
// ============================================================================

/**
 * Find agent settings by ID from plugin settings.
 *
 * Presets resolve before custom agents (a custom sharing a preset id has
 * never been reachable). The preset lookup is gated on registry membership
 * so preserved unknown presetAgents entries (version skew) never shadow a
 * same-id custom agent.
 */
export function findAgentSettings(
	settings: AgentClientPluginSettings,
	agentId: string,
): BaseAgentSettings | null {
	if (PRESET_AGENTS.some((def) => def.presetId === agentId)) {
		const preset = settings.presetAgents[agentId];
		if (preset) {
			return preset;
		}
	}
	// Search in custom agents
	const customAgent = settings.customAgents.find(
		(agent) => agent.id === agentId,
	);
	return customAgent || null;
}

/**
 * Build AgentConfig with API key injection intent for preset agents.
 *
 * For presets with API-key wiring in the registry, attaches an `apiKey`
 * intent (secretId + envVarName) to the config. AcpClient.initialize()
 * resolves the secret value from Obsidian's secret storage just before
 * spawn.
 *
 * Custom agents (and presets without an apiKey registry entry) pass through
 * unchanged (they manage env vars directly).
 */
export function buildAgentConfigWithApiKey(
	agentSettings: BaseAgentSettings,
	agentId: string,
	workingDirectory: string,
) {
	const baseConfig = toAgentConfig(agentSettings, workingDirectory);

	const def = PRESET_AGENTS.find((d) => d.presetId === agentId);
	if (def?.apiKey) {
		const presetSettings = agentSettings as PresetAgentUserSettings;
		return {
			...baseConfig,
			apiKey: {
				secretId: presetSettings.apiKeySecretId,
				envVarName: def.apiKey.envVarName,
			},
		};
	}

	// Custom agents — no API key injection
	return baseConfig;
}

// ============================================================================
// Initial State
// ============================================================================

/**
 * Create initial session state.
 */
export function createInitialSession(
	agentId: string,
	agentDisplayName: string,
	workingDirectory: string,
): ChatSession {
	return {
		sessionId: null,
		state: "disconnected",
		agentId,
		agentDisplayName,
		authMethods: [],
		availableCommands: undefined,
		modes: undefined,
		createdAt: new Date(),
		lastActivityAt: new Date(),
		workingDirectory,
	};
}

// ============================================================================
// Session Title Derivation
// ============================================================================

/** Derive the session display title (saved title > first user message > "New session"). */
export function computeSessionTitle(
	sessionId: string | null,
	savedSessions: SavedSessionInfo[],
	messages: ChatMessage[],
): string {
	if (sessionId) {
		const saved = savedSessions.find((s) => s.sessionId === sessionId);
		if (saved?.title) return saved.title;
	}
	const firstUserMessage = messages.find((m) => m.role === "user");
	if (firstUserMessage) {
		const textContent = firstUserMessage.content.find(
			(c) => c.type === "text" || c.type === "text_with_context",
		);
		if (textContent && "text" in textContent) {
			return truncateTitle(textContent.text);
		}
	}
	return "New session";
}

// ============================================================================
// Gemini CLI Deprecation Notice
// ============================================================================

/** Docs URL for the Gemini CLI deprecation announcement. */
export const GEMINI_DEPRECATION_DOCS_URL =
	"https://rait-09.github.io/obsidian-agent-client/announcements/gemini-cli-deprecation.html";

/**
 * Build the in-app notice shown while the Gemini CLI agent is selected.
 *
 * Google is retiring Gemini CLI for account-login (Pro/Ultra/free) tiers on
 * June 18, 2026. This notice is static (no network) and is driven purely by the
 * active agent id, unlike the npm-registry-backed agent update check.
 */
export function buildGeminiDeprecationNotice(): AgentUpdateNotification {
	return {
		variant: "info",
		title: "Gemini CLI is being discontinued",
		message:
			"Google is retiring account login for Gemini CLI (Pro/Ultra/free tiers) on June 18, 2026. " +
			"Google states Gemini CLI stays accessible via a paid Gemini API key — see the guide for setup and privacy notes.",
		link: { text: "Learn more", url: GEMINI_DEPRECATION_DOCS_URL },
	};
}
