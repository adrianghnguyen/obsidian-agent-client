/**
 * Static registry of preset (built-in) agents.
 *
 * Preset rows now live in `src/harnesses/<id>/preset.ts` and are aggregated
 * by the harness registry. This module re-exports the derived list for existing
 * consumers (`settings-normalizer`, `SettingsTab`, session helpers, etc.).
 *
 * Adding a preset agent = adding one harness module + a docs page
 * (see AGENTS.md "Add Preset Agent").
 */

export type {
	PresetAgentApiKeyLegacy,
	PresetAgentApiKey,
	PresetAgentInstallHint,
	PresetAgentSettingsCopy,
	PresetAgentDefinition,
} from "../harnesses/shared/preset-types";

export { PRESET_AGENTS, GEMINI_PRESET_ID } from "../harnesses";
export { CURSOR_PRESET_ID } from "../harnesses/cursor";
export { ANTIGRAVITY_PRESET_ID } from "../harnesses/antigravity";
