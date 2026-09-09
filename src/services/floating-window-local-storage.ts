import {
	clampFloatingWindowSize,
	obj,
	parseOptionalFloatingWindowSize,
	xyPoint,
	type FloatingWindowPoint,
	type FloatingWindowSize,
} from "./settings-normalizer";

/** Vault- and device-scoped localStorage key (namespaced by Obsidian). */
export const FLOATING_WINDOW_LOCAL_LAYOUT_KEY = "floating-window-layout-v1";

export interface FloatingWindowLocalLayout {
	lastSize: FloatingWindowSize;
	lastPosition: FloatingWindowPoint;
}

/** Minimal App localStorage surface for tests and plugin wiring. */
export interface FloatingWindowLocalStorageAccess {
	load(key: string): unknown;
	save(key: string, data: unknown | null): void;
}

export function createAppLocalStorageAccess(
	app: { loadLocalStorage(key: string): unknown; saveLocalStorage(key: string, data: unknown | null): void },
): FloatingWindowLocalStorageAccess {
	return {
		load: (key) => app.loadLocalStorage(key),
		save: (key, data) => app.saveLocalStorage(key, data),
	};
}

export function parseFloatingWindowLocalLayout(
	raw: unknown,
): FloatingWindowLocalLayout | null {
	const o = obj(raw);
	if (!o) return null;

	const lastSize = parseOptionalFloatingWindowSize(o.lastSize);
	const lastPosition = xyPoint(o.lastPosition);
	if (!lastSize || !lastPosition) return null;

	return {
		lastSize: clampFloatingWindowSize(lastSize),
		lastPosition,
	};
}

export function readFloatingWindowLocalLayout(
	access: FloatingWindowLocalStorageAccess,
): FloatingWindowLocalLayout | null {
	return parseFloatingWindowLocalLayout(
		access.load(FLOATING_WINDOW_LOCAL_LAYOUT_KEY),
	);
}

export function writeFloatingWindowLocalLayout(
	access: FloatingWindowLocalStorageAccess,
	layout: FloatingWindowLocalLayout,
): void {
	access.save(FLOATING_WINDOW_LOCAL_LAYOUT_KEY, {
		lastSize: clampFloatingWindowSize(layout.lastSize),
		lastPosition: layout.lastPosition,
	});
}

export function clearFloatingWindowLocalLayout(
	access: FloatingWindowLocalStorageAccess,
): void {
	access.save(FLOATING_WINDOW_LOCAL_LAYOUT_KEY, null);
}

export function floatingWindowLocalLayoutsEqual(
	a: FloatingWindowLocalLayout | null,
	b: FloatingWindowLocalLayout | null,
): boolean {
	if (!a || !b) return a === b;
	return (
		a.lastSize.width === b.lastSize.width &&
		a.lastSize.height === b.lastSize.height &&
		a.lastPosition.x === b.lastPosition.x &&
		a.lastPosition.y === b.lastPosition.y
	);
}

/**
 * Build a device-local layout from synced settings fields (one-time migration).
 */
export function floatingWindowLocalLayoutFromSynced(
	lastSize: FloatingWindowSize | null,
	lastPosition: FloatingWindowPoint | null,
): FloatingWindowLocalLayout | null {
	if (!lastSize || !lastPosition) return null;
	return {
		lastSize: clampFloatingWindowSize(lastSize),
		lastPosition,
	};
}

/**
 * Read last layout from raw data.json before synced last fields are removed.
 */
export function extractSyncedFloatingWindowLastLayout(
	raw: Record<string, unknown>,
): FloatingWindowLocalLayout | null {
	const legacySize = parseOptionalFloatingWindowSize(raw.floatingWindowSize);
	const legacyPos = xyPoint(raw.floatingWindowPosition);
	const lastSize =
		parseOptionalFloatingWindowSize(raw.floatingWindowLastSize) ??
		legacySize;
	const lastPosition =
		xyPoint(raw.floatingWindowLastPosition) ?? legacyPos;
	return floatingWindowLocalLayoutFromSynced(lastSize, lastPosition);
}

export function hasSyncedFloatingWindowLastLayout(
	raw: Record<string, unknown>,
): boolean {
	return extractSyncedFloatingWindowLastLayout(raw) !== null;
}
