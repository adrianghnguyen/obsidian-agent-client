/**
 * Keyboard policy for committing the composer while live dictation is on.
 * Enter (not Shift+Enter) sends the current buffer; suggestion dropdowns
 * still own Enter when they are open.
 */
export interface VoiceEnterCommitKeyEvent {
	key: string;
	shiftKey: boolean;
	metaKey?: boolean;
	ctrlKey?: boolean;
	isComposing?: boolean;
}

export interface VoiceEnterCommitState {
	isVoiceListening: boolean;
	suggestionOpen?: boolean;
}

/**
 * True when Enter should stop dictation and send the composer (typed text
 * plus live transcript preview), same path as the voice send control.
 */
export function shouldCommitVoiceTurnOnEnter(
	event: VoiceEnterCommitKeyEvent,
	state: VoiceEnterCommitState,
): boolean {
	if (!state.isVoiceListening) return false;
	if (state.suggestionOpen) return false;
	if (event.key !== "Enter") return false;
	if (event.shiftKey) return false;
	const hasCmdCtrl = Boolean(event.metaKey || event.ctrlKey);
	if (event.isComposing && !hasCmdCtrl) return false;
	return true;
}

/**
 * The buffer to send is the composer as shown: typed text plus the live
 * transcript preview. DOM, accumulator, and React state can lag each other
 * by a frame; take the longest snapshot.
 */
export function resolveVoiceComposerBuffer(
	textareaValue: string,
	accumulatorPreview: string,
	inputValue: string,
): string {
	let best = textareaValue;
	if (accumulatorPreview.length > best.length) best = accumulatorPreview;
	if (inputValue.length > best.length) best = inputValue;
	return best;
}
