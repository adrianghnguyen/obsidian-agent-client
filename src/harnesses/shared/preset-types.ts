/**
 * Preset agent row types — shared between harness modules and settings code.
 */

/** Legacy plaintext-key → secret-storage migration wiring (original presets only). */
export interface PresetAgentApiKeyLegacy {
	/** Preferred secret id to create on migration. */
	defaultSecretId: string;
	/** Fallback secret id when the preferred one is taken by another value. */
	fallbackSecretId: string;
	/**
	 * Agent name used inside the migration Notices. Kept explicit because it
	 * historically differs from defaultDisplayName ("Claude" vs "Claude Code",
	 * "Gemini" vs "Gemini CLI") and deriving it would change user-facing text.
	 */
	noticeLabel: string;
}

/** API-key injection wiring. Absent = the agent has no API key row (login-only). */
export interface PresetAgentApiKey {
	/** Environment variable the resolved secret is injected as at spawn time. */
	envVarName: string;
	/** Description shown under the "API key" setting. */
	settingDesc: string;
	/** Present only for presets that ever stored a plaintext key in data.json. */
	legacy?: PresetAgentApiKeyLegacy;
}

/** Copyable install hint(s) shown under the Path setting. */
export interface PresetAgentInstallHint {
	default: string;
	/** Shown instead of `default` on native Windows (WSL mode keeps `default`). */
	nativeWindows?: string;
}

/** Per-preset settings-screen copy that deviates from the shared template. */
export interface PresetAgentSettingsCopy {
	/** Description of the Path setting. */
	pathDesc: string;
	/** Appended verbatim to the shared Arguments description. */
	argsDescSuffix?: string;
	/** Inserted between the shared env intro and the derived-API-key sentence. */
	envDescExtra?: string;
	/** Placeholder for the Environment variables textarea. */
	envPlaceholder?: string;
}

/**
 * Static, code-shipped definition of a preset agent. Users never edit this;
 * their overrides live in settings.presetAgents[presetId].
 */
export interface PresetAgentDefinition {
	/**
	 * Stable id — the agentId AND the presetAgents record key. The stored
	 * entry's inner `id` is force-synced to this (never read from data.json).
	 */
	presetId: string;
	defaultDisplayName: string;
	defaultCommand: string;
	/**
	 * Default args. Normalization falls back to these whenever the stored
	 * args sanitize to empty (historic Gemini behavior, generalized — for
	 * presets with non-empty defaults the args are effectively unclearable).
	 */
	defaultArgs: string[];
	/** Legacy data.json per-agent sub-object key (original four presets only). */
	legacySettingsKey?: "claude" | "codex" | "gemini" | "mistralVibe";
	/** Legacy data.json top-level command-path key (claude / gemini only). */
	legacyCommandPathKey?: string;
	apiKey?: PresetAgentApiKey;
	/**
	 * Custom-agent id this preset absorbs on first load (one-shot migration).
	 * Set ONLY for presets whose id our docs historically advised as a
	 * custom-agent recipe — those customs are docs-followers by near
	 * certainty, so adopting their settings preserves what the id meant
	 * (fence pins, saved sessions, default agent). Deliberately NOT a
	 * generic custom-id==presetId rule: customs colliding with the original
	 * four preset ids are dead weight under preset-first resolution, and
	 * absorbing them would overwrite live preset settings.
	 */
	absorbsCustomAgentId?: string;
	installHint: PresetAgentInstallHint;
	settingsCopy: PresetAgentSettingsCopy;
	/** Page name under docs/agent-setup/ (for setup-guide references). */
	docsPage: string;
}
