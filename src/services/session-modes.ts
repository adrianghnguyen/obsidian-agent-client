/**
 * Resolve advertised ACP session modes for the change-agent-mode command.
 *
 * Prefers a mode-like `configOptions` select (newer ACP API). Falls back to
 * legacy `session.modes` (`session/set_mode`). Does not hardcode Agent/Plan/Ask
 * — those names only appear if the connected agent advertises them.
 */

import {
	flattenConfigSelectOptions,
	type SessionConfigOption,
	type SessionModeState,
} from "../types/session";

export interface AdvertisedSessionMode {
	id: string;
	name: string;
	description?: string;
	source: { type: "legacy" } | { type: "config"; configId: string };
}

type SelectConfigOption = Extract<SessionConfigOption, { type: "select" }>;

function isModeLikeOption(option: SelectConfigOption): boolean {
	if (option.id === "mode" || option.id.endsWith("/mode")) return true;
	if (option.category === "mode") return true;
	if (/^mode$/i.test(option.name)) return true;
	return false;
}

export function findModeConfigOption(
	configOptions?: SessionConfigOption[],
): SelectConfigOption | undefined {
	if (!configOptions || configOptions.length === 0) return undefined;
	const selects = configOptions.filter(
		(opt): opt is SelectConfigOption => opt.type === "select",
	);
	return selects.find(isModeLikeOption);
}

export function listAdvertisedSessionModes(
	modes?: SessionModeState,
	configOptions?: SessionConfigOption[],
): AdvertisedSessionMode[] {
	const modeOption = findModeConfigOption(configOptions);
	if (modeOption) {
		return flattenConfigSelectOptions(modeOption.options).map((opt) => ({
			id: opt.value,
			name: opt.name,
			description: opt.description ?? undefined,
			source: { type: "config", configId: modeOption.id },
		}));
	}

	if (!modes?.availableModes) return [];
	return modes.availableModes.map((m) => ({
		id: m.id,
		name: m.name,
		description: m.description,
		source: { type: "legacy" as const },
	}));
}

export function getCurrentModeId(
	listed: AdvertisedSessionMode[],
	modes?: SessionModeState,
	configOptions?: SessionConfigOption[],
): string | undefined {
	if (listed.length === 0) return undefined;
	const first = listed[0];
	if (first.source.type === "config") {
		const option = findModeConfigOption(configOptions);
		if (option) return option.currentValue;
	}
	return modes?.currentModeId;
}

/**
 * Next mode after `currentId` (wraps). Returns undefined when there is
 * nothing to cycle to (0 or 1 advertised modes).
 */
export function nextAdvertisedMode(
	listed: AdvertisedSessionMode[],
	currentId: string | undefined,
): AdvertisedSessionMode | undefined {
	if (listed.length < 2) return undefined;
	const index = currentId ? listed.findIndex((m) => m.id === currentId) : -1;
	const nextIndex = index >= 0 ? (index + 1) % listed.length : 0;
	return listed[nextIndex];
}
