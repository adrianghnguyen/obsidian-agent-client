import * as React from "react";
const { useRef, useState, useEffect, useCallback, useMemo } = React;

import type { ChatMessage } from "../types/chat";
import type { ToolCallFailureAnalysis, TraceVerbosity } from "../types/settings";
import type { AcpClient } from "../acp/acp-client";
import type AgentClientPlugin from "../plugin";
import type { IChatViewHost } from "./view-host";
import { setIcon } from "obsidian";
import { buildDisplayListItems } from "../services/trace-turn";
import { MessageBubble } from "./MessageBubble";
import { TurnTraceRenderer } from "./TurnTraceRenderer";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
	ANTIGRAVITY_CONNECTING_COPY,
	ANTIGRAVITY_PRESET_ID,
} from "../harnesses/antigravity";

// How long (ms) after a tab is re-shown we refuse to shrink measured item
// sizes. Right after re-show the items briefly re-measure small while their
// markdown re-lays-out; recording those shrinks collapses the virtualizer's
// total size, which clamps scrollTop to 0 and loses the position. Riding out
// this window keeps total stable so the scroll position is preserved. (#321)
const SHOW_SETTLE_MS = 500;

// Pixels of slack when deciding whether the top of the latest item is still
// on screen. A top within this distance of the viewport edge counts as visible.
const JUMP_TOP_TOLERANCE = 4;

/**
 * Props for MessageList component
 */
export interface MessageListProps {
	/** All messages in the current chat session */
	messages: ChatMessage[];
	/** Whether a message is currently being sent */
	isSending: boolean;
	/** Whether the session is ready for user input */
	isSessionReady: boolean;
	/** Whether a session is being restored (load/resume/fork) */
	isRestoringSession: boolean;
	/** Display name of the active agent */
	agentLabel: string;
	/** Active agent id (Antigravity uses a slower first-connect message). */
	agentId?: string;
	/** Plugin instance */
	plugin: AgentClientPlugin;
	/** View instance for event registration */
	view: IChatViewHost;
	/** Terminal client for output polling */
	terminalClient?: AcpClient;
	/** Active ACP session id (Cursor plan file resolution) */
	sessionId?: string | null;
	traceVerbosity: TraceVerbosity;
	toolCallFailureAnalysis: ToolCallFailureAnalysis;
	/** Callback to approve a permission request */
	onApprovePermission?: (
		requestId: string,
		optionId: string,
	) => Promise<void>;
	/** Whether a permission request is currently pending */
	hasActivePermission: boolean;
}

/**
 * Messages container component with virtualized rendering.
 *
 * Uses @tanstack/react-virtual to only render messages visible in the viewport,
 * dramatically improving performance for long conversations.
 *
 * Handles:
 * - Virtualized message list rendering
 * - Auto-scroll behavior (follows new content when at bottom)
 * - Empty state display
 * - Loading indicator
 */
