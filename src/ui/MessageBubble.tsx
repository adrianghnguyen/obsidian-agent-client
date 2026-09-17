import * as React from "react";
const { useState, useEffect } = React;
import { setIcon } from "obsidian";
import type {
	ChatMessage,
	MessageContent,
	ToolCallMessageContent,
} from "../types/chat";
import type { AcpClient } from "../acp/acp-client";
import type AgentClientPlugin from "../plugin";
import type { TraceVerbosity } from "../types/settings";
import {
	groupTraceContent,
	hiddenTraceSummary,
	noisyToolGroupLabel,
	shouldRenderThought,
	thoughtExpandedByDefault,
	type HiddenTraceItem,
} from "../services/trace-verbosity";
import { MarkdownRenderer } from "./shared/MarkdownRenderer";
import { TerminalBlock } from "./TerminalBlock";
import { ToolCallBlock } from "./ToolCallBlock";
import { PlanBlock } from "./PlanBlock";
import { LucideIcon } from "./shared/IconButton";
import { CopyButton } from "./shared/CopyButton";
import { hasCopyableText } from "../utils/message-copy";

// ---------------------------------------------------------------------------
// TextWithMentions (internal helper)
// ---------------------------------------------------------------------------

interface TextWithMentionsProps {
	text: string;
	plugin: AgentClientPlugin;
	autoMentionContext?: {
		noteName: string;
		notePath: string;
		selection?: {
			fromLine: number;
			toLine: number;
		};
	};
}

// Function to render text with @mentions and optional auto-mention
function TextWithMentions({
	text,
	plugin,
	autoMentionContext,
}: TextWithMentionsProps): React.ReactElement {
	// Match @[[filename]] format only
	const mentionRegex = /@\[\[([^\]]+)\]\]/g;
	const parts: React.ReactNode[] = [];

	// Add auto-mention badge first if provided
	if (autoMentionContext) {
		const displayText = autoMentionContext.selection
			? `@${autoMentionContext.noteName}:${autoMentionContext.selection.fromLine}-${autoMentionContext.selection.toLine}`
			: `@${autoMentionContext.noteName}`;

		parts.push(
			<span
				key="auto-mention"
				className="agent-client-text-mention"
				onClick={() => {
					void plugin.app.workspace.openLinkText(
						autoMentionContext.notePath,
						"",
					);
				}}
			>
				{displayText}
			</span>,
		);
		parts.push("\n");
	}

	let lastIndex = 0;
	let match;

	while ((match = mentionRegex.exec(text)) !== null) {
		// Add text before the mention
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}

		// Extract filename from [[brackets]]
		const noteName = match[1];

		// Check if file actually exists
		const file = plugin.app.vault
			.getMarkdownFiles()
			.find((f) => f.basename === noteName);

		if (file) {
			// File exists - render as clickable mention
			parts.push(
				<span
					key={match.index}
					className="agent-client-text-mention"
					onClick={() => {
						void plugin.app.workspace.openLinkText(file.path, "");
					}}
				>
					@{noteName}
				</span>,
			);
		} else {
			// File doesn't exist - render as plain text
			parts.push(`@${noteName}`);
		}

		lastIndex = match.index + match[0].length;
	}

	// Add any remaining text
	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return <div className="agent-client-text-with-mentions">{parts}</div>;
}

// ---------------------------------------------------------------------------
// CollapsibleThought (internal helper)
// ---------------------------------------------------------------------------

interface CollapsibleThoughtProps {
	text: string;
	plugin: AgentClientPlugin;
	expandedByDefault: boolean;
}

