import * as React from "react";
const { useState } = React;

import type { TurnNavEntry } from "../services/turn-navigation";

export interface TurnNavRailProps {
	entries: readonly TurnNavEntry[];
	activeTurnIndex: number;
	onJumpToTurn: (displayIndex: number) => void;
}

/**
 * Slim scrollbar-overlay rail showing proportional tick markers for each user
 * turn in the conversation, with hover/focus preview tooltips and click-to-jump.
 */
export function TurnNavRail({
	entries,
	activeTurnIndex,
	onJumpToTurn,
}: TurnNavRailProps) {
	const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

	if (entries.length < 2) {
		return null;
	}

	const hoveredEntry =
		hoveredIndex !== null && hoveredIndex >= 0 && hoveredIndex < entries.length
			? entries[hoveredIndex]
			: null;

	const tooltipTopPct = hoveredEntry
		? Math.min(88, Math.max(4, hoveredEntry.positionRatio * 100))
		: 0;

	return (
		<div
			className="agent-client-turn-rail"
			role="navigation"
			aria-label="Conversation turns"
		>
			{entries.map((entry, idx) => {
				const isActive = idx === activeTurnIndex;
				const label = entry.preview
					? `Jump to turn ${entry.turnNumber}: ${entry.preview}`
					: `Jump to turn ${entry.turnNumber}`;

				return (
					<button
						key={entry.key}
						type="button"
						className={`agent-client-turn-rail-marker${isActive ? " is-active" : ""}`}
						style={{ top: `${(entry.positionRatio * 100).toFixed(2)}%` }}
						aria-label={label}
						aria-current={isActive ? "location" : undefined}
						onMouseEnter={() => setHoveredIndex(idx)}
						onMouseLeave={() =>
							setHoveredIndex((prev) => (prev === idx ? null : prev))
						}
						onFocus={() => setHoveredIndex(idx)}
						onBlur={() =>
							setHoveredIndex((prev) => (prev === idx ? null : prev))
						}
						onClick={() => onJumpToTurn(entry.displayIndex)}
					>
						<span className="agent-client-turn-rail-tick" />
					</button>
				);
			})}

			{hoveredEntry && (
				<div
					className="agent-client-turn-rail-tooltip"
					role="tooltip"
					style={{ top: `${tooltipTopPct.toFixed(2)}%` }}
				>
					<span className="agent-client-turn-rail-tooltip-title">
						Turn {hoveredEntry.turnNumber}
					</span>
					{hoveredEntry.preview && (
						<span className="agent-client-turn-rail-tooltip-preview">
							{hoveredEntry.preview}
						</span>
					)}
				</div>
			)}
		</div>
	);
}
