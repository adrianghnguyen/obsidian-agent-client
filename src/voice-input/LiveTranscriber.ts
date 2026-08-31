import {
	LIVE_WS_URL,
	setupMessage,
	realtimeAudioMessage,
	audioStreamEndMessage,
	parseLiveMessage,
	decodeWsData,
} from "./LiveProtocol";
import { AudioCapture } from "./AudioCapture";
import type { TranscriptSink } from "./types";

export type { TranscriptSink };

export interface LiveSocket {
	readyState: number;
	send(data: string): void;
	close(): void;
	onopen: ((ev?: unknown) => void) | null;
	onmessage: ((ev: { data: unknown }) => void) | null;
	onerror: ((ev?: unknown) => void) | null;
	onclose: ((ev: { reason?: string }) => void) | null;
}

export interface LiveAudioSource {
	setDeviceId(deviceId: string | null): void;
	start(
		onChunk: (base64Pcm: string) => void,
		onStop?: () => void,
	): Promise<void>;
	stop(): void;
}

export interface LiveSessionDeps {
	createSocket?: (url: string) => LiveSocket;
	audioSource?: LiveAudioSource;
	flushDelayMs?: number;
}

const SETUP_TIMEOUT_MS = 10000;
const WS_OPEN = 1;

/**
 * LiveTranscriber
 *
 * Real-time streaming transcription via the Gemini Live API (WebSockets).
 * Sends raw 16kHz PCM chunks and receives interim/final transcripts
 * through a TranscriptSink callback interface.
 *
 * Fully decoupled from Obsidian: no plugin dependency, no Notice calls.
 * Errors are delivered via sink.onError().
 */
export class LiveTranscriber {
	private apiKey: string;
	private model: string;
	private socket: LiveSocket | null = null;
	private audioSource: LiveAudioSource;
	private createSocket: (url: string) => LiveSocket;
	private flushDelayMs: number;
	private _isActive = false;
	private setupComplete = false;
	private currentSink: TranscriptSink | null = null;
	private startPromise: Promise<void> | null = null;

	constructor(
		apiKey: string,
		model: string,
		deps: LiveSessionDeps = {},
	) {
		this.apiKey = apiKey;
		this.model = model;
		this.audioSource = deps.audioSource ?? new AudioCapture();
		this.createSocket =
			deps.createSocket ?? ((url) => new WebSocket(url) as unknown as LiveSocket);
		this.flushDelayMs = deps.flushDelayMs ?? 1000;
	}

	get isActive(): boolean {
		return this._isActive;
	}

	async start(sink: TranscriptSink): Promise<void> {
		if (this._isActive) return;
		if (this.startPromise) return this.startPromise;

		if (!this.apiKey) {
			sink.onError("Add your Gemini API key in Voice Input settings");
			return;
		}

		this.currentSink = sink;

		this.startPromise = this.doStart(sink);
		try {
			await this.startPromise;
		} finally {
			this.startPromise = null;
		}
	}

	private async doStart(sink: TranscriptSink): Promise<void> {
		try {
			await this.connectSocket();

			await this.audioSource.start((pcmChunk) => {
				this.sendChunk(pcmChunk);
			});

			this._isActive = true;
		} catch (err) {
			const detail = err instanceof Error ? err.message : String(err);
			sink.onError("Could not start live transcription: " + detail);
			this.cleanup();
		}
	}

	async stop(): Promise<void> {
		if (!this._isActive && !this.socket) return;
		this._isActive = false;

		this.audioSource.stop();

		if (this.socket && this.socket.readyState === WS_OPEN) {
			this.socket.send(JSON.stringify(audioStreamEndMessage()));
			if (this.flushDelayMs > 0) {
				await new Promise((resolve) =>
					setTimeout(resolve, this.flushDelayMs),
				);
			}
		}

		if (this.currentSink) {
			// Tell the sink the stream ended — final text already delivered
		}
		this.cleanup();
	}

	dispose(): void {
		this.cleanup();
	}

	private async connectSocket(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const wsUrl = `${LIVE_WS_URL}?key=${encodeURIComponent(this.apiKey)}`;
			this.socket = this.createSocket(wsUrl);
			this.setupComplete = false;
			let settled = false;

			const finish = (err?: Error) => {
				if (settled) return;
				settled = true;
				clearTimeout(timeout);
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			};

			const timeout = setTimeout(() => {
				finish(new Error("Live API setup timed out"));
			}, SETUP_TIMEOUT_MS);

			this.socket.onopen = () => {
				this.socket?.send(
					JSON.stringify(
						setupMessage(this.model),
					),
				);
			};

			this.socket.onerror = () => {
				finish(new Error("WebSocket connection failed"));
			};

			this.socket.onmessage = (event) => {
				void this.onSocketMessage(event.data, finish);
			};

			this.socket.onclose = (ev) => {
				if (!settled) {
					finish(
						new Error(
							ev.reason || "Live API connection closed during setup",
						),
					);
					return;
				}
				if (this._isActive) {
					this.currentSink?.onError("Live transcription disconnected");
					this._isActive = false;
					this.setupComplete = false;
					this.currentSink = null;
					this.audioSource.stop();
					this.socket = null;
				}
			};
		});
	}

	private async onSocketMessage(
		data: unknown,
		finish: (err?: Error) => void,
	): Promise<void> {
		// The Gemini Live server delivers messages as Blobs in Chromium,
		// which requires async decoding; decodeWsDataSync would drop them.
		let text: string;
		try {
			text = await decodeWsData(data);
		} catch {
			return;
		}

		let msg: unknown;
		try {
			msg = JSON.parse(text);
		} catch {
			return;
		}

		const parsed = parseLiveMessage(msg);

		if (!this.currentSink) return;

		if (parsed.errorMessage) {
			this.currentSink.onError(parsed.errorMessage);
			if (!this.setupComplete) {
				finish(new Error(parsed.errorMessage));
			}
			return;
		}

		if (parsed.setupComplete) {
			this.setupComplete = true;
			finish();
		}

		if (parsed.interimText) {
			this.currentSink.onInterim(parsed.interimText);
		}

		if (parsed.finalText) {
			this.currentSink.onFinal(parsed.finalText);
		}
	}

	private sendChunk(base64Pcm: string): void {
		if (
			!this.setupComplete ||
			!this.socket ||
			this.socket.readyState !== WS_OPEN
		) {
			return;
		}
		this.socket.send(JSON.stringify(realtimeAudioMessage(base64Pcm)));
	}

	private cleanup(): void {
		this._isActive = false;
		this.setupComplete = false;
		this.currentSink = null;
		if (this.socket) {
			try {
				this.socket.close();
			} catch {
				// ignore
			}
			this.socket = null;
		}
		try {
			this.audioSource.stop();
		} catch {
			// ignore
		}
	}
}