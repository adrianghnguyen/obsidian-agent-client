import * as React from "react";
const { useEffect, useRef, useState, useMemo } = React;
import { setIcon } from "obsidian";
import { formatVoiceDuration } from "../voice-input/format-voice-duration";

const LEVEL_BAR_COUNT = 5;

export interface VoiceInputInlineProps {
	isListening: boolean;
	audioLevel: number;
	onStart: () => void;
	onStop: () => void;
	onStopAndSend: () => void;
	disabled?: boolean;
}

function VoiceLevelBars({ level }: { level: number }) {
	const heights = useMemo(() => {
		const clamped = Math.max(0, Math.min(1, level));
		return Array.from({ length: LEVEL_BAR_COUNT }, (_, i) => {
			// Stagger bars so the middle ones react more than the edges
			const weight =
				1 - Math.abs(i - (LEVEL_BAR_COUNT - 1) / 2) / LEVEL_BAR_COUNT;
			const h = 0.2 + clamped * weight * 0.8;
			return Math.round(h * 100);
		});
	}, [level]);

	return (
		<div
			className="agent-client-voice-level-bars"
			aria-hidden="true"
		>
			{heights.map((pct, i) => (
				<span
					key={i}
					className="agent-client-voice-level-bar"
					style={{ transform: `scaleY(${pct / 100})` }}
				/>
			))}
		</div>
	);
}

export function VoiceInputInline({
	isListening,
	audioLevel,
	onStart,
	onStop,
	onStopAndSend,
	disabled = false,
}: VoiceInputInlineProps) {
	const micRef = useRef<HTMLButtonElement>(null);
	const stopRef = useRef<HTMLButtonElement>(null);
	const sendRef = useRef<HTMLButtonElement>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const startedAtRef = useRef<number | null>(null);

	useEffect(() => {
		if (micRef.current && !isListening) {
			setIcon(micRef.current, "mic");
		}
	}, [isListening]);

	useEffect(() => {
		if (stopRef.current && isListening) {
			setIcon(stopRef.current, "square");
		}
	}, [isListening]);

	useEffect(() => {
		if (sendRef.current && isListening) {
			setIcon(sendRef.current, "arrow-up");
		}
	}, [isListening]);

	useEffect(() => {
		if (!isListening) {
			startedAtRef.current = null;
			setElapsedMs(0);
			return;
		}
		startedAtRef.current = Date.now();
		setElapsedMs(0);
		const id = window.setInterval(() => {
			const start = startedAtRef.current;
			if (start != null) {
				setElapsedMs(Date.now() - start);
			}
		}, 250);
		return () => window.clearInterval(id);
	}, [isListening]);

	if (!isListening) {
		return (
			<div className="agent-client-voice-inline">
				<button
					ref={micRef}
					type="button"
					className="agent-client-voice-mic-button"
					onClick={onStart}
					disabled={disabled}
					title="Start voice input"
					aria-label="Start voice input"
				/>
			</div>
		);
	}

	return (
		<div className="agent-client-voice-inline is-recording">
			<div className="agent-client-voice-recording">
				<button
					ref={stopRef}
					type="button"
					className="agent-client-voice-stop-button"
					onClick={onStop}
					title="Stop recording"
					aria-label="Stop recording"
				/>
				<span className="agent-client-voice-timer">
					{formatVoiceDuration(elapsedMs)}
				</span>
				<VoiceLevelBars level={audioLevel} />
			</div>
			<button
				ref={sendRef}
				type="button"
				className="agent-client-voice-send-button"
				onClick={onStopAndSend}
				title="Stop and send"
				aria-label="Stop and send"
			/>
		</div>
	);
}
