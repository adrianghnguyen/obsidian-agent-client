import * as React from "react";
const { useState } = React;
import type { ChatMessage, MessageContent, ToolCallMessageContent } from "../types/chat";
import type { TraceVerbosity } from "../types/settings";
import type { AcpClient } from "../acp/acp-client";
import type AgentClientPlugin from "../plugin";
import type { TurnSegment, ThoughtItem } from "../services/trace-turn";
import { collectVisibleTurnRows, flattenTurnContents } from "../services/trace-turn";
import {
	groupTraceContent,
	hiddenTraceSummary,
	noisyToolGroupLabel,
	type HiddenTraceItem,
	type TraceContentGroup,
} from "../services/trace-verbosity";
import { ToolCallBlock } from "./ToolCallBlock";
import { PlanBlock } from "./PlanBlock";
import { LucideIcon } from "./shared/IconButton";
import { MarkdownRenderer } from "./shared/MarkdownRenderer";
import { CopyButton } from "./shared/CopyButton";
import { hasCopyableText } from "../utils/message-copy";

interface TurnTraceRendererProps {
	segment: TurnSegment;
	messages: ChatMessage[];
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}

function noisyKindIconName(kind: string): string {
	switch (kind) {
		case "read":
			return "book-open";
		case "search":
			return "search";
		case "fetch":
			return "globe";
		case "execute":
			return "square-terminal";
		case "edit":
			return "pencil";
		case "delete":
			return "trash";
		case "move":
			return "folder-open";
		case "think":
			return "message-circle-more";
		default:
			return "hammer";
	}
}

function CollapsibleThought({
	text,
	plugin,
	expandedByDefault,
}: {
	text: string;
	plugin: AgentClientPlugin;
	expandedByDefault: boolean;
}) {
	const [isExpanded, setIsExpanded] = useState(expandedByDefault);
	const showEmojis = plugin.settings.displaySettings.showEmojis;

	return (
		<div
			className="agent-client-collapsible-thought"
			onClick={() => setIsExpanded(!isExpanded)}
		>
			<div className="agent-client-collapsible-thought-header">
				{showEmojis && (
					<LucideIcon
						name="lightbulb"
						className="agent-client-collapsible-thought-label-icon"
					/>
				)}
				Thinking
				<LucideIcon
					name={isExpanded ? "chevron-down" : "chevron-right"}
					className="agent-client-collapsible-thought-icon"
				/>
			</div>
			{isExpanded && (
				<div className="agent-client-collapsible-thought-content">
					<MarkdownRenderer text={text} plugin={plugin} />
				</div>
			)}
		</div>
	);
}

function thoughtText(item: ThoughtItem): string {
	if (item.type === "agent_thought") return item.text;
	const block = item.content?.find((c) => c.type === "content");
	return block?.type === "content" ? block.text : item.title ?? "Thinking";
}

function HiddenTurnBuffer({
	items,
	plugin,
	terminalClient,
	sessionId,
	onApprovePermission,
}: {
	items: HiddenTraceItem[];
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	sessionId?: string | null;
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}) {
	const [expanded, setExpanded] = useState(false);
	const showEmojis = plugin.settings.displaySettings.showEmojis;
	const failedCount = items.filter(
		(item) => item.type === "tool_call" && item.status === "failed",
	).length;
	const inFlight = items.some(
		(item) =>
			item.type === "tool_call" &&
			(item.status === "in_progress" || item.status === "pending"),
	);
	const label = inFlight && items.length > 0
		? "Working\u2026"
		: hiddenTraceSummary(items);
	const compactGroups = groupTraceContent(items, "compact");

	return (
		<div
			className={`agent-client-noisy-tool-group agent-client-hidden-trace agent-client-turn-buffer${inFlight ? " agent-client-hidden-trace-active" : ""}`}
		>
			<div
				className="agent-client-noisy-tool-group-header"
				role="button"
				tabIndex={0}
				aria-expanded={expanded}
				aria-label={`${label}${failedCount > 0 ? `, ${failedCount} failed` : ""}`}
				onClick={() => setExpanded((v) => !v)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setExpanded((v) => !v);
					}
				}}
			>
				{showEmojis && (
					<LucideIcon
						name={inFlight ? "loader" : "ellipsis"}
						className="agent-client-noisy-tool-group-icon"
					/>
				)}
				<span className="agent-client-noisy-tool-group-title">{label}</span>
				{failedCount > 0 && (
					<span className="agent-client-noisy-tool-group-failed">
						{failedCount} failed
					</span>
				)}
				<LucideIcon
					name={expanded ? "chevron-down" : "chevron-right"}
					className="agent-client-noisy-tool-group-chevron"
				/>
			</div>
			{expanded && (
				<div className="agent-client-noisy-tool-group-items agent-client-turn-buffer-expanded">
					<TraceGroupList
						groups={compactGroups}
						plugin={plugin}
						terminalClient={terminalClient}
						sessionId={sessionId}
						traceVerbosity="compact"
						onApprovePermission={onApprovePermission}
					/>
				</div>
			)}
		</div>
	);
}

