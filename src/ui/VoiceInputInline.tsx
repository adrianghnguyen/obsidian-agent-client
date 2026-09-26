import * as React from "react";
const { useEffect, useState, useId } = React;
import { micWavePath } from "../voice-input/mic-level-fill";

/** Lucide mic glyph (24×24). Head path is also the wave clip. */
const MIC_HEAD_PATH = "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z";
const MIC_ARC_PATH = "M19 10v2a7 7 0 0 1-14 0v-2";
const WAVE_TICK_MS = 70;

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
	const clipId = `agent-client-mic-head-${useId().replace(/:/g, "")}`;
	const [phase, setPhase] = useState(0);

	useEffect(() => {
		if (!recording) {
			setPhase(0);
			return;
		}
		const id = window.setInterval(() => {
			setPhase((current) => (current + 0.65) % (Math.PI * 2));
		}, WAVE_TICK_MS);
		return () => window.clearInterval(id);
	}, [recording]);

	return (
		<svg
			className="agent-client-voice-mic-icon"
			viewBox="0 0 24 24"
			width="16"
			height="16"
			aria-hidden="true"
		>
			<defs>
				<clipPath id={clipId}>
					<path d={MIC_HEAD_PATH} />
				</clipPath>
			</defs>
			<g className="agent-client-voice-mic-live">
				{recording && (
					<path
						className="agent-client-voice-mic-wave"
						d={micWavePath(level, phase)}
						clipPath={`url(#${clipId})`}
					/>
				)}
				<path d={MIC_HEAD_PATH} />
				<path d={MIC_ARC_PATH} />
				<line x1="12" x2="12" y1="19" y2="22" />
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
