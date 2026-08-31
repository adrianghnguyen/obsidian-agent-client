import {
	floatToPcm16Base64,
	resampleTo16k,
	TARGET_SAMPLE_RATE,
} from "./LiveProtocol";

/**
 * Streaming PCM audio recorder.
 *
 * Captures raw audio from the microphone via AudioContext, resamples to
 * 16 kHz mono 16-bit linear PCM, and delivers chunks to a callback.
 * Used by LiveTranscriber for the WebSocket Live API.
 */
export class AudioCapture {
	private audioContext: AudioContext | null = null;
	private mediaStream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private processor: ScriptProcessorNode | null = null;
	private silentGain: GainNode | null = null;
	private onChunk: ((base64Pcm: string) => void) | null = null;
	private isRecording = false;
	private deviceId: string | null = null;

	setDeviceId(deviceId: string | null): void {
		this.deviceId = deviceId;
	}

	async start(
		onChunk: (base64Pcm: string) => void,
	): Promise<void> {
		if (this.isRecording) return;

		this.onChunk = onChunk;

		const audioConstraints: MediaStreamConstraints["audio"] =
			this.deviceId && this.deviceId !== "default"
				? { deviceId: { ideal: this.deviceId } }
				: true;

		this.mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: audioConstraints,
		});

		try {
			this.audioContext = new AudioContext({
				sampleRate: TARGET_SAMPLE_RATE,
			});
		} catch {
			this.audioContext = new AudioContext();
		}

		if (this.audioContext.state === "suspended") {
			await this.audioContext.resume();
		}

		this.source = this.audioContext.createMediaStreamSource(
			this.mediaStream,
		);

		// ScriptProcessorNode for PCM access
		const bufferSize = 4096;
		this.processor = this.audioContext.createScriptProcessor(
			bufferSize,
			1,
			1,
		);

		this.processor.onaudioprocess = (event) => {
			if (!this.isRecording) return;
			const input = event.inputBuffer.getChannelData(0);
			const rate = this.audioContext?.sampleRate || TARGET_SAMPLE_RATE;
			const resampled = resampleTo16k(input, rate);
			if (!resampled.length) return;
			this.onChunk?.(floatToPcm16Base64(resampled));
		};

		// Keep the processor graph alive without playing through speakers
		this.silentGain = this.audioContext.createGain();
		this.silentGain.gain.value = 0;
		this.source.connect(this.processor);
		this.processor.connect(this.silentGain);
		this.silentGain.connect(this.audioContext.destination);
		this.isRecording = true;
	}

	stop(): void {
		if (!this.isRecording) return;
		this.isRecording = false;

		this.processor?.disconnect();
		this.source?.disconnect();
		this.silentGain?.disconnect();

		if (this.mediaStream) {
			this.mediaStream.getTracks().forEach((t) => t.stop());
		}

		this.audioContext?.close();
		this.audioContext = null;
		this.mediaStream = null;
		this.source = null;
		this.processor = null;
		this.silentGain = null;
	}

	get isActive(): boolean {
		return this.isRecording;
	}
}