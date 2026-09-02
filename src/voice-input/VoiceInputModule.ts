import { Notice, Plugin } from "obsidian";
import { LiveTranscriber } from "./LiveTranscriber";
import type { LiveSetupOptions } from "./LiveProtocol";
import {
	VOICE_INPUT_SECRET_ID,
	type VoiceInputSettings,
} from "./VoiceInputSettings";
import type { TranscriptSink } from "./types";

/**
 * VoiceInputModule
 *
 * Self-contained module for Gemini Live voice input. Depends on Obsidian
 * (Plugin, Notice, commands) but NOT on Agent Client internals
 * (ACP, ChatPanel, InputArea, etc.).
 *
 * Exposes:
 * - Commands: toggle voice input
 * - startListening/stopListening for the input area to call
 *
 * Recording state is surfaced by the chat input toolbar mic button,
 * not by a status bar item.
 *
 * Rip-and-replace: swap LiveTranscriber for a different provider that
 * implements the same start(sink)/stop()/isActive contract.
 */
export class VoiceInputModule {
	private transcriber: LiveTranscriber | null = null;
	private settings: VoiceInputSettings;
	private inProgress = false;
	private createTranscriber: (
		apiKey: string,
		model: string,
		setupOptions: LiveSetupOptions,
	) => LiveTranscriber;

	constructor(
		private plugin: Plugin,
		settings: VoiceInputSettings,
		createTranscriber?: (
			apiKey: string,
			model: string,
			setupOptions: LiveSetupOptions,
		) => LiveTranscriber,
	) {
		this.settings = settings;
		this.createTranscriber =
			createTranscriber ??
			((apiKey, model, setupOptions) =>
				new LiveTranscriber(apiKey, model, { setupOptions }));
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
			this.transcriber = this.createTranscriber(
				apiKey,
				this.settings.model,
				this.buildSetupOptions(),
			);
			this.transcriber.setAudioDevice(this.settings.audioDeviceId);
			await this.transcriber.start(sink);
		} catch {
			// transcriber.start() handles errors internally via sink.onError
		} finally {
			this.inProgress = false;
		}
	}

	async stopListening(): Promise<void> {
		if (!this.transcriber?.isActive) return;
		await this.transcriber.stop();
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

	/** Dispose of any active session and clean up. */
	dispose(): void {
		if (this.transcriber) {
			this.transcriber.dispose();
			this.transcriber = null;
		}
	}

	// ── Internals ──────────────────────────────────────────────────

	private resolveApiKey(): string {
		const secretId =
			this.settings.geminiApiKeySecretId || VOICE_INPUT_SECRET_ID;
		if (!secretId) return "";
		return this.plugin.app.secretStorage.getSecret(secretId) ?? "";
	}

	private buildSetupOptions(): LiveSetupOptions {
		const languageCodes = this.settings.languageCodes
			.split(",")
			.map((code) => code.trim())
			.filter(Boolean);
		const customVocabulary = this.settings.customVocabulary
			.split(",")
			.map((term) => term.trim())
			.filter(Boolean);
		return {
			transcriptionMode: this.settings.transcriptionMode,
			languageCodes: languageCodes.length ? languageCodes : undefined,
			customVocabulary: customVocabulary.length
				? customVocabulary
				: undefined,
		};
	}
}
