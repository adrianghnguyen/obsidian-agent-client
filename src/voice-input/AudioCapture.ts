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
	private analyser: AnalyserNode | null = null;
	private silentGain: GainNode | null = null;
	private frequencyData: Uint8Array<ArrayBuffer> | null = null;
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

		this.analyser = this.audioContext.createAnalyser();
		this.analyser.fftSize = 256;
		this.analyser.smoothingTimeConstant = 0.7;
		this.frequencyData = new Uint8Array(
			new ArrayBuffer(this.analyser.frequencyBinCount),
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
		this.source.connect(this.analyser);
		this.source.connect(this.processor);
		this.processor.connect(this.silentGain);
		this.silentGain.connect(this.audioContext.destination);
		this.isRecording = true;
	}

	stop(): void {
		if (!this.isRecording) return;
		this.isRecording = false;

		this.processor?.disconnect();
		this.analyser?.disconnect();
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
		this.analyser = null;
		this.frequencyData = null;
		this.silentGain = null;
	}

	/**
	 * Instantaneous mic amplitude in [0, 1]. Returns 0 when not recording.
	 * Uses frequency-domain RMS from the AnalyserNode on the capture graph.
	 */
	getLevel(): number {
		if (!this.isRecording || !this.analyser || !this.frequencyData) {
			return 0;
		}
		this.analyser.getByteFrequencyData(this.frequencyData);
		let sum = 0;
		for (let i = 0; i < this.frequencyData.length; i++) {
			const v = this.frequencyData[i] / 255;
			sum += v * v;
		}
		const rms = Math.sqrt(sum / this.frequencyData.length);
		return Math.min(1, rms * 2.2);
	}

	get isActive(): boolean {
		return this.isRecording;
	}
}