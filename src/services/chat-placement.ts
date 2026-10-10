/**
 * Move one chat between a floating window and a docked workspace leaf.
 *
 * The snapshot is stashed before the source view unmounts and claimed by the
 * destination. When the ACP process is already up, the destination reuses the
 * source view id so the same client (and live turn) stays attached.
 */

import type { ChatInputState, ChatMessage } from "../types/chat";
import type { ChatSession } from "../types/session";
import type { QueuedComposerSend } from "./composer-send-queue";

export type PlacementDockTarget = "left" | "right" | "editor";

export type PlacementOpenTarget = PlacementDockTarget | "default";

export type PlacementDragOrigin = "sidebar" | "floating";

export interface ChatPlacementSnapshot {
	sourceViewId: string;
	/** Keep the live ACP client by reusing sourceViewId on the destination. */
	reuseClient: boolean;
	agentId: string;
	cwd: string;
	session: ChatSession;
	messages: ChatMessage[];
	isSending: boolean;
	input: ChatInputState | null;
	queuedSends: QueuedComposerSend[];
	/** When set, the move must not start (chat is still connecting). */
	blockedReason: string | null;
}

export interface PlacementDragPayload {
	viewId: string;
	origin: PlacementDragOrigin;
}

export type PlacementDrop =
	| { kind: "dock"; viewId: string; dock: PlacementDockTarget }
	| { kind: "float"; viewId: string };

export const PLACEMENT_DRAG_MIME = "application/x-agent-client-chat";

const handoffs = new Map<string, ChatPlacementSnapshot>();

let nextSidebarViewId: string | null = null;
let activeDrag: PlacementDragPayload | null = null;
let suppressNextClick = false;

export function stashPlacementHandoff(snapshot: ChatPlacementSnapshot): void {
	handoffs.set(snapshot.sourceViewId, snapshot);
}

export function peekPlacementHandoff(
	viewId: string,
): ChatPlacementSnapshot | null {
	return handoffs.get(viewId) ?? null;
}

export function takePlacementHandoff(
	viewId: string,
): ChatPlacementSnapshot | null {
	const snapshot = handoffs.get(viewId) ?? null;
	if (snapshot) handoffs.delete(viewId);
	return snapshot;
}

export function releasePlacementHandoff(viewId: string): void {
	handoffs.delete(viewId);
}

/** Live ACP client should stay connected across this move. */
export function placementKeepsClient(snapshot: ChatPlacementSnapshot): boolean {
	return snapshot.blockedReason === null && snapshot.reuseClient;
}

/** Live handoff whose destination view id is the source id. */
export function peekLivePlacement(
	viewId: string,
): ChatPlacementSnapshot | null {
	const snapshot = peekPlacementHandoff(viewId);
	if (!snapshot?.reuseClient || snapshot.sourceViewId !== viewId) return null;
	return snapshot;
}

/**
 * The next ChatView constructed should adopt this view id (live client).
 * Consumed once so a later, unrelated leaf keeps its own id.
 */
export function armNextSidebarAdoption(viewId: string): void {
	nextSidebarViewId = viewId;
}

export function claimNextSidebarAdoption(): string | null {
	const viewId = nextSidebarViewId;
	nextSidebarViewId = null;
	return viewId;
}

export function disarmNextSidebarAdoption(): void {
	nextSidebarViewId = null;
}

export interface PlacementHitTarget {
	closest(selector: string): unknown;
}

export function dockTargetFromElement(
	target: PlacementHitTarget | null,
): PlacementDockTarget | null {
	if (!target) return null;
	if (
		target.closest(
			".agent-client-floating-window, .agent-client-floating-view-root",
		)
	) {
		return null;
	}
	if (target.closest(".mod-left-split")) return "left";
	if (target.closest(".mod-right-split")) return "right";
	if (target.closest(".mod-root")) return "editor";
	return null;
}

export function resolvePlacementDrop(
	drag: PlacementDragPayload | null,
	target: PlacementHitTarget | null,
): PlacementDrop | null {
	if (!drag || !target) return null;
	if (drag.origin === "floating") {
		const dock = dockTargetFromElement(target);
		if (!dock) return null;
		return { kind: "dock", viewId: drag.viewId, dock };
	}
	if (target.closest(".agent-client-floating-window")) {
		return { kind: "float", viewId: drag.viewId };
	}
	return null;
}

export function placementHighlightSelector(drag: PlacementDragPayload): string {
	return drag.origin === "floating"
		? ".mod-left-split, .mod-right-split, .mod-root"
		: ".agent-client-floating-window";
}

export function beginPlacementDrag(
	dataTransfer: DataTransfer | null,
	payload: PlacementDragPayload,
	options?: { suppressClick?: boolean },
): void {
	activeDrag = payload;
	if (options?.suppressClick) suppressNextClick = true;
	if (!dataTransfer) return;
	dataTransfer.effectAllowed = "move";
	try {
		dataTransfer.setData(PLACEMENT_DRAG_MIME, payload.viewId);
		dataTransfer.setData("text/plain", payload.viewId);
	} catch {
		// Some drag sources reject setData outside dragstart.
	}
}

export function getActivePlacementDrag(): PlacementDragPayload | null {
	return activeDrag;
}

export function endPlacementDrag(): void {
	activeDrag = null;
}

/** A drag-start arms this so the following click does not also move the chat. */
export function consumePlacementClickSuppression(): boolean {
	const suppress = suppressNextClick;
	suppressNextClick = false;
	return suppress;
}

/** Test-only reset. */
export function resetPlacementStateForTests(): void {
	handoffs.clear();
	nextSidebarViewId = null;
	activeDrag = null;
	suppressNextClick = false;
}
