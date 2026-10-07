import * as React from "react";
import { setIcon } from "obsidian";

import {
	beginPlacementDrag,
	consumePlacementClickSuppression,
	type PlacementDragOrigin,
} from "../services/chat-placement";
import { HeaderButton } from "./shared/IconButton";
import { FloatingTransparencyLockButton } from "./shared/FloatingTransparencyLockButton";
import { useChatContext } from "./ChatContext";
import { WindowMinimizeCloseButton } from "./shared/WindowMinimizeCloseButton";
import { AgentSelector } from "./shared/AgentSelector";
import type { AgentDisplayInfo } from "../services/session-helpers";

// ============================================================================
// Props Types
// ============================================================================

/**
 * Props for the sidebar variant of ChatHeader
 */
export interface SidebarHeaderProps {
	variant: "sidebar";
	/** Display name of the active agent */
	agentLabel: string;
	/** Available agents for switching (same enumeration as floating chat) */
	availableAgents?: AgentDisplayInfo[];
	/** Current agent ID */
	currentAgentId?: string;
	/** Callback to switch agent */
	onAgentChange?: (agentId: string) => void;
	/** Whether a plugin update is available */
	isUpdateAvailable: boolean;
	/** Callback to create a new chat session */
	onNewChat: () => void;
	/** Callback to export the chat */
	onExportChat: () => void;
	/** Callback to show the header menu at the click position */
	onShowMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
	/** Callback to open session history */
	onOpenHistory?: () => void;
	/** Move this docked chat into a floating window. */
	onFloatChat?: () => void;
	/** View id carried by the float drag. */
	placementViewId?: string;
}

/**
 * Props for the floating variant of ChatHeader
 */
export interface FloatingHeaderProps {
	variant: "floating";
	/** Display name of the active agent */
	agentLabel: string;
	/** Available agents for switching */
	availableAgents: AgentDisplayInfo[];
	/** Current agent ID */
	currentAgentId: string;
	/** Whether a plugin update is available */
	isUpdateAvailable: boolean;
	/** Callback to switch agent */
	onAgentChange: (agentId: string) => void;
	/** Callback to show the More menu at the click position */
	onShowMenu: (e: React.MouseEvent<HTMLElement>) => void;
	/** Callback to minimize window (floating only) */
	onMinimize?: () => void;
	/** Callback to close and terminate window (floating only) */
	onClose?: () => void;
	/** When true, More / minimize / close render elsewhere (tab bar). */
	hideWindowControls?: boolean;
	/** Move this floating chat into a docked workspace leaf. */
	onDockChat?: () => void;
	/** View id carried by the dock drag. */
	placementViewId?: string;
}

/**
 * Props for the embedded variant of ChatHeader
 * (used in code-block / embedded chat contexts).
 *
 * Unlike FloatingHeaderProps, the agent-selection fields are optional:
 * when the block pins an agent (config.agent set), ChatPanel passes
 * `undefined` so the selector is hidden and switching is disabled.
 */
export interface EmbeddedHeaderProps {
	variant: "embedded";
	/** Display name of the active agent */
	agentLabel: string;
	/** Whether a plugin update is available */
	isUpdateAvailable: boolean;
	/** Available agents for switching (omitted when the block pins an agent) */
	availableAgents?: AgentDisplayInfo[];
	/** Current agent ID */
	currentAgentId?: string;
	/** Callback to switch agent (omitted when the block pins an agent) */
	onAgentChange?: (agentId: string) => void;
	/** Callback to show the More menu at the click position */
	onShowMenu: (e: React.MouseEvent<HTMLElement>) => void;
}

/**
 * Union type for ChatHeader props - dispatches based on variant
 */
export type ChatHeaderProps =
	| SidebarHeaderProps
	| FloatingHeaderProps
	| EmbeddedHeaderProps;

// ============================================================================
// Internal Components
// ============================================================================

/**
 * A single action button matching Obsidian's nav-action-button pattern.
 * Uses setIcon() to render Lucide icons identically to native sidebar buttons.
 */
function NavActionButton({
	icon,
	label,
	onClick,
}: {
	icon: string;
	label: string;
	onClick: (e: React.MouseEvent<HTMLDivElement>) => void;
}) {
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (ref.current) {
			setIcon(ref.current, icon);
		}
	}, [icon]);

	return (
		<div
			ref={ref}
			className="clickable-icon nav-action-button"
			aria-label={label}
			onClick={onClick}
		/>
	);
}

/**
 * Click moves the chat. Drag drops it on the other kind of window.
 * mousedown is stopped so a floating header drag does not start a window move.
 */
function PlacementDragButton({
	icon,
	label,
	origin,
	viewId,
	onMove,
}: {
	icon: string;
	label: string;
	origin: PlacementDragOrigin;
	viewId: string;
	onMove: () => void;
}) {
	const ref = React.useRef<HTMLDivElement>(null);

	React.useEffect(() => {
		if (ref.current) setIcon(ref.current, icon);
	}, [icon]);

	return (
		<div
			ref={ref}
			className="clickable-icon nav-action-button agent-client-placement-drag-handle"
			draggable
			aria-label={label}
			title={label}
			onMouseDown={(event) => event.stopPropagation()}
			onDragStart={(event) => {
				event.stopPropagation();
				beginPlacementDrag(
					event.dataTransfer,
					{ viewId, origin },
					{ suppressClick: true },
				);
			}}
			onClick={() => {
				if (consumePlacementClickSuppression()) return;
				onMove();
			}}
		/>
	);
}

// ============================================================================
// Sidebar Header
// ============================================================================

