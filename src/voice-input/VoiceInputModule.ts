import { Notice, Plugin, setIcon } from "obsidian";
import { LiveTranscriber } from "./LiveTranscriber";
import {
	VOICE_INPUT_SECRET_ID,
	type VoiceInputSettings,
} from "./VoiceInputSettings";
import type { TranscriptSink } from "./types";

/**
 * VoiceInputModule
 *
 * Self-contained module for Gemini Live voice input. Depends on Obsidian
 * (Plugin, Notice, status bar, commands) but NOT on Agent Client internals
 * (ACP, ChatPanel, InputArea, etc.).
 *
 * Exposes:
 * - Commands: toggle voice input
 * - Status bar: mic icon showing recording state
 * - startListening/stopListening for the input area to call
 *
 * Rip-and-replace: swap LiveTranscriber for a different provider that
 * implements the same start(sink)/stop()/isActive contract.
 */
export class VoiceInputModule {
	private transcriber: LiveTranscriber | null = null;
	private settings: VoiceInputSettings;
	private statusBarItem: HTMLElement | null = null;
	private inProgress = false;
	private createTranscriber: (apiKey: string, model: string) => LiveTranscriber;

	constructor(
		private plugin: Plugin,
		settings: VoiceInputSettings,
		createTranscriber?: (apiKey: string, model: string) => LiveTranscriber,
	) {
		this.settings = settings;
		this.createTranscriber =
			createTranscriber ??
			((apiKey, model) => new LiveTranscriber(apiKey, model));
	}

	/** Update settings at runtime (called from plugin load/settings change). */
	updateSettings(settings: VoiceInputSettings): void {
		this.settings = settings;
	}

	// ── Public API for the input area ──────────────────────────────

	async startListening(sink: TranscriptSink): Promise<void> {
		if (this.transcriber?.isActive || this.inProgress) return;

		const apiKey = this.resolveApiKey();
		if (!apiKey) {
			new Notice("[Agent Client] Add your Gemini API key in Settings → Voice Input");
			sink.onError("Add your Gemini API key in Voice Input settings");
			return;
		}

		this.inProgress = true;
		try {
			this.transcriber = new LiveTranscriber(apiKey, this.settings.model);
			await this.transcriber.start(sink);
			this.updateStatusBarIcon(true);
		} catch {
			// transcriber.start() handles errors internally via sink.onError
		} finally {
			this.inProgress = false;
		}
	}

	async stopListening(): Promise<void> {
		if (!this.transcriber?.isActive) return;
		await this.transcriber.stop();
		this.updateStatusBarIcon(false);
	}

	get isListening(): boolean {
		return this.transcriber?.isActive ?? false;
	}

	// ── Plugin lifecycle ───────────────────────────────────────────

	/** Register the command palette entry. */
	registerCommands(): void {
		this.plugin.addCommand({
			id: "voice-input-toggle",
			name: "Toggle voice input",
			callback: () => {
				// The mic button in InputArea handles toggling.
				// This command just fires a workspace event the active
				// ChatPanel listens to.
				this.plugin.app.workspace.trigger(
					"agent-client:voice-input-toggle",
				);
			},
		});
	}

	/** Mount the status bar mic icon. */
	mountStatusBar(): void {
		if (this.statusBarItem) return;
		this.statusBarItem = this.plugin.addStatusBarItem();
		this.statusBarItem.addClass("agent-client-voice-input-status");
		this.updateStatusBarIcon(false);
		this.statusBarItem.addEventListener("click", () => {
			this.plugin.app.workspace.trigger(
				"agent-client:voice-input-toggle",
			);
		});
	}

	/** Remove the status bar icon. */
	unmountStatusBar(): void {
		this.statusBarItem?.remove();
		this.statusBarItem = null;
	}

	/** Dispose of any active session and clean up. */
	dispose(): void {
		if (this.transcriber) {
			this.transcriber.dispose();
			this.transcriber = null;
		}
		this.unmountStatusBar();
	}

	// ── Internals ──────────────────────────────────────────────────

	private resolveApiKey(): string {
		const secretId =
			this.settings.geminiApiKeySecretId || VOICE_INPUT_SECRET_ID;
		if (!secretId) return "";
		return this.plugin.app.secretStorage.getSecret(secretId) ?? "";
	}

	private updateStatusBarIcon(recording: boolean): void {
		if (!this.statusBarItem) return;
		this.statusBarItem.empty();
		if (recording) {
			setIcon(this.statusBarItem, "mic");
			this.statusBarItem.addClass("is-recording");
			this.statusBarItem.style.color = "red";
		} else {
			setIcon(this.statusBarItem, "mic");
			this.statusBarItem.removeClass("is-recording");
			this.statusBarItem.style.color = "";
		}
	}
}