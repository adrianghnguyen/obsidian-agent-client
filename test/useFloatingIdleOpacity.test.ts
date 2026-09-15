// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFloatingIdleOpacity } from "../src/hooks/useFloatingIdleOpacity";
import { DEFAULT_SETTINGS } from "../src/services/default-settings";
import type AgentClientPlugin from "../src/plugin";
import type { AgentClientPluginSettings } from "../src/types/settings";

const IDLE_CLASS = "is-idle-transparent";

function createPlugin(
	overrides: Partial<AgentClientPluginSettings> = {},
): AgentClientPlugin {
	let snapshot: AgentClientPluginSettings = {
		...DEFAULT_SETTINGS,
		...overrides,
	};
	const listeners = new Set<() => void>();

	return {
		settingsService: {
			getSnapshot: () => snapshot,
			subscribe: (listener: () => void) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			},
			updateSettings: async (
				updates: Partial<AgentClientPluginSettings>,
			) => {
				snapshot = { ...snapshot, ...updates };
				for (const listener of listeners) {
					listener();
				}
			},
		},
	} as unknown as AgentClientPlugin;
}

function mountWindow(): {
	root: HTMLDivElement;
	windowEl: HTMLDivElement;
} {
	const root = document.createElement("div");
	root.className = "agent-client-floating-view-root";
	const windowEl = document.createElement("div");
	root.appendChild(windowEl);
	document.body.appendChild(root);
	return { root, windowEl };
}

describe("useFloatingIdleOpacity", () => {
	afterEach(() => {
		document.body.replaceChildren();
	});

	it("does not fade when idle delay is 0", () => {
		const plugin = createPlugin({
			floatingIdleTimeoutMs: 0,
			floatingTransparencyMode: true,
		});
		const { windowEl, root } = mountWindow();

		renderHook(() =>
			useFloatingIdleOpacity(plugin, windowEl, true, null),
		);

		expect(root.classList.contains(IDLE_CLASS)).toBe(false);
	});

	it("fades after the idle delay when transparency mode is on", () => {
		vi.useFakeTimers();
		const plugin = createPlugin({
			floatingIdleTimeoutMs: 200,
			floatingTransparencyMode: true,
		});
		const { windowEl, root } = mountWindow();

		renderHook(() =>
			useFloatingIdleOpacity(plugin, windowEl, true, null),
		);

		expect(root.classList.contains(IDLE_CLASS)).toBe(false);
		act(() => {
			vi.advanceTimersByTime(200);
		});
		expect(root.classList.contains(IDLE_CLASS)).toBe(true);
		vi.useRealTimers();
	});

	it("never adds the idle class when transparency mode is locked off", () => {
		vi.useFakeTimers();
		const plugin = createPlugin({
			floatingIdleTimeoutMs: 200,
			floatingTransparencyMode: false,
		});
		const { windowEl, root } = mountWindow();

		renderHook(() =>
			useFloatingIdleOpacity(plugin, windowEl, true, null),
		);

		act(() => {
			vi.advanceTimersByTime(1000);
		});
		expect(root.classList.contains(IDLE_CLASS)).toBe(false);
		vi.useRealTimers();
	});

	it("snaps opaque immediately when the lock is applied while faded", async () => {
		vi.useFakeTimers();
		const plugin = createPlugin({
			floatingIdleTimeoutMs: 50,
			floatingTransparencyMode: true,
		});
		const { windowEl, root } = mountWindow();

		renderHook(() =>
			useFloatingIdleOpacity(plugin, windowEl, true, null),
		);

		act(() => {
			vi.advanceTimersByTime(50);
		});
		expect(root.classList.contains(IDLE_CLASS)).toBe(true);

		await act(async () => {
			await plugin.settingsService.updateSettings({
				floatingTransparencyMode: false,
			});
		});
		expect(root.classList.contains(IDLE_CLASS)).toBe(false);
		vi.useRealTimers();
	});
});
