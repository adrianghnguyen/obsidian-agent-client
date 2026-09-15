import type { VoiceTranscriptAccumulator } from "./transcript-accumulation";

/**
 * Mutable generation counter for Gemini Live sink callbacks.
 * Bumping it makes in-flight onInterim/onFinal/onError no-ops.
 */
export interface VoiceSinkGeneration {
	current: number;
}

/**
 * Turn-ending actions (send, Enter, stop generation, voice-clip send)
 * must drop the live transcript cache so the next prompt starts empty.
 * Bump the sink generation first so late finals during stop() flush
 * cannot write the previous utterance back into the input.
 */
export function endVoiceTranscriptTurn(
	acc: VoiceTranscriptAccumulator,
	sinkGeneration: VoiceSinkGeneration,
): void {
	sinkGeneration.current += 1;
	acc.clear();
}

export function isCurrentVoiceSink(
	sinkGeneration: VoiceSinkGeneration,
	sinkId: number,
): boolean {
	return sinkId === sinkGeneration.current;
}
