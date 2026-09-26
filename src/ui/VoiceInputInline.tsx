import * as React from "react";
const { useMemo } = React;
import { micLevelBars } from "../voice-input/mic-level-fill";

/** Lucide mic glyph (24×24), shown only while idle. */
const MIC_HEAD_PATH = "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z";
const MIC_ARC_PATH = "M19 10v2a7 7 0 0 1-14 0v-2";

export interface VoiceInputInlineProps {
	isListening: boolean;
	audioLevel: number;
	onStart: () => void;
	onStop: () => void;
	disabled?: boolean;
}

function MicLevelIcon({
	level,
	recording,
}: {
	level: number;
	recording: boolean;
}) {
	const bars = useMemo(
		() => (recording ? micLevelBars(level) : []),
		[level, recording],
	);

	return (
		<svg
			className="agent-client-voice-mic-icon"
			viewBox="0 0 24 24"
			width="16"
			height="16"
			aria-hidden="true"
		>
			<g className="agent-client-voice-mic-live">
				{recording ? (
					<g className="agent-client-voice-mic-bars">
						{bars.map((bar, i) => (
							<rect
								key={i}
								className="agent-client-voice-mic-bar"
								x={bar.x}
								y={bar.y}
								width={bar.width}
								height={bar.height}
								rx="0.75"
							/>
						))}
					</g>
				) : (
					<>
						<path d={MIC_HEAD_PATH} />
						<path d={MIC_ARC_PATH} />
						<line x1="12" x2="12" y1="19" y2="22" />
					</>
				)}
			</g>
			<rect
				className="agent-client-voice-mic-stop"
				x="7"
				y="7"
				width="10"
				height="10"
				rx="1.5"
			/>
		</svg>
	);
}

export function VoiceInputInline({
	isListening,
	audioLevel,
	onStart,
	onStop,
	disabled = false,
}: VoiceInputInlineProps) {
	return (
		<div
			className={`agent-client-voice-inline${isListening ? " is-recording" : ""}`}
		>
			<button
				type="button"
				className={`agent-client-voice-mic-button${isListening ? " is-recording" : ""}`}
				onClick={isListening ? onStop : onStart}
				disabled={!isListening && disabled}
				title={isListening ? "Stop recording" : "Start voice input"}
				aria-label={
					isListening ? "Stop recording" : "Start voice input"
				}
				aria-pressed={isListening}
			>
				<MicLevelIcon level={audioLevel} recording={isListening} />
			</button>
		</div>
	);
}
