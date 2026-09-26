import * as React from "react";
const { useEffect, useRef, useState, useId, useCallback } = React;
import { setIcon } from "obsidian";
import { formatVoiceDuration } from "../voice-input/format-voice-duration";
import { composerEnterShouldSend } from "../voice-input/composer-enter";
import { micHeadFill } from "../voice-input/mic-level-fill";
import type { SendMessageShortcut } from "../types/settings";

/** Lucide mic glyph (24×24). Head path is also the level clip. */
const MIC_HEAD_PATH = "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z";
const MIC_ARC_PATH = "M19 10v2a7 7 0 0 1-14 0v-2";

export interface VoiceInputInlineProps {
	isListening: boolean;
	audioLevel: number;
	onStart: () => void;
	onStop: () => void;
	onStopAndSend: () => void;
	sendMessageShortcut?: SendMessageShortcut;
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
	const fill = micHeadFill(recording ? level : 0);

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
			{recording && fill.height > 0 && (
				<rect
					className="agent-client-voice-mic-level"
					x="8"
					width="8"
					y={fill.y}
					height={fill.height}
					clipPath={`url(#${clipId})`}
				/>
			)}
			<path d={MIC_HEAD_PATH} />
			<path d={MIC_ARC_PATH} />
			<line x1="12" x2="12" y1="19" y2="22" />
		</svg>
	);
}

export function VoiceInputInline({
	isListening,
	audioLevel,
	onStart,
	onStop,
	onStopAndSend,
	sendMessageShortcut = "enter",
	disabled = false,
}: VoiceInputInlineProps) {
	const stopRef = useRef<HTMLButtonElement>(null);
	const sendRef = useRef<HTMLButtonElement>(null);
	const [elapsedMs, setElapsedMs] = useState(0);
	const startedAtRef = useRef<number | null>(null);

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

	const handleRecordingKeyDownCapture = useCallback(
		(e: React.KeyboardEvent) => {
			if (
				!composerEnterShouldSend(
					{
						key: e.key,
						shiftKey: e.shiftKey,
						metaKey: e.metaKey,
						ctrlKey: e.ctrlKey,
						isComposing: e.nativeEvent.isComposing,
					},
					sendMessageShortcut,
				)
			) {
				return;
			}
			/* Capture so Enter on Stop does not click Stop (stop-without-send). */
			e.preventDefault();
			e.stopPropagation();
			onStopAndSend();
		},
		[onStopAndSend, sendMessageShortcut],
	);

	return (
		<div
			className={`agent-client-voice-inline${isListening ? " is-recording" : ""}`}
			onKeyDownCapture={
				isListening ? handleRecordingKeyDownCapture : undefined
			}
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
			{isListening && (
				<>
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
					</div>
					<button
						ref={sendRef}
						type="button"
						className="agent-client-voice-send-button"
						onClick={onStopAndSend}
						title="Stop and send"
						aria-label="Stop and send"
					/>
				</>
			)}
		</div>
	);
}