function NoisyToolGroup({
	kind,
	items,
	plugin,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: {
	kind: string;
	items: ToolCallMessageContent[];
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}) {
	const [expanded, setExpanded] = useState(false);
	const showEmojis = plugin.settings.displaySettings.showEmojis;
	const failedCount = items.filter((item) => item.status === "failed").length;
	const inFlight = items.some(
		(item) => item.status === "in_progress" || item.status === "pending",
	);
	const label = `${noisyToolGroupLabel(kind)} \u00b7 ${items.length}`;

	return (
		<div
			className={`agent-client-noisy-tool-group${inFlight ? " agent-client-hidden-trace-active" : ""}`}
		>
			<div
				className="agent-client-noisy-tool-group-header"
				role="button"
				tabIndex={0}
				aria-expanded={expanded}
				aria-label={`${label}${failedCount > 0 ? `, ${failedCount} failed` : ""}`}
				onClick={() => setExpanded((v) => !v)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						setExpanded((v) => !v);
					}
				}}
			>
				{showEmojis && (
					<LucideIcon
						name={inFlight ? "loader" : noisyKindIconName(kind)}
						className="agent-client-noisy-tool-group-icon"
					/>
				)}
				<span className="agent-client-noisy-tool-group-title">{label}</span>
				{failedCount > 0 && (
					<span className="agent-client-noisy-tool-group-failed">
						{failedCount} failed
					</span>
				)}
				<LucideIcon
					name={expanded ? "chevron-down" : "chevron-right"}
					className="agent-client-noisy-tool-group-chevron"
				/>
			</div>
			{expanded && (
				<div className="agent-client-noisy-tool-group-items">
					{items.map((content) => (
						<ToolCallBlock
							key={content.toolCallId}
							content={content}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity={traceVerbosity}
							onApprovePermission={onApprovePermission}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function TraceGroupList({
	groups,
	plugin,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: {
	groups: TraceContentGroup[];
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}) {
	return (
		<>
			{groups.map((group, idx) => {
				if (group.type === "hiddenTrace") {
					return null;
				}
				if (group.type === "noisyTools") {
					return (
						<NoisyToolGroup
							key={group.items[0]?.toolCallId ?? idx}
							kind={group.kind}
							items={group.items}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity={traceVerbosity}
							onApprovePermission={onApprovePermission}
						/>
					);
				}
				if (group.type === "attachments") {
					return (
						<div key={idx} className="agent-client-message-images-strip">
							{group.items.map((content, imgIdx) => (
								<TurnContentBlock
									key={imgIdx}
									content={content}
									plugin={plugin}
									terminalClient={terminalClient}
									sessionId={sessionId}
									traceVerbosity={traceVerbosity}
									onApprovePermission={onApprovePermission}
								/>
							))}
						</div>
					);
				}
				return (
					<div key={idx}>
						<TurnContentBlock
							content={group.item}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity={traceVerbosity}
							onApprovePermission={onApprovePermission}
						/>
					</div>
				);
			})}
		</>
	);
}

function TurnContentBlock({
	content,
	plugin,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: {
	content: MessageContent;
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}) {
	if (content.type === "agent_thought") {
		return (
			<CollapsibleThought
				text={content.text}
				plugin={plugin}
				expandedByDefault={false}
			/>
		);
	}
	if (content.type === "text" || content.type === "text_with_context") {
		return <MarkdownRenderer text={content.text} plugin={plugin} />;
	}
	if (content.type === "plan") {
		return <PlanBlock content={content} plugin={plugin} />;
	}
	if (content.type === "tool_call") {
		return (
			<ToolCallBlock
				content={content}
				plugin={plugin}
				terminalClient={terminalClient}
				sessionId={sessionId}
				traceVerbosity={traceVerbosity}
				onApprovePermission={onApprovePermission}
			/>
		);
	}
	return null;
}

export const TurnTraceRenderer = React.memo(function TurnTraceRenderer({
	segment,
	messages,
	plugin,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: TurnTraceRendererProps) {
	const rows = collectVisibleTurnRows(segment, messages, traceVerbosity);
	const answerContents = flattenTurnContents(segment, messages);
	const canCopy = hasCopyableText(answerContents);

	return (
		<div
			className={`agent-client-message-renderer agent-client-message-assistant agent-client-turn-trace${canCopy ? " agent-client-message-has-copy" : ""}`}
		>
			{rows.map((row, idx) => {
				if (row.type === "hiddenBuffer") {
					return (
						<HiddenTurnBuffer
							key={`buffer-${idx}`}
							items={row.items}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							onApprovePermission={onApprovePermission}
						/>
					);
				}
				if (row.type === "finalThought") {
					/* Compact only — Hidden keeps the last thought inside the buffer. */
					return (
						<CollapsibleThought
							key={`final-thought-${idx}`}
							text={thoughtText(row.item)}
							plugin={plugin}
							expandedByDefault={true}
						/>
					);
				}
				if (row.type === "compactGroups") {
					return (
						<TraceGroupList
							key={`groups-${idx}`}
							groups={row.groups}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity="compact"
							onApprovePermission={onApprovePermission}
						/>
					);
				}
				if (row.type === "text") {
					return (
						<div key={`text-${idx}`}>
							<MarkdownRenderer text={row.content.text} plugin={plugin} />
						</div>
					);
				}
				if (row.type === "permission") {
					return (
						<ToolCallBlock
							key={row.item.toolCallId}
							content={row.item}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity="full"
							onApprovePermission={onApprovePermission}
						/>
					);
				}
				if (row.type === "plan") {
					return (
						<div key={`plan-${idx}`}>
							<PlanBlock content={row.content} plugin={plugin} />
						</div>
					);
				}
				if (row.type === "createPlan") {
					return (
						<ToolCallBlock
							key={row.item.toolCallId}
							content={row.item}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity={traceVerbosity}
							onApprovePermission={onApprovePermission}
						/>
					);
				}
				if (row.type === "other") {
					return (
						<div key={`other-${idx}`}>
							<TurnContentBlock
								content={row.item}
								plugin={plugin}
								terminalClient={terminalClient}
								sessionId={sessionId}
								traceVerbosity={traceVerbosity}
								onApprovePermission={onApprovePermission}
							/>
						</div>
					);
				}
				return null;
			})}
			{canCopy && (
				<div className="agent-client-message-actions">
					<CopyButton contents={answerContents} />
				</div>
			)}
		</div>
	);
});