function CollapsibleThought({
	text,
	plugin,
	expandedByDefault,
}: CollapsibleThoughtProps) {
	const [isExpanded, setIsExpanded] = useState(expandedByDefault);
	const showEmojis = plugin.settings.displaySettings.showEmojis;

	useEffect(() => {
		setIsExpanded(expandedByDefault);
	}, [expandedByDefault]);

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

// ---------------------------------------------------------------------------
// ContentBlock (internal helper, formerly MessageContentRenderer)
// ---------------------------------------------------------------------------

interface ContentBlockProps {
	content: MessageContent;
	plugin: AgentClientPlugin;
	messageRole?: "user" | "assistant";
	terminalClient?: AcpClient;
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	/** Callback to approve a permission request */
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
}

function ContentBlock({
	content,
	plugin,
	messageRole,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: ContentBlockProps) {
	switch (content.type) {
		case "text":
			// User messages: render with mention support
			// Assistant messages: render as markdown
			if (messageRole === "user") {
				return <TextWithMentions text={content.text} plugin={plugin} />;
			}
			return <MarkdownRenderer text={content.text} plugin={plugin} />;

		case "text_with_context":
			// User messages with auto-mention context
			return (
				<TextWithMentions
					text={content.text}
					autoMentionContext={content.autoMentionContext}
					plugin={plugin}
				/>
			);

		case "agent_thought":
			if (!shouldRenderThought(traceVerbosity)) {
				return null;
			}
			return (
				<CollapsibleThought
					text={content.text}
					plugin={plugin}
					expandedByDefault={thoughtExpandedByDefault(traceVerbosity)}
				/>
			);

		case "tool_call":
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

		case "plan":
			return <PlanBlock content={content} plugin={plugin} />;

		case "terminal":
			return (
				<TerminalBlock
					terminalId={content.terminalId}
					terminalClient={terminalClient || null}
				/>
			);

		case "image":
			return (
				<div className="agent-client-message-image">
					<img
						src={`data:${content.mimeType};base64,${content.data}`}
						alt="Attached image"
						className="agent-client-message-image-thumbnail"
					/>
				</div>
			);

		case "resource_link":
			return (
				<div className="agent-client-message-resource-link">
					<span
						className="agent-client-message-resource-link-icon"
						ref={(el) => {
							if (el) setIcon(el, "file");
						}}
					/>
					<span className="agent-client-message-resource-link-name">
						{content.name}
					</span>
				</div>
			);

		default:
			return <span>Unsupported content type</span>;
	}
}

// ---------------------------------------------------------------------------
// MessageBubble (exported, formerly MessageRenderer)
// ---------------------------------------------------------------------------

export interface MessageBubbleProps {
	message: ChatMessage;
	plugin: AgentClientPlugin;
	terminalClient?: AcpClient;
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	/** Callback to approve a permission request */
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
		case "think":
			return "message-circle-more";
		default:
			return "hammer";
	}
}

interface NoisyToolGroupProps {
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
}

function HiddenTraceGroup({
	items,
	plugin,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: {
	items: HiddenTraceItem[];
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
	const failedCount = items.filter(
		(item) => item.type === "tool_call" && item.status === "failed",
	).length;
	const inFlight = items.some(
		(item) =>
			item.type === "tool_call" &&
			(item.status === "in_progress" || item.status === "pending"),
	);
	const label = hiddenTraceSummary(items);

	return (
		<div
			className={`agent-client-noisy-tool-group agent-client-hidden-trace${inFlight ? " agent-client-hidden-trace-active" : ""}`}
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
				<span className="agent-client-noisy-tool-group-title">
					{label}
				</span>
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
					{groupTraceContent(items, "compact").map((group, gIdx) => {
						if (group.type === "noisyTools") {
							return (
								<NoisyToolGroup
									key={group.items[0]?.toolCallId ?? gIdx}
									kind={group.kind}
									items={group.items}
									plugin={plugin}
									terminalClient={terminalClient}
									sessionId={sessionId}
									traceVerbosity="compact"
									onApprovePermission={onApprovePermission}
								/>
							);
						}
						if (group.type === "single" && group.item.type === "agent_thought") {
							return (
								<CollapsibleThought
									key={`thought-${gIdx}`}
									text={group.item.text}
									plugin={plugin}
									expandedByDefault={false}
								/>
							);
						}
						if (group.type === "single" && group.item.type === "tool_call") {
							return (
								<ToolCallBlock
									key={group.item.toolCallId}
									content={group.item}
									plugin={plugin}
									terminalClient={terminalClient}
									sessionId={sessionId}
									traceVerbosity="compact"
									onApprovePermission={onApprovePermission}
								/>
							);
						}
						return null;
					})}
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
}: NoisyToolGroupProps) {
	const [expanded, setExpanded] = useState(false);
	const showEmojis = plugin.settings.displaySettings.showEmojis;
	const failedCount = items.filter((item) => item.status === "failed").length;
	const label = `${noisyToolGroupLabel(kind)} \u00b7 ${items.length}`;

	return (
		<div className="agent-client-noisy-tool-group">
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
						name={noisyKindIconName(kind)}
						className="agent-client-noisy-tool-group-icon"
					/>
				)}
				<span className="agent-client-noisy-tool-group-title">
					{label}
				</span>
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

export const MessageBubble = React.memo(function MessageBubble({
	message,
	plugin,
	terminalClient,
	sessionId,
	traceVerbosity,
	onApprovePermission,
}: MessageBubbleProps) {
	const groups = groupTraceContent(message.content, traceVerbosity);
	const canCopy = hasCopyableText(message.content);
	const roleClass =
		message.role === "user"
			? "agent-client-message-user"
			: "agent-client-message-assistant";

	return (
		<div
			className={`agent-client-message-renderer ${roleClass}${canCopy ? " agent-client-message-has-copy" : ""}`}
		>
			{groups.map((group, idx) => {
				if (group.type === "attachments") {
					return (
						<div
							key={idx}
							className="agent-client-message-images-strip"
						>
							{group.items.map((content, imgIdx) => (
								<ContentBlock
									key={imgIdx}
									content={content}
									plugin={plugin}
									messageRole={message.role}
									terminalClient={terminalClient}
									sessionId={sessionId}
									traceVerbosity={traceVerbosity}
									onApprovePermission={onApprovePermission}
								/>
							))}
						</div>
					);
				}
				if (group.type === "hiddenTrace") {
					return (
						<HiddenTraceGroup
							key={
								group.items[0]?.type === "tool_call"
									? group.items[0].toolCallId
									: idx
							}
							items={group.items}
							plugin={plugin}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity={traceVerbosity}
							onApprovePermission={onApprovePermission}
						/>
					);
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
				return (
					<div key={idx}>
						<ContentBlock
							content={group.item}
							plugin={plugin}
							messageRole={message.role}
							terminalClient={terminalClient}
							sessionId={sessionId}
							traceVerbosity={traceVerbosity}
							onApprovePermission={onApprovePermission}
						/>
					</div>
				);
			})}
			{canCopy && (
				<div className="agent-client-message-actions">
					<CopyButton contents={message.content} />
				</div>
			)}
		</div>
	);
});
