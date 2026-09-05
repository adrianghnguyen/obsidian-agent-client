import { useLayoutEffect, type RefObject } from "react";
import type AgentClientPlugin from "../plugin";
import { useSettings } from "./useSettings";

const TEXTAREA_SELECTOR = "textarea.agent-client-chat-input-textarea";
const IDLE_OPACITY_VAR = "--agent-client-floating-idle-opacity";
const IDLE_CLASS = "is-idle-transparent";
const VIEW_ROOT_SELECTOR = ".agent-client-floating-view-root";

function resolveIdleTarget(windowEl: HTMLDivElement): HTMLElement {
	return windowEl.closest<HTMLElement>(VIEW_ROOT_SELECTOR) ?? windowEl;
}

function isChatTextarea(
	target: EventTarget | null,
): target is HTMLTextAreaElement {
	return (
		target instanceof HTMLTextAreaElement &&
		target.matches(TEXTAREA_SELECTOR)
	);
}

function inputHasFocus(windowEl: HTMLDivElement): boolean {
	const active = document.activeElement;
	return isChatTextarea(active) && windowEl.contains(active);
}

/**
 * Fade floating chat when the input is not focused: after the cursor leaves
 * the text box, wait X ms then fade. Focusing the text box restores opacity.
 */
export function useFloatingIdleOpacity(
	plugin: AgentClientPlugin,
	containerRef: RefObject<HTMLDivElement | null>,
	isExpanded: boolean,
): void {
	const { floatingIdleTimeoutMs: timeoutMs, floatingIdleOpacityPercent: opacityPercent } =
		useSettings(plugin);
	const featureEnabled = timeoutMs > 0;

	useLayoutEffect(() => {
		const windowEl = containerRef.current;
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

		const clearTimer = () => {
			if (timer !== null) {
				clearTimeout(timer);
				timer = null;
			}
		};

		const showOpaque = () => {
			clearTimer();
			target.classList.remove(IDLE_CLASS);
		};

		const scheduleFade = () => {
			clearTimer();
			timer = setTimeout(() => {
				if (!inputHasFocus(windowEl)) {
					target.classList.add(IDLE_CLASS);
				}
			}, timeoutMs);
		};

		const onFocusIn = (e: FocusEvent) => {
			if (isChatTextarea(e.target)) {
				showOpaque();
			}
		};

		const onFocusOut = (e: FocusEvent) => {
			if (isChatTextarea(e.target)) {
				scheduleFade();
			}
		};

		windowEl.addEventListener("focusin", onFocusIn);
		windowEl.addEventListener("focusout", onFocusOut);

		if (!inputHasFocus(windowEl)) {
			scheduleFade();
		}

		return () => {
			clearTimer();
			windowEl.removeEventListener("focusin", onFocusIn);
			windowEl.removeEventListener("focusout", onFocusOut);
			target.classList.remove(IDLE_CLASS);
		};
	}, [
		featureEnabled,
		isExpanded,
		timeoutMs,
		opacityPercent,
		containerRef,
	]);
}
