/**
 * Dock a floating chat into a workspace leaf, or float a docked chat.
 * Drag-and-drop uses the same move as the header actions.
 */

import { getLogger } from "../utils/logger";
import type { ChatViewType } from "./view-registry";
import {
	type ChatPlacementSnapshot,
	type PlacementDockTarget,
	type PlacementHitTarget,
	type PlacementOpenTarget,
	disarmNextSidebarAdoption,
	endPlacementDrag,
	getActivePlacementDrag,
	placementHighlightSelector,
	releasePlacementHandoff,
	resolvePlacementDrop,
	stashPlacementHandoff,
} from "./chat-placement";

export interface PlacementView {
	readonly viewId: string;
	readonly viewType: ChatViewType;
	preparePlacementMove?: () => ChatPlacementSnapshot | null;
	closeContainer(): void;
}

export interface ChatPlacementPorts {
	getView(viewId: string): PlacementView | null;
	isFloatingEnabled(): boolean;
	notice(message: string): void;
	openSidebar(
		snapshot: ChatPlacementSnapshot,
		target: PlacementOpenTarget,
	): Promise<void>;
	openFloating(snapshot: ChatPlacementSnapshot): void;
}

const DROP_HIGHLIGHT_CLASS = "agent-client-placement-drop-target";
const FLOATING_DRAG_CLASS = "agent-client-placement-dragging-floating";

export class ChatPlacementHost {
	private highlight: Element | null = null;
	private installedDoc: Document | null = null;
	private readonly onDragOver = (event: Event) => {
		this.handleDragOver(event as DragEvent);
	};
	private readonly onDrop = (event: Event) => {
		this.handleDrop(event as DragEvent);
	};
	private readonly onDragEnd = () => {
		this.clearDragChrome();
		endPlacementDrag();
	};

	constructor(private readonly ports: ChatPlacementPorts) {}

	installDragListeners(doc: Document): void {
		if (this.installedDoc === doc) return;
		this.uninstallDragListeners();
		this.installedDoc = doc;
		doc.addEventListener("dragover", this.onDragOver, true);
		doc.addEventListener("drop", this.onDrop, true);
		doc.addEventListener("dragend", this.onDragEnd, true);
	}

	uninstallDragListeners(): void {
		const doc = this.installedDoc;
		this.clearDragChrome();
		this.installedDoc = null;
		endPlacementDrag();
		if (!doc) return;
		doc.removeEventListener("dragover", this.onDragOver, true);
		doc.removeEventListener("drop", this.onDrop, true);
		doc.removeEventListener("dragend", this.onDragEnd, true);
	}

	async dock(
		viewId: string,
		target: PlacementOpenTarget = "default",
	): Promise<boolean> {
		return this.move(viewId, "dock", target);
	}

	async float(viewId: string): Promise<boolean> {
		return this.move(viewId, "float", "default");
	}

	private async move(
		viewId: string,
		kind: "dock" | "float",
		target: PlacementOpenTarget,
	): Promise<boolean> {
		const view = this.ports.getView(viewId);
		if (!view) return false;
		if (kind === "dock" && view.viewType !== "floating") return false;
		if (kind === "float") {
			if (view.viewType !== "sidebar") return false;
			if (!this.ports.isFloatingEnabled()) {
				this.ports.notice(
					"[Agent Client] Floating chat is disabled in settings.",
				);
				return false;
			}
		}

		const snapshot = view.preparePlacementMove?.() ?? null;
		if (!snapshot) {
			this.ports.notice("[Agent Client] This chat can't be moved yet.");
			return false;
		}
		if (snapshot.blockedReason) {
			this.ports.notice(snapshot.blockedReason);
			return false;
		}

		stashPlacementHandoff(snapshot);
		try {
			// Open the destination first. If that fails, the source chat is
			// still on screen. Closing first would drop the only view of a
			// live session.
			if (kind === "dock") {
				await this.ports.openSidebar(snapshot, target);
			} else {
				this.ports.openFloating(snapshot);
			}
			view.closeContainer();
			return true;
		} catch (error) {
			releasePlacementHandoff(snapshot.sourceViewId);
			disarmNextSidebarAdoption();
			getLogger().error("[ChatPlacement] Move failed:", error);
			this.ports.notice("[Agent Client] Couldn't move this chat.");
			return false;
		}
	}

	private handleDragOver(event: DragEvent): void {
		const drag = getActivePlacementDrag();
		const target = eventTargetElement(event);
		if (!drag || !target) {
			this.clearDragChrome();
			return;
		}
		// The floating window follows the cursor, so let the drop land on the
		// sidebar or editor underneath it.
		this.installedDoc?.body.classList.toggle(
			FLOATING_DRAG_CLASS,
			drag.origin === "floating",
		);
		const decision = resolvePlacementDrop(drag, target);
		if (!decision) {
			this.clearHighlight();
			return;
		}
		event.preventDefault();
		if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
		this.setHighlight(highlightElement(drag, target));
	}

	private handleDrop(event: DragEvent): void {
		const drag = getActivePlacementDrag();
		const target = eventTargetElement(event);
		const decision =
			drag && target ? resolvePlacementDrop(drag, target) : null;
		endPlacementDrag();
		this.clearDragChrome();
		if (!decision) return;
		event.preventDefault();
		event.stopPropagation();
		if (decision.kind === "dock") {
			void this.dock(decision.viewId, decision.dock);
		} else {
			void this.float(decision.viewId);
		}
	}

	private setHighlight(el: Element | null): void {
		if (this.highlight === el) return;
		this.clearHighlight();
		if (!el) return;
		el.classList.add(DROP_HIGHLIGHT_CLASS);
		this.highlight = el;
	}

	private clearHighlight(): void {
		this.highlight?.classList.remove(DROP_HIGHLIGHT_CLASS);
		this.highlight = null;
	}

	private clearDragChrome(): void {
		this.clearHighlight();
		this.installedDoc?.body.classList.remove(FLOATING_DRAG_CLASS);
	}
}

function eventTargetElement(event: DragEvent): PlacementHitTarget | null {
	const target = event.target;
	if (!target || typeof target !== "object") return null;
	if (!("closest" in target) || typeof target.closest !== "function") {
		return null;
	}
	return target as PlacementHitTarget;
}

function highlightElement(
	drag: NonNullable<ReturnType<typeof getActivePlacementDrag>>,
	target: PlacementHitTarget,
): Element | null {
	const match = target.closest(placementHighlightSelector(drag));
	return match instanceof Element ? match : null;
}
