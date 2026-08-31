/** Callback interface for receiving live transcription output. */
export interface TranscriptSink {
	onInterim(text: string): void;
	onFinal(text: string): void;
	onError(error: string): void;
}