/**
 * Header component for the sidebar chat view.
 *
 * Uses Obsidian's native .nav-header + .nav-buttons-container pattern
 * to match the look of File Explorer, Bookmarks, and other sidebar panes.
 * The agent label is presented by the view's own tab header, so this row only
 * carries actions; switching agents lives in the More menu.
 */
function SidebarHeader({
	agentLabel,
	availableAgents,
	currentAgentId,
	onAgentChange,
	isUpdateAvailable,
	onNewChat,
	onExportChat,
	onShowMenu,
	onOpenHistory,
	onFloatChat,
	placementViewId,
}: SidebarHeaderProps) {
	return (
		<div className="nav-header agent-client-chat-view-header">
			<div className="nav-buttons-container">
				{onAgentChange ? (
					<AgentSelector
						availableAgents={availableAgents}
						currentAgentId={currentAgentId}
						agentLabel={agentLabel}
						onAgentChange={onAgentChange}
					/>
				) : (
					<span className="agent-client-chat-view-header-title">
						{agentLabel}
					</span>
				)}
				{isUpdateAvailable && (
					<span className="agent-client-chat-view-header-update">
						Plugin update available!
					</span>
				)}
				<NavActionButton
					icon="plus"
					label="New chat"
					onClick={onNewChat}
				/>
				{onOpenHistory && (
					<NavActionButton
						icon="history"
						label="Session history"
						onClick={onOpenHistory}
					/>
				)}
				<NavActionButton
					icon="save"
					label="Export chat to Markdown"
					onClick={onExportChat}
				/>
				<NavActionButton
					icon="more-vertical"
					label="More"
					onClick={onShowMenu}
				/>
				{onFloatChat && placementViewId && (
					<PlacementDragButton
						icon="app-window"
						label="Float this chat. Drag onto a floating chat window."
						origin="sidebar"
						viewId={placementViewId}
						onMove={onFloatChat}
					/>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// Floating Header
// ============================================================================

/**
 * Inline header component for Floating and CodeBlock chat views.
 *
 * Features:
 * - Agent selector
 * - Update notification (if available)
 * - Action buttons with Lucide icons (new chat, history, export, restart)
 * - Minimize and close buttons (floating variant only)
 */
function FloatingHeader({
	agentLabel,
	availableAgents,
	currentAgentId,
	isUpdateAvailable,
	onAgentChange,
	onShowMenu,
	onMinimize,
	onClose,
	hideWindowControls,
	onDockChat,
	placementViewId,
}: FloatingHeaderProps) {
	const { plugin } = useChatContext();

	return (
		<div
			className={`agent-client-inline-header agent-client-inline-header-floating`}
		>
			<div className="agent-client-inline-header-main">
				<AgentSelector
					availableAgents={availableAgents}
					currentAgentId={currentAgentId}
					agentLabel={agentLabel}
					onAgentChange={onAgentChange}
				/>
			</div>
			{isUpdateAvailable && (
				<p className="agent-client-chat-view-header-update">
					Plugin update available!
				</p>
			)}
			<div className="agent-client-inline-header-actions">
				{onDockChat && placementViewId && (
					<PlacementDragButton
						icon="panel-right"
						label="Dock this chat. Drag onto the sidebar or editor."
						origin="floating"
						viewId={placementViewId}
						onMove={onDockChat}
					/>
				)}
				{!hideWindowControls && (
					<>
						<FloatingTransparencyLockButton plugin={plugin} />
						<HeaderButton
							iconName="more-vertical"
							tooltip="More"
							onClick={onShowMenu}
						/>
						{(onMinimize || onClose) && (
							<WindowMinimizeCloseButton
								onMinimize={onMinimize ?? (() => {})}
								onCloseAll={onClose ?? (() => {})}
							/>
						)}
					</>
				)}
			</div>
		</div>
	);
}

// ============================================================================
// Embedded Header
// ============================================================================

/**
 * Inline header component for embedded (code-block) chat views.
 *
 * Mirrors FloatingHeader's layout/agent-dropdown logic, but:
 * - has no minimize/close buttons (not a windowed view)
 * - hides the agent selector when no switchable agents are provided
 *   (i.e. the block pins an agent, or only one agent is available)
 */
function EmbeddedHeader({
	agentLabel,
	availableAgents,
	currentAgentId,
	isUpdateAvailable,
	onAgentChange,
	onShowMenu,
}: EmbeddedHeaderProps) {
	return (
		<div className="agent-client-inline-header agent-client-inline-header-embedded">
			<div className="agent-client-inline-header-main">
				<AgentSelector
					availableAgents={availableAgents}
					currentAgentId={currentAgentId}
					agentLabel={agentLabel}
					onAgentChange={(agentId) => onAgentChange?.(agentId)}
				/>
			</div>
			{isUpdateAvailable && (
				<p className="agent-client-chat-view-header-update">
					Plugin update available!
				</p>
			)}
			<div className="agent-client-inline-header-actions">
				<HeaderButton
					iconName="more-vertical"
					tooltip="More"
					onClick={onShowMenu}
				/>
			</div>
		</div>
	);
}

// ============================================================================
// Exported ChatHeader (Dispatcher)
// ============================================================================

/**
 * ChatHeader component that dispatches to SidebarHeader, FloatingHeader,
 * or EmbeddedHeader based on the `variant` prop.
 */
export function ChatHeader(props: ChatHeaderProps) {
	if (props.variant === "embedded") {
		return <EmbeddedHeader {...props} />;
	}
	if (props.variant === "floating") {
		return <FloatingHeader {...props} />;
	}
	return <SidebarHeader {...props} />;
}
