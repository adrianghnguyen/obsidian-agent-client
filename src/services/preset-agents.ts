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

import { CURSOR_PRESET_ID } from "../harnesses/cursor";

export { PRESET_AGENTS } from "../harnesses";
export { CURSOR_PRESET_ID };
export { ANTIGRAVITY_PRESET_ID } from "../harnesses/antigravity";

/** Default agent for new installs and fallbacks when no valid default is stored. */
export const DEFAULT_PRESET_AGENT_ID = CURSOR_PRESET_ID;
