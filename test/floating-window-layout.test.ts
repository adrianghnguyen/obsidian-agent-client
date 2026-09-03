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
	type FloatingWindowLayoutSettings,
} from "../src/services/settings-normalizer";

const VIEWPORT = { width: 1920, height: 1080 };
const DEFAULT_SIZE = { width: 400, height: 500 };

function baseSettings(
	overrides: Partial<FloatingWindowLayoutSettings> = {},
): FloatingWindowLayoutSettings {
	return {
		floatingWindowDefaultSize: DEFAULT_SIZE,
		floatingWindowDefaultPosition: null,
		floatingWindowLastSize: null,
		floatingWindowLastPosition: null,
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

	it("prefers last size/position over defaults", () => {
		const { size, position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultSize: { width: 400, height: 500 },
				floatingWindowDefaultPosition: { x: 10, y: 20 },
				floatingWindowLastSize: { width: 600, height: 700 },
				floatingWindowLastPosition: { x: 100, y: 80 },
			}),
			VIEWPORT,
		);
		expect(size).toEqual({ width: 600, height: 700 });
		expect(position).toEqual({ x: 100, y: 80 });
	});

	it("uses default position when last position is null", () => {
		const { position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultPosition: { x: 12, y: 34 },
				floatingWindowLastSize: { width: 500, height: 500 },
			}),
			VIEWPORT,
		);
		expect(position).toEqual({ x: 12, y: 34 });
	});

	it("prefers initialPosition over last and default", () => {
		const { position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowDefaultPosition: { x: 1, y: 2 },
				floatingWindowLastPosition: { x: 3, y: 4 },
			}),
			VIEWPORT,
			{ x: 200, y: 150 },
		);
		expect(position).toEqual({ x: 200, y: 150 });
	});

	it("clamps size to the viewport", () => {
		const { size } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowLastSize: { width: 5000, height: 4000 },
			}),
			{ width: 800, height: 600 },
		);
		expect(size).toEqual({ width: 800, height: 600 });
	});

	it("clamps position into the viewport", () => {
		const { position } = resolveFloatingWindowLayout(
			baseSettings({
				floatingWindowLastSize: { width: 400, height: 500 },
				floatingWindowLastPosition: { x: 9000, y: -50 },
			}),
			VIEWPORT,
		);
		expect(position.x).toBe(VIEWPORT.width - 400);
		expect(position.y).toBe(0);
	});
});

describe("migrateFloatingWindowLayoutFields", () => {
	it("migrates legacy size/position into default + last", () => {
		const result = migrateFloatingWindowLayoutFields(
			{
				floatingWindowSize: { width: 520, height: 640 },
				floatingWindowPosition: { x: 40, y: 60 },
			},
			DEFAULT_SIZE,
		);
		expect(result.floatingWindowDefaultSize).toEqual({
			width: 520,
			height: 640,
		});
		expect(result.floatingWindowDefaultPosition).toBeNull();
		expect(result.floatingWindowLastSize).toEqual({
			width: 520,
			height: 640,
		});
		expect(result.floatingWindowLastPosition).toEqual({ x: 40, y: 60 });
	});

	it("uses fallback defaults when no legacy or new keys", () => {
		const result = migrateFloatingWindowLayoutFields({}, DEFAULT_SIZE);
		expect(result).toEqual({
			floatingWindowDefaultSize: DEFAULT_SIZE,
			floatingWindowDefaultPosition: null,
			floatingWindowLastSize: null,
			floatingWindowLastPosition: null,
		});
	});

	it("prefers new schema keys when present", () => {
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
		expect(result.floatingWindowDefaultSize).toEqual({
			width: 450,
			height: 550,
		});
		expect(result.floatingWindowDefaultPosition).toEqual({ x: 5, y: 6 });
		expect(result.floatingWindowLastSize).toEqual({
			width: 700,
			height: 800,
		});
		expect(result.floatingWindowLastPosition).toEqual({ x: 90, y: 91 });
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

	it("is false for a clean new schema", () => {
		expect(
			needsFloatingWindowLayoutMigration({
				floatingWindowDefaultSize: { width: 400, height: 500 },
				floatingWindowLastSize: null,
			}),
		).toBe(false);
		expect(needsFloatingWindowLayoutMigration({})).toBe(false);
	});

	it("is true for incomplete new schema without defaultSize", () => {
		expect(
			needsFloatingWindowLayoutMigration({
				floatingWindowLastSize: { width: 400, height: 500 },
			}),
		).toBe(true);
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