export function MessageList({
	messages,
	isSending,
	isSessionReady,
	isRestoringSession,
	agentLabel,
	agentId,
	plugin,
	view,
	terminalClient,
	sessionId,
	traceVerbosity,
	toolCallFailureAnalysis,
	onApprovePermission,
	hasActivePermission,
}: MessageListProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isAtBottom, setIsAtBottom] = useState(true);
	const isAtBottomRef = useRef(true);
	// Whether the top of the latest item is scrolled off-screen. Drives the
	// front-and-center "jump to top of message" button — shown for any long
	// latest message, streaming or not.
	const [showJumpToTop, setShowJumpToTop] = useState(false);
	const showJumpToTopRef = useRef(false);
	const prevIsSendingRef = useRef(false);
	// Last measured height per message id. Used to keep the virtualizer's total
	// size stable while the tab is hidden (display:none) so scrollTop isn't
	// clamped to 0 and the position survives a tab switch. (#321)
	const sizeCacheRef = useRef<Map<string, number>>(new Map());
	// Whether the view was last seen hidden (display:none), and the end of the
	// post-show "settle" window during which we refuse to shrink the size cache
	// (see SHOW_SETTLE_MS). Together these suppress the transient total-size
	// collapse that would otherwise clamp scrollTop to 0 on re-show. (#321)
	const wasHiddenRef = useRef(false);
	const settleUntilRef = useRef(0);

	const displayItems = useMemo(
		() => buildDisplayListItems(messages, traceVerbosity),
		[messages, traceVerbosity],
	);

	// ============================================================
	// Virtualizer
	// ============================================================
	const virtualizer = useVirtualizer({
		count: displayItems.length,
		getScrollElement: () => containerRef.current,
		estimateSize: () => 80,
		overscan: 5,
		getItemKey: (index) => displayItems[index]?.key ?? String(index),
		measureElement: (element) => {
			const el = element as HTMLElement;
			const id = el.getAttribute("data-msg-id");
			const cached = id ? sizeCacheRef.current.get(id) : undefined;
			// Hidden (display:none): the item is detached from layout
			// (offsetParent === null) and would measure 0. Remember we were
			// hidden and return the last known size so the total size doesn't
			// collapse on the hidden side. (#321)
			if (el.offsetParent === null) {
				wasHiddenRef.current = true;
				return cached || 80;
			}
			// First measure after re-show: open the settle window. Opening it
			// here (rather than from a separate observer) makes this very call
			// guarded too, regardless of observer firing order. (#321)
			if (wasHiddenRef.current) {
				wasHiddenRef.current = false;
				settleUntilRef.current = performance.now() + SHOW_SETTLE_MS;
			}
			const measured = el.getBoundingClientRect().height;
			// Inside the settle window, never shrink: return the larger of the
			// fresh and cached heights and don't record it, so getTotalSize()
			// stays stable and scrollTop isn't clamped to 0 on re-show. Genuine
			// shrinks are accepted again once the window expires. (#321)
			if (
				cached !== undefined &&
				performance.now() < settleUntilRef.current
			) {
				return Math.max(measured, cached);
			}
			if (id && measured > 0) sizeCacheRef.current.set(id, measured);
			return measured || cached || 80;
		},
	});

	// Suppress scroll position correction when user has scrolled up.
	// By default, the virtualizer adjusts scrollTop when an item before
	// the scroll offset changes size (to keep visible content stable).
	// During streaming, this causes the viewport to creep down as the
	// last message grows. Our auto-scroll effect handles following new
	// content when isAtBottom, so corrections are only needed there.
	virtualizer.shouldAdjustScrollPositionOnItemSizeChange = () =>
		isAtBottomRef.current;

	// ============================================================
	// Scroll management
	// ============================================================

	/**
	 * Check if the scroll position is near the bottom.
	 */
	const checkIfAtBottom = useCallback(() => {
		const container = containerRef.current;
		if (!container) return true;

		const threshold = 35;
		const isNearBottom =
			container.scrollTop + container.clientHeight >=
			container.scrollHeight - threshold;
		isAtBottomRef.current = isNearBottom;
		setIsAtBottom(isNearBottom);
		return isNearBottom;
	}, []);

	/**
	 * Whether the top of the latest (last) rendered item has scrolled above
	 * the viewport. Drives the front-and-center "jump to top of message"
	 * button — shown for any long latest message, streaming or not.
	 */
	const isLatestTopOffscreen = useCallback((): boolean => {
		const container = containerRef.current;
		if (!container) return false;
		const inner = container.querySelector<HTMLElement>(
			".agent-client-virtual-list-inner",
		);
		const items = inner?.querySelectorAll<HTMLElement>(
			".agent-client-virtual-item",
		);
		const lastItem = items?.[items.length - 1];
		if (!lastItem || items.length === 0) return false;
		const containerTop = container.getBoundingClientRect().top;
		const itemTop = lastItem.getBoundingClientRect().top;
		return itemTop < containerTop - JUMP_TOP_TOLERANCE;
	}, []);

	const updateJumpToTop = useCallback(() => {
		const next = isLatestTopOffscreen();
		if (next !== showJumpToTopRef.current) {
			showJumpToTopRef.current = next;
			setShowJumpToTop(next);
		}
	}, [isLatestTopOffscreen]);

	/**
	 * Instant scroll of the scroller to the top of the latest item. Assigning
	 * scrollTop avoids Electron's no-op smooth scroll on this virtualized
	 * overflow container (same approach as JumpToTopButton).
	 */
	const jumpToLatestTop = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;
		const inner = container.querySelector<HTMLElement>(
			".agent-client-virtual-list-inner",
		);
		const items = inner?.querySelectorAll<HTMLElement>(
			".agent-client-virtual-item",
		);
		const lastItem = items?.[items.length - 1];
		if (lastItem) {
			const delta =
				lastItem.getBoundingClientRect().top -
				container.getBoundingClientRect().top;
			container.scrollTop = container.scrollTop + delta;
		}
	}, []);

	// Reset scroll state and drop the per-message size cache when messages are
	// cleared (new chat / restore / fork / restart all funnel through an empty
	// array first). Prevents stale msgId→height entries from accumulating
	// across sessions in this long-lived view. (#321)
	useEffect(() => {
		if (displayItems.length === 0) {
			setIsAtBottom(true);
			isAtBottomRef.current = true;
			sizeCacheRef.current.clear();
		}
	}, [displayItems.length]);

	// Track when user just sent a message (for smooth scroll)
	const scrollSmoothRef = useRef(false);
	useEffect(() => {
		if (isSending && !prevIsSendingRef.current) {
			// User just sent a message — next scroll should be smooth
			scrollSmoothRef.current = true;
		}
		prevIsSendingRef.current = isSending;
	}, [isSending]);

	// Auto-scroll to bottom when new messages arrive or content changes
	useEffect(() => {
		if (displayItems.length === 0) return;

		if (scrollSmoothRef.current) {
			// User sent a message — smooth scroll regardless of isAtBottom
			scrollSmoothRef.current = false;
			window.requestAnimationFrame(() => {
				virtualizer.scrollToIndex(displayItems.length - 1, {
					align: "end",
					behavior: "smooth",
				});
			});
			return;
		}

		if (isAtBottomRef.current) {
			// Use requestAnimationFrame to ensure virtualizer has measured
			window.requestAnimationFrame(() => {
				virtualizer.scrollToIndex(displayItems.length - 1, {
					align: "end",
				});
			});
		}
	}, [displayItems, virtualizer]);

	// Latest scroll handler without re-registering the listener on each
	// isSending/streaming change (sidebar registerDomEvent has no per-effect
	// cleanup, so re-running the effect would stack listeners).
	const updateJumpToTopRef = useRef(updateJumpToTop);
	updateJumpToTopRef.current = updateJumpToTop;

	// Set up scroll event listener for isAtBottom detection
	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleScroll = () => {
			checkIfAtBottom();
			updateJumpToTopRef.current();
		};

		view.registerDomEvent(container, "scroll", handleScroll);

		// Initial check
		checkIfAtBottom();
		updateJumpToTopRef.current();
	}, [view, checkIfAtBottom]);

	// Re-evaluate the jump-to-top button as streaming starts/stops and as new
	// content changes the latest item's top position.
	useEffect(() => {
		updateJumpToTop();
	}, [isSending, displayItems, updateJumpToTop]);

	// ============================================================
	// Render
	// ============================================================

	// Empty state
	if (displayItems.length === 0) {
		return (
			<div className="agent-client-messages-shell">
				<div ref={containerRef} className="agent-client-chat-view-messages">
					<div className="agent-client-chat-empty-state">
						{isRestoringSession
							? "Restoring session..."
							: !isSessionReady
								? agentId === ANTIGRAVITY_PRESET_ID
									? ANTIGRAVITY_CONNECTING_COPY
									: `Connecting to ${agentLabel}...`
								: `Start a conversation with ${agentLabel}...`}
					</div>
				</div>
			</div>
		);
	}

	const virtualItems = virtualizer.getVirtualItems();

	return (
		<div className="agent-client-messages-shell">
			<div ref={containerRef} className="agent-client-chat-view-messages">
				{/* Virtualized message list */}
				<div
					className="agent-client-virtual-list-inner"
					style={{
						height: virtualizer.getTotalSize(),
						position: "relative",
					}}
				>
					{virtualItems.map((virtualItem) => {
						const displayItem = displayItems[virtualItem.index];
						return (
							<div
								key={displayItem.key}
								ref={virtualizer.measureElement}
								data-index={virtualItem.index}
								data-msg-id={displayItem.key}
								className="agent-client-virtual-item"
								style={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${virtualItem.start}px)`,
								}}
							>
								{displayItem.type === "turn" ? (
									<TurnTraceRenderer
										segment={displayItem.segment}
										messages={messages}
										plugin={plugin}
										terminalClient={terminalClient}
										sessionId={sessionId}
										traceVerbosity={traceVerbosity}
										toolCallFailureAnalysis={toolCallFailureAnalysis}
										onApprovePermission={onApprovePermission}
									/>
								) : (
									<MessageBubble
										message={displayItem.message}
										plugin={plugin}
										terminalClient={terminalClient}
										sessionId={sessionId}
										traceVerbosity={traceVerbosity}
										toolCallFailureAnalysis={toolCallFailureAnalysis}
										onApprovePermission={onApprovePermission}
									/>
								)}
							</div>
						);
					})}
				</div>

				{/* Loading indicator — outside virtualizer */}
				<div
					className={`agent-client-loading-indicator ${!isSending ? "agent-client-hidden" : ""}`}
				>
					<div className="agent-client-loading-dots">
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
						<div className="agent-client-loading-dot"></div>
					</div>
					{hasActivePermission && (
						<span className="agent-client-loading-status">
							Waiting for permission...
						</span>
					)}
				</div>
			</div>

			{/* Jump to top of the latest message — front and center at the
			    bottom, shown whenever that message's top is off-screen. Same
			    action as the per-message jump button beside copy. Fades once
			    the user has scrolled away from the bottom. */}
			{showJumpToTop && (
				<button
					type="button"
					className={`agent-client-scroll-to-top${!isAtBottom ? " agent-client-scroll-to-top-dimmed" : ""}`}
					aria-label="Jump to top of latest message"
					title="Jump to top of latest message"
					onClick={jumpToLatestTop}
				>
					<span
						className="agent-client-scroll-to-top-icon"
						ref={(el) => {
							if (el) setIcon(el, "arrow-up-to-line");
						}}
					/>
					<span className="agent-client-scroll-to-top-label">
						Jump to top
					</span>
				</button>
			)}

			{/* Scroll to bottom — pinned to bottom of scrollbar track */}
			{!isAtBottom && (
				<button
					type="button"
					className="agent-client-scroll-to-bottom"
					aria-label="Scroll to bottom"
					title="Scroll to bottom"
					onClick={() => {
						virtualizer.scrollToIndex(displayItems.length - 1, {
							align: "end",
							behavior: "smooth",
						});
					}}
					ref={(el) => {
						if (el) setIcon(el, "chevron-down");
					}}
				/>
			)}
		</div>
	);
}
