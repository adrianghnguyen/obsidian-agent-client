/**
 * Floating chat idle transparency.
 *
 * Engaged (stay opaque, clear timer) while any of:
 * - Pointer is inside the floating window (pointerenter / pointerleave on windowEl)
 * - Focus is inside the floating window (windowEl.contains(document.activeElement)
 *   on focusin / focusout)
 * - An active pointer gesture started on the window (pointerdown → latch until
 *   pointerup / pointercancel on document) — covers drag, resize, text selection
 *   that briefly leaves the bounds
 * - Scroll/wheel activity inside the window (wheel + scroll capture) —
 *   belt-and-suspenders with hover; also refreshes opacity if already faded while
 *   scrolling under the cursor
 *
 * Schedule fade only when none of the above remain true.
 */
import { useLayoutEffect } from "react";
import type AgentClientPlugin from "../plugin";
import { useSettings } from "./useSettings";

const IDLE_OPACITY_VAR = "--agent-client-floating-idle-opacity";
const IDLE_CLASS = "is-idle-transparent";
const VIEW_ROOT_SELECTOR = ".agent-client-floating-view-root";

function resolveIdleTarget(windowEl: HTMLDivElement): HTMLElement {
	return windowEl.closest<HTMLElement>(VIEW_ROOT_SELECTOR) ?? windowEl;
}

function windowHasFocus(windowEl: HTMLDivElement): boolean {
	const active = document.activeElement;
	return active instanceof Node && windowEl.contains(active);
}

/**
 * Fade floating chat when the user is no longer engaged with the window:
 * after pointer leaves, focus leaves, and any pointer gesture ends, wait X ms
 * then fade. Hover, scroll, focus inside, or interacting restores full opacity.
 *
 * `windowEl` must be the mounted floating window node (not only a ref) so the
 * effect rebinds when React attaches the DOM node.
 */
export function useFloatingIdleOpacity(
	plugin: AgentClientPlugin,
	windowEl: HTMLDivElement | null,
	isExpanded: boolean,
): void {
	const { floatingIdleTimeoutMs: timeoutMs, floatingIdleOpacityPercent: opacityPercent } =
		useSettings(plugin);
	const featureEnabled = timeoutMs > 0;

	useLayoutEffect(() => {
		if (!windowEl) return;

		const target = resolveIdleTarget(windowEl);

		if (featureEnabled) {
			const opacity = opacityPercent / 100;
			target.style.setProperty(IDLE_OPACITY_VAR, String(opacity));
		} else {
			target.style.removeProperty(IDLE_OPACITY_VAR);
			target.classList.remove(IDLE_CLASS);
			return;
		}

		if (!isExpanded) {
			target.classList.remove(IDLE_CLASS);
			return;
		}

		let timer: ReturnType<typeof setTimeout> | null = null;
		let pointerInside = false;
		let gestureActive = false;

		const clearTimer = () => {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		};

		const isEngaged = () =>
			pointerInside || gestureActive || windowHasFocus(windowEl);

		const showOpaque = () => {
			clearTimer();
			target.classList.remove(IDLE_CLASS);
		};

		const scheduleFade = () => {
			clearTimer();
			timer = setTimeout(() => {
				if (!isEngaged()) {
					target.classList.add(IDLE_CLASS);
				}
			}, timeoutMs);
		};

		const syncIdle = () => {
			if (isEngaged()) {
				showOpaque();
			} else {
				scheduleFade();
			}
		};

		const onPointerEnter = () => {
			pointerInside = true;
			showOpaque();
		};

		const onPointerLeave = () => {
			pointerInside = false;
			syncIdle();
		};

		const onFocusIn = () => {
			showOpaque();
		};

		const onFocusOut = () => {
			// focusout fires before activeElement updates; defer to next tick
			queueMicrotask(syncIdle);
		};

		const onPointerUp = () => {
			gestureActive = false;
			document.removeEventListener("pointerup", onPointerUp, true);
			document.removeEventListener("pointercancel", onPointerUp, true);
			syncIdle();
		};

		const onPointerDown = () => {
			gestureActive = true;
			showOpaque();
			document.addEventListener("pointerup", onPointerUp, true);
			document.addEventListener("pointercancel", onPointerUp, true);
		};

		// Wheel implies the cursor is over the window (covers missed pointerenter).
		const onWheel = () => {
			pointerInside = true;
			showOpaque();
		};

		// User scroll while already engaged; ignore programmatic scroll when idle.
		const onScroll = () => {
			if (isEngaged()) {
				showOpaque();
			}
		};

		windowEl.addEventListener("pointerenter", onPointerEnter);
		windowEl.addEventListener("pointerleave", onPointerLeave);
		windowEl.addEventListener("focusin", onFocusIn);
		windowEl.addEventListener("focusout", onFocusOut);
		windowEl.addEventListener("pointerdown", onPointerDown);
		windowEl.addEventListener("wheel", onWheel, { capture: true });
		windowEl.addEventListener("scroll", onScroll, { capture: true });

		if (!isEngaged()) {
			scheduleFade();
		}

		return () => {
			clearTimer();
			document.removeEventListener("pointerup", onPointerUp, true);
			document.removeEventListener("pointercancel", onPointerUp, true);
			windowEl.removeEventListener("pointerenter", onPointerEnter);
			windowEl.removeEventListener("pointerleave", onPointerLeave);
			windowEl.removeEventListener("focusin", onFocusIn);
			windowEl.removeEventListener("focusout", onFocusOut);
			windowEl.removeEventListener("pointerdown", onPointerDown);
			windowEl.removeEventListener("wheel", onWheel, true);
			windowEl.removeEventListener("scroll", onScroll, true);
			target.classList.remove(IDLE_CLASS);
		};
	}, [
		featureEnabled,
		isExpanded,
		timeoutMs,
		opacityPercent,
		windowEl,
	]);
}
