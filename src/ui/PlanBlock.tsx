import * as React from "react";
import type { MessageContent } from "../types/chat";
import type AgentClientPlugin from "../plugin";
import { LucideIcon } from "./shared/IconButton";

interface PlanBlockProps {
	content: Extract<MessageContent, { type: "plan" }>;
	plugin: AgentClientPlugin;
}

export function PlanBlock({ content, plugin }: PlanBlockProps) {
	const showEmojis = plugin.settings.displaySettings.showEmojis;
	return (
		<div className="agent-client-message-plan">
			<div className="agent-client-message-plan-title">
				{showEmojis && (
					<LucideIcon
						name="list-checks"
						className="agent-client-message-plan-label-icon"
					/>
				)}
				Plan
			</div>
			{content.entries.map((entry, idx) => (
				<div
					key={idx}
					className={`agent-client-message-plan-entry agent-client-plan-status-${entry.status}`}
				>
					{showEmojis && (
						<span
							className={`agent-client-message-plan-entry-icon agent-client-status-${entry.status}`}
						>
							<LucideIcon
								name={
									entry.status === "completed"
										? "check"
										: entry.status === "in_progress"
											? "loader"
											: "circle"
								}
							/>
						</span>
					)}{" "}
					{entry.content}
				</div>
			))}
		</div>
	);
}
