import { describe, it, expect } from "vitest";
import {
	resolveFloatingWindowLayout,
	migrateFloatingWindowLayoutFields,
	needsFloatingWindowLayoutMigration,
	clampFloatingWindowSize,
	parseFloatingWindowSize,
	parseOptionalFloatingWindowSize,
	FLOATING_WINDOW_SIZE_MIN,
	FLOATING_WINDOW_SIZE_MAX,
	type FloatingWindowDefaultLayoutSettings,
} from "../src/services/settings-normalizer";

const VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_SIZE = { width: 340, height: 400 };
const LAST_LAYOUT = {
	lastSize: { width: 600, height: 700 },
	lastPosition: { x: 100, y: 80 },
};

function baseSettings(
	overrides: Partial<FloatingWindowDefaultLayoutSettings> = {},
): FloatingWindowDefaultLayoutSettings {
	return {
		floatingWindowDefaultSize: DEFAULT_SIZE,
		floatingWindowDefaultPosition: null,
		...overrides,
	};
}

describe("resolveFloatingWindowLayout", () => {
	it("uses default size and auto bottom-right when no last layout", () => {
		const { size, position } = resolveFloatingWindowLayout(
			baseSettings(),
			VIEWPORT,
		);
		expect(size).toEqual(DEFAULT_SIZE);
		expect(position).toEqual({
			x: VIEWPORT.width - DEFAULT_SIZE.width - 50,
			y: VIEWPORT.height - DEFAULT_SIZE.height - 50,
		});
	});

	it("prefers device last size/position over defaults", () => {
		const { size, position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultSize: { width: 400, height: 500 },
				floatingWindowDefaultPosition: { x: 10, y: 20 },
			}),
			VIEWPORT,
			null,
			LAST_LAYOUT,
		);
		expect(size).toEqual(LAST_LAYOUT.lastSize);
		expect(position).toEqual(LAST_LAYOUT.lastPosition);
	});

	it("uses default position when no device last layout is saved", () => {
		const { position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultPosition: { x: 12, y: 34 },
			}),
			VIEWPORT,
		);
		expect(position).toEqual({ x: 12, y: 34 });
	});

	it("prefers initialPosition over last and default", () => {
		const { position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultPosition: { x: 1, y: 2 },
			}),
			VIEWPORT,
			{ x: 200, y: 150 },
			{
				lastSize: { width: 400, height: 500 },
				lastPosition: { x: 3, y: 4 },
			},
		);
		expect(position).toEqual({ x: 200, y: 150 });
	});

	it("clamps size to the viewport", () => {
		const { size } = resolveFloatingWindowLayout(
			baseSettings(),
			{ width: 800, height: 600 },
			null,
			{
				lastSize: { width: 5000, height: 4000 },
				lastPosition: { x: 0, y: 0 },
			},
		);
		expect(size).toEqual({ width: 800, height: 600 });
	});

	it("clamps undersized configured defaults to settings bounds", () => {
		const { size } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultSize: { width: 100, height: 100 },
			}),
			VIEWPORT,
		);
		expect(size).toEqual(FLOATING_WINDOW_SIZE_MIN);
	});

	it("clamps position into the viewport", () => {
		const { position } = resolveFloatingWindowLayout(
			baseSettings(),
			VIEWPORT,
			null,
			{
				lastSize: { width: 400, height: 500 },
				lastPosition: { x: 9000, y: -50 },
			},
		);
		expect(position.x).toBe(VIEWPORT.width - 400);
		expect(position.y).toBe(0);
	});
});

describe("migrateFloatingWindowLayoutFields", () => {
	it("migrates legacy size into default fields only", () => {
		const result = migrateFloatingWindowLayoutFields(
			{
				floatingWindowSize: { width: 520, height: 640 },
				floatingWindowPosition: { x: 40, y: 60 },
			},
			DEFAULT_SIZE,
		);
		expect(result).toEqual({
			floatingWindowDefaultSize: {
				width: 520,
				height: 640,
			},
			floatingWindowDefaultPosition: null,
		});
	});

	it("uses fallback defaults when no legacy or new keys", () => {
		const result = migrateFloatingWindowLayoutFields({}, DEFAULT_SIZE);
		expect(result).toEqual({
			floatingWindowDefaultSize: DEFAULT_SIZE,
			floatingWindowDefaultPosition: null,
		});
	});

	it("prefers new schema default keys when present", () => {
		const result = migrateFloatingWindowLayoutFields(
			{
				floatingWindowDefaultSize: { width: 450, height: 550 },
				floatingWindowDefaultPosition: { x: 5, y: 6 },
				floatingWindowLastSize: { width: 700, height: 800 },
				floatingWindowLastPosition: { x: 90, y: 91 },
				floatingWindowSize: { width: 1, height: 2 },
				floatingWindowPosition: { x: 3, y: 4 },
			},
			DEFAULT_SIZE,
		);
		expect(result).toEqual({
			floatingWindowDefaultSize: {
				width: 450,
				height: 550,
			},
			floatingWindowDefaultPosition: { x: 5, y: 6 },
		});
	});
});

describe("needsFloatingWindowLayoutMigration", () => {
	it("is true when legacy keys remain", () => {
		expect(
			needsFloatingWindowLayoutMigration({
				floatingWindowSize: { width: 400, height: 500 },
			}),
		).toBe(true);
		expect(
			needsFloatingWindowLayoutMigration({
				floatingWindowPosition: { x: 1, y: 2 },
			}),
		).toBe(true);
	});

	it("is true when synced last-layout keys remain", () => {
		expect(
			needsFloatingWindowLayoutMigration({
				floatingWindowLastSize: { width: 400, height: 500 },
			}),
		).toBe(true);
	});

	it("is false for a clean new schema", () => {
		expect(
			needsFloatingWindowLayoutMigration({
				floatingWindowDefaultSize: { width: 400, height: 500 },
			}),
		).toBe(false);
		expect(needsFloatingWindowLayoutMigration({})).toBe(false);
	});
});

describe("size parsers and clamp", () => {
	it("parseFloatingWindowSize falls back on invalid input", () => {
		expect(parseFloatingWindowSize(undefined, DEFAULT_SIZE)).toEqual(
			DEFAULT_SIZE,
		);
		expect(parseFloatingWindowSize({ width: "x" }, DEFAULT_SIZE)).toEqual(
			DEFAULT_SIZE,
		);
	});

	it("parseOptionalFloatingWindowSize returns null when missing", () => {
		expect(parseOptionalFloatingWindowSize(undefined)).toBeNull();
		expect(
			parseOptionalFloatingWindowSize({ width: 10, height: 20 }),
		).toEqual({ width: 10, height: 20 });
	});

	it("clampFloatingWindowSize enforces min/max", () => {
		expect(clampFloatingWindowSize({ width: 10, height: 10 })).toEqual(
			FLOATING_WINDOW_SIZE_MIN,
		);
		expect(
			clampFloatingWindowSize({ width: 9999, height: 9999 }),
		).toEqual(FLOATING_WINDOW_SIZE_MAX);
	});
});
