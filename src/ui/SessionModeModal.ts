/**
 * Command-palette picker for advertised ACP session modes.
 * Lists whatever the connected agent exposed — never hardcodes Agent/Plan/Ask.
 */

import { App, FuzzySuggestModal } from "obsidian";
import type { AdvertisedSessionMode } from "../services/session-modes";

export class SessionModeSuggestModal extends FuzzySuggestModal<AdvertisedSessionMode> {
	constructor(
		app: App,
		private modes: AdvertisedSessionMode[],
		private currentId: string | undefined,
		private onChoose: (mode: AdvertisedSessionMode) => void,
	) {
		super(app);
		this.setPlaceholder("Switch session mode");
	}

	getItems(): AdvertisedSessionMode[] {
		return this.modes;
	}

	getItemText(item: AdvertisedSessionMode): string {
		const current = item.id === this.currentId ? " (current)" : "";
		return item.description
			? `${item.name}${current} — ${item.description}`
			: `${item.name}${current}`;
	}

	onChooseItem(item: AdvertisedSessionMode): void {
		this.onChoose(item);
	}
}
