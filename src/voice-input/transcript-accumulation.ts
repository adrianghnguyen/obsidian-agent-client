/**
 * Accumulates streamed voice transcripts for the chat input.
 *
 * The Gemini Live API reports per-segment interims and finals, not the
 * whole utterance. The input keeps a running transcript baseline so new
 * segments append to the pre-existing prompt text (and to each other)
 * instead of overwriting it.
 *
 * The full input value is always `preVoiceInput + committed + interim`,
 * where `preVoiceInput` is whatever was in the input when dictation
 * started.
 */
export class VoiceTranscriptAccumulator {
	/** Input text present before dictation started. */
	private preVoiceInput = "";
	/** Committed transcript (every finalized segment so far). */
	private committed = "";
	/** Live interim for the segment currently being dictated. */
	private interim = "";

	/**
	 * Begin a dictation session, remembering whatever is already in the
	 * prompt so dictated text appends to it.
	 */
	begin(currentInputValue: string): void {
		this.preVoiceInput = currentInputValue;
		this.committed = "";
		this.interim = "";
	}

	/** Text to show in the input right now. */
	getPreview(): string {
		return this.preVoiceInput + this.committed + this.interim;
	}

	/**
	 * Record a new interim (replaces the previous interim of this segment).
	 * Returns the new input value, or null if unchanged.
	 */
	applyInterim(text: string): string | null {
		if (text === this.interim) return null;
		this.interim = text;
		return this.getPreview();
	}

	/**
	 * Commit a finalized segment. Returns the new input value, or null
	 * when there is nothing to commit (empty or whitespace-only final).
	 */
	applyFinal(text: string): string | null {
		if (!text.trim()) return null;
		this.committed += text;
		this.interim = "";
		return this.preVoiceInput + this.committed;
	}

	/**
	 * Drop the in-flight interim, keeping everything finalized so far.
	 * Used on stop/error so the input no longer lingers on a partial
	 * transcript.
	 */
	discardInterim(): string {
		this.interim = "";
		return this.preVoiceInput + this.committed;
	}
}
