import { describe, it, expect, beforeEach } from "vitest";
import {
	FLOATING_WINDOW_LOCAL_LAYOUT_KEY,
	clearFloatingWindowLocalLayout,
	extractSyncedFloatingWindowLastLayout,
	floatingWindowLocalLayoutFromSynced,
	floatingWindowLocalLayoutsEqual,
	hasSyncedFloatingWindowLastLayout,
	parseFloatingWindowLocalLayout,
	readFloatingWindowLocalLayout,
	writeFloatingWindowLocalLayout,
	type FloatingWindowLocalStorageAccess,
} from "../src/services/floating-window-local-storage";

function createMemoryAccess(): FloatingWindowLocalStorageAccess & {
	store: Map<string, unknown>;
} {
	const store = new Map<string, unknown>();
	return {
		store,
		load: (key) => store.get(key) ?? null,
		save: (key, data) => {
			if (data === null) store.delete(key);
			else store.set(key, data);
		},
	};
}

describe("floating-window-local-storage", () => {
	let access: ReturnType<typeof createMemoryAccess>;

	beforeEach(() => {
		access = createMemoryAccess();
	});

	it("round-trips layout through local storage", () => {
		const layout = {
			lastSize: { width: 420, height: 510 },
			lastPosition: { x: 120, y: 80 },
		};
		writeFloatingWindowLocalLayout(access, layout);
		expect(readFloatingWindowLocalLayout(access)).toEqual(layout);
		expect(access.store.get(FLOATING_WINDOW_LOCAL_LAYOUT_KEY)).toEqual(
			layout,
		);
	});

	it("clamps undersized stored layout on read", () => {
		writeFloatingWindowLocalLayout(access, {
			lastSize: { width: 50, height: 50 },
			lastPosition: { x: 10, y: 20 },
		});
		expect(readFloatingWindowLocalLayout(access)).toEqual({
			lastSize: { width: 300, height: 200 },
			lastPosition: { x: 10, y: 20 },
		});
	});

	it("returns null for invalid stored payload", () => {
		access.save(FLOATING_WINDOW_LOCAL_LAYOUT_KEY, { lastSize: { width: 1 } });
		expect(readFloatingWindowLocalLayout(access)).toBeNull();
	});

	it("clear removes the entry", () => {
		writeFloatingWindowLocalLayout(access, {
			lastSize: { width: 400, height: 500 },
			lastPosition: { x: 1, y: 2 },
		});
		clearFloatingWindowLocalLayout(access);
		expect(readFloatingWindowLocalLayout(access)).toBeNull();
		expect(access.store.has(FLOATING_WINDOW_LOCAL_LAYOUT_KEY)).toBe(false);
	});

	it("floatingWindowLocalLayoutsEqual compares size and position", () => {
		const a = {
			lastSize: { width: 400, height: 500 },
			lastPosition: { x: 1, y: 2 },
		};
		const b = {
			lastSize: { width: 400, height: 500 },
			lastPosition: { x: 1, y: 2 },
		};
		const c = {
			lastSize: { width: 401, height: 500 },
			lastPosition: { x: 1, y: 2 },
		};
		expect(floatingWindowLocalLayoutsEqual(a, b)).toBe(true);
		expect(floatingWindowLocalLayoutsEqual(a, c)).toBe(false);
		expect(floatingWindowLocalLayoutsEqual(a, null)).toBe(false);
		expect(floatingWindowLocalLayoutsEqual(null, null)).toBe(true);
	});

	it("extractSyncedFloatingWindowLastLayout reads new and legacy keys", () => {
		expect(
			extractSyncedFloatingWindowLastLayout({
				floatingWindowLastSize: { width: 600, height: 700 },
				floatingWindowLastPosition: { x: 90, y: 91 },
			}),
		).toEqual({
			lastSize: { width: 600, height: 700 },
			lastPosition: { x: 90, y: 91 },
		});

		expect(
			extractSyncedFloatingWindowLastLayout({
				floatingWindowSize: { width: 520, height: 640 },
				floatingWindowPosition: { x: 40, y: 60 },
			}),
		).toEqual({
			lastSize: { width: 520, height: 640 },
			lastPosition: { x: 40, y: 60 },
		});
	});

	it("extractSyncedFloatingWindowLastLayout requires both size and position", () => {
		expect(
			extractSyncedFloatingWindowLastLayout({
				floatingWindowLastSize: { width: 600, height: 700 },
			}),
		).toBeNull();
		expect(hasSyncedFloatingWindowLastLayout({})).toBe(false);
	});

	it("floatingWindowLocalLayoutFromSynced clamps size", () => {
		expect(
			floatingWindowLocalLayoutFromSynced(
				{ width: 10, height: 10 },
				{ x: 1, y: 2 },
			),
		).toEqual({
			lastSize: { width: 300, height: 200 },
			lastPosition: { x: 1, y: 2 },
		});
	});

	it("parseFloatingWindowLocalLayout rejects invalid input", () => {
		expect(parseFloatingWindowLocalLayout(undefined)).toBeNull();
		expect(parseFloatingWindowLocalLayout({ lastSize: "nope" })).toBeNull();
	});
});
