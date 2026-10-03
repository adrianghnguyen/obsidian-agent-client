import { Notice, Plugin } from "obsidian";
import { AudioCapture } from "./AudioCapture";
import { LiveTranscriber } from "./LiveTranscriber";
import type { LiveSetupOptions } from "./LiveProtocol";
import {
	VOICE_INPUT_SECRET_ID,
	parseVoiceTermList,
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
 * Recording state is surfaced by the inline voice controls in the chat
 * input row (mic / stop / timer / levels / send).
 *
 * Rip-and-replace: swap LiveTranscriber for a different provider that
 * implements the same start(sink)/stop()/isActive contract.
 */
export class VoiceInputModule {
	private transcriber: LiveTranscriber | null = null;
	private settings: VoiceInputSettings;
	private inProgress = false;
	/** Standalone AudioCapture used only by the Settings test level meter. */
	private monitor: AudioCapture | null = null;
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
				new LiveTranscriber(apiKey, model, {
					setupOptions,
					flushDelayMs: this.settings.flushDelayMs,
				}));
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

	/** Instantaneous mic amplitude in [0, 1] for the recording mic wave. */
	getAudioLevel(): number {
		return this.transcriber?.getLevel() ?? 0;
	}

	// ── Plugin lifecycle ───────────────────────────────────────────

	/** Register the command palette entry. */
	registerCommands(): void {
		this.plugin.addCommand({
			id: "voice-input-toggle",
			name: "Toggle voice input",
			callback: () => {
				// InputArea listens and starts/stops the inline voice controls.
				this.plugin.app.workspace.trigger(
					"agent-client:voice-input-toggle",
				);
			},
		});
	}

	// ── Settings microphone test ───────────────────────────────────

	/**
	 * Capture the chosen mic without the Gemini Live socket so Settings can
	 * show live amplitude. Refused while a real dictation is running.
	 */
	get isTestingMic(): boolean {
		return this.monitor?.isActive ?? false;
	}

	async startMicTest(): Promise<boolean> {
		if (this.transcriber?.isActive) return false;
		this.monitor?.stop();
		const monitor = new AudioCapture();
		monitor.setDeviceId(this.settings.audioDeviceId);
		try {
			await monitor.start(() => undefined);
			this.monitor = monitor;
			return true;
		} catch {
			monitor.stop();
			this.monitor = null;
			return false;
		}
	}

	stopMicTest(): void {
		this.monitor?.stop();
		this.monitor = null;
	}

	/** Live amplitude for the test meter, or 0 when not testing. */
	getTestLevel(): number {
		return this.monitor?.getLevel() ?? 0;
	}

	/** Dispose of any active session and clean up. */
	dispose(): void {
		this.stopMicTest();
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
		const customVocabulary = parseVoiceTermList(
			this.settings.customVocabulary,
		);
		return {
			transcriptionMode: this.settings.transcriptionMode,
			languageCodes: languageCodes.length ? languageCodes : undefined,
			customVocabulary: customVocabulary.length
				? customVocabulary
				: undefined,
			silenceDurationMs: this.settings.silenceDurationMs,
			prefixPaddingMs: this.settings.prefixPaddingMs,
			startOfSpeechSensitivity: this.settings.startOfSpeechSensitivity,
			endOfSpeechSensitivity: this.settings.endOfSpeechSensitivity,
		};
	}
}
