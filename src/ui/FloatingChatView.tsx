import * as React from "react";
const { useState, useRef, useEffect, useCallback, useMemo } = React;
import { createRoot, type Root } from "react-dom/client";

import type AgentClientPlugin from "../plugin";
import type {
	IChatViewContainer,
	ChatViewType,
	SessionStatus,
} from "../services/view-registry";
import type { ChatInputState } from "../types/chat";

// Context imports
import { ChatContextProvider } from "./ChatContext";

// Component imports
import { ChatPanel, type ChatPanelCallbacks } from "./ChatPanel";
import { HeaderButton } from "./shared/IconButton";

// Service imports
import { VaultService } from "../services/vault-service";

// Hooks imports
import { useSettings } from "../hooks/useSettings";

// ============================================================
// Helpers
// ============================================================

function clampSize(
	width: number,
	height: number,
): { width: number; height: number } {
	return {
		width: Math.min(width, window.innerWidth),
		height: Math.min(height, window.innerHeight),
	};
}

function clampPosition(
	x: number,
	y: number,
	width: number,
	height: number,
): { x: number; y: number } {
	return {
		x: Math.max(0, Math.min(x, window.innerWidth - width)),
		y: Math.max(0, Math.min(y, window.innerHeight - height)),
	};
}

function fitToViewport(
	x: number,
	y: number,
	width: number,
	height: number,
): { position: { x: number; y: number }; size: { width: number; height: number } } {
	const size = clampSize(width, height);
	const position = clampPosition(x, y, size.width, size.height);
	return { position, size };
}

// ============================================================
// FloatingViewContainer Class (standalone multi-window mode)
// ============================================================

/**
 * Wrapper class that implements IChatViewContainer for floating chat views.
 * Manages the React component lifecycle and provides the interface for
 * unified view management via ChatViewRegistry.
 */
export class FloatingViewContainer implements IChatViewContainer {
	readonly viewType: ChatViewType = "floating";
	readonly viewId: string;

	private plugin: AgentClientPlugin;
	private root: Root | null = null;
	private containerEl: HTMLElement;
	private callbacks: ChatPanelCallbacks | null = null;
	private setExpanded: ((expanded: boolean) => void) | null = null;
	private isExpandedState = false;
	private containerRefEl: HTMLElement | null = null;

	constructor(plugin: AgentClientPlugin, instanceId: string) {
		this.plugin = plugin;
		// viewId format: "floating-chat-{instanceId}" to match adapter key
		this.viewId = `floating-chat-${instanceId}`;
		// Main-window document, not activeDocument: creation may run while the
		// Settings window (its own window since Obsidian 1.13) holds focus.
		this.containerEl = plugin.app.workspace.containerEl.doc.body.createDiv({
			cls: "agent-client-floating-view-root",
		});
	}

	/**
	 * Mount the React component and register with the plugin.
	 */
	mount(
		initialExpanded: boolean,
		initialPosition?: { x: number; y: number },
		initialAgentId?: string,
	): void {
		this.root = createRoot(this.containerEl);
		this.root.render(
			<FloatingChatComponent
				plugin={this.plugin}
				viewId={this.viewId}
				initialExpanded={initialExpanded}
				initialPosition={initialPosition}
				initialAgentId={initialAgentId}
				onRegisterCallbacks={(cbs) => {
					this.callbacks = cbs;
				}}
				onRegisterExpanded={(fn) => {
					this.setExpanded = fn;
				}}
				onExpandedChange={(expanded) => {
					this.isExpandedState = expanded;
				}}
				onContainerRef={(el) => {
					this.containerRefEl = el;
				}}
			/>,
		);

		// Register with plugin's view registry
		this.plugin.viewRegistry.register(this);
	}

	/**
	 * Unmount the React component and unregister from the plugin.
	 */
	unmount(): void {
		this.plugin.viewRegistry.unregister(this.viewId);

		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.containerEl.remove();
	}

	// ============================================================
	// IChatViewContainer Implementation
	// ============================================================

	getDisplayName(): string {
		return this.callbacks?.getDisplayName() ?? "Chat";
	}

	getSessionStatus(): SessionStatus {
		return this.callbacks?.getSessionStatus() ?? "disconnected";
	}

	getSessionTitle(): string {
		return this.callbacks?.getSessionTitle() ?? "New session";
	}

	getSessionId(): string | null {
		return this.callbacks?.getSessionId() ?? null;
	}

	closeContainer(): void {
		this.unmount();
	}

	onActivate(): void {
		this.containerEl.classList.add("is-focused");
	}

	onDeactivate(): void {
		this.containerEl.classList.remove("is-focused");
	}

	focus(): void {
		// Expand if collapsed, then focus
		if (!this.isExpandedState) {
			this.isExpandedState = true;
			this.setExpanded?.(true);
		}
		// Focus after next render (expansion may need a frame)
		window.requestAnimationFrame(() => {
			const textarea = this.containerRefEl?.querySelector(
				"textarea.agent-client-chat-input-textarea",
			);
			if (textarea instanceof HTMLTextAreaElement) {
				textarea.focus();
			}
		});
	}

	hasFocus(): boolean {
		return (
			this.isExpandedState &&
			(this.containerRefEl?.contains(activeDocument.activeElement) ?? false)
		);
	}

	isExpanded(): boolean {
		return this.isExpandedState;
	}

	expand(): void {
		if (!this.isExpandedState) {
			this.isExpandedState = true;
			this.setExpanded?.(true);
		}
	}

	collapse(): void {
		if (this.isExpandedState) {
			this.isExpandedState = false;
			this.setExpanded?.(false);
		}
	}

	getInputState(): ChatInputState | null {
		return this.callbacks?.getInputState() ?? null;
	}

	setInputState(state: ChatInputState): void {
		this.callbacks?.setInputState(state);
	}

	canSend(): boolean {
		return this.callbacks?.canSend() ?? false;
	}

	async sendMessage(): Promise<boolean> {
		return (await this.callbacks?.sendMessage()) ?? false;
	}

	async cancelOperation(): Promise<void> {
		await this.callbacks?.cancelOperation();
	}

	getContainerEl(): HTMLElement {
		return this.containerEl;
	}
}

// ============================================================
// FloatingTabContainer + FloatingTabbedShell (tabs mode)
// ============================================================

interface TabPanelSpec {
	viewId: string;
	initialAgentId?: string;
}

interface FloatingTabbedShellApi {
	addTab: (viewId: string, initialAgentId?: string) => void;
	removeTab: (viewId: string) => void;
	activateTab: (viewId: string) => void;
	setExpanded: (expanded: boolean) => void;
	bumpTitles: () => void;
	/** Focus the textarea for a specific tab (defaults to the active tab). */
	focusActiveInput: (viewId?: string) => void;
	getWindowEl: () => HTMLElement | null;
	isExpanded: () => boolean;
}

/**
 * Registry-facing container for one chat tab inside a shared floating shell.
 * Same viewId / viewType contract as FloatingViewContainer so focus cycling
 * and the floating-button instance menu keep working unchanged.
 */
export class FloatingTabContainer implements IChatViewContainer {
	readonly viewType: ChatViewType = "floating";
	readonly viewId: string;

	private shell: FloatingTabbedShell;
	private callbacks: ChatPanelCallbacks | null = null;

	constructor(shell: FloatingTabbedShell, instanceId: string) {
		this.shell = shell;
		this.viewId = `floating-chat-${instanceId}`;
	}

	setCallbacks(callbacks: ChatPanelCallbacks | null): void {
		this.callbacks = callbacks;
	}

	getDisplayName(): string {
		return this.callbacks?.getDisplayName() ?? "Chat";
	}

	getSessionStatus(): SessionStatus {
		return this.callbacks?.getSessionStatus() ?? "disconnected";
	}

	getSessionTitle(): string {
		return this.callbacks?.getSessionTitle() ?? "New session";
	}

	getSessionId(): string | null {
		return this.callbacks?.getSessionId() ?? null;
	}

	closeContainer(): void {
		this.shell.removeTab(this.viewId);
	}

	onActivate(): void {
		this.shell.activateTab(this.viewId);
		this.shell.markFocused(true);
	}

	onDeactivate(): void {
		this.shell.markFocused(false);
	}

	focus(): void {
		this.shell.activateTab(this.viewId);
		this.shell.expand();
		// Registry focus must not depend on textarea focus succeeding — inactive
		// panels are `hidden`, so focusing their input before React paints fails
		// and can leave the previous tab marked focused.
		this.shell.setRegistryFocused(this.viewId);
		this.shell.focusActiveInput(this.viewId);
	}

	hasFocus(): boolean {
		return this.shell.hasFocus(this.viewId);
	}

	isExpanded(): boolean {
		return this.shell.isExpanded();
	}

	expand(): void {
		this.shell.activateTab(this.viewId);
		this.shell.expand();
	}

	collapse(): void {
		this.shell.collapse();
	}

	getInputState(): ChatInputState | null {
		return this.callbacks?.getInputState() ?? null;
	}

	setInputState(state: ChatInputState): void {
		this.callbacks?.setInputState(state);
	}

	canSend(): boolean {
		return this.callbacks?.canSend() ?? false;
	}

	async sendMessage(): Promise<boolean> {
		return (await this.callbacks?.sendMessage()) ?? false;
	}

	async cancelOperation(): Promise<void> {
		await this.callbacks?.cancelOperation();
	}

	getContainerEl(): HTMLElement {
		return this.shell.getContainerEl();
	}
}

/**
 * Owns one floating window DOM root and hosts multiple independent chat tabs.
 */
export class FloatingTabbedShell {
	private plugin: AgentClientPlugin;
	private root: Root | null = null;
	private containerEl: HTMLElement;
	private tabs = new Map<string, FloatingTabContainer>();
	private api: FloatingTabbedShellApi | null = null;
	private pendingTabs: TabPanelSpec[] = [];
	private isExpandedState = false;
	private activeTabId: string | null = null;
	private initialExpanded: boolean;
	private initialPosition?: { x: number; y: number };

	constructor(
		plugin: AgentClientPlugin,
		initialExpanded: boolean,
		initialPosition?: { x: number; y: number },
	) {
		this.plugin = plugin;
		this.initialExpanded = initialExpanded;
		this.initialPosition = initialPosition;
		this.isExpandedState = initialExpanded;
		this.containerEl = plugin.app.workspace.containerEl.doc.body.createDiv({
			cls: "agent-client-floating-view-root",
		});
	}

	mount(): void {
		this.root = createRoot(this.containerEl);
		this.root.render(
			<FloatingTabbedShellComponent
				plugin={this.plugin}
				initialExpanded={this.initialExpanded}
				initialPosition={this.initialPosition}
				getTabContainer={(viewId) => this.tabs.get(viewId) ?? null}
				onCloseTab={(viewId) => this.removeTab(viewId)}
				onOpenNewTab={() => {
					this.plugin.openNewFloatingChat(true);
				}}
				onExpandedChange={(expanded) => {
					this.isExpandedState = expanded;
				}}
				onActiveTabChange={(viewId) => {
					this.activeTabId = viewId;
				}}
				onRegisterApi={(api) => {
					this.api = api;
					for (const pending of this.pendingTabs) {
						api.addTab(pending.viewId, pending.initialAgentId);
					}
					this.pendingTabs = [];
					if (this.activeTabId) {
						api.activateTab(this.activeTabId);
					}
					if (this.isExpandedState) {
						api.setExpanded(true);
					}
				}}
			/>,
		);
	}

	addTab(
		instanceId: string,
		initialExpanded: boolean,
		initialAgentId?: string,
	): FloatingTabContainer {
		const container = new FloatingTabContainer(this, instanceId);
		this.tabs.set(container.viewId, container);
		this.activeTabId = container.viewId;

		const spec: TabPanelSpec = {
			viewId: container.viewId,
			initialAgentId,
		};
		if (this.api) {
			this.api.addTab(spec.viewId, spec.initialAgentId);
			this.api.activateTab(spec.viewId);
		} else {
			this.pendingTabs.push(spec);
		}

		if (initialExpanded) {
			this.expand();
		}

		this.plugin.viewRegistry.register(container);
		this.plugin.viewRegistry.setFocused(container.viewId);
		return container;
	}

	removeTab(viewId: string): void {
		const container = this.tabs.get(viewId);
		if (!container) return;

		this.tabs.delete(viewId);
		this.plugin.viewRegistry.unregister(viewId);
		container.setCallbacks(null);
		this.api?.removeTab(viewId);

		if (this.tabs.size === 0) {
			this.unmount();
			this.plugin.clearFloatingTabbedShell(this);
			return;
		}

		if (this.activeTabId === viewId) {
			const nextId = this.tabs.keys().next().value as string;
			this.activeTabId = nextId;
			this.api?.activateTab(nextId);
			this.plugin.viewRegistry.setFocused(nextId);
		}
	}

	activateTab(viewId: string): void {
		if (!this.tabs.has(viewId)) return;
		this.activeTabId = viewId;
		this.api?.activateTab(viewId);
	}

	expand(): void {
		this.isExpandedState = true;
		this.api?.setExpanded(true);
	}

	collapse(): void {
		this.isExpandedState = false;
		this.api?.setExpanded(false);
	}

	isExpanded(): boolean {
		return this.isExpandedState;
	}

	focusActiveInput(viewId?: string): void {
		const targetId = viewId ?? this.activeTabId ?? undefined;
		// Double rAF: first after activateTab's setState is scheduled, second
		// after React commits (so the target panel is no longer `hidden`).
		window.requestAnimationFrame(() => {
			window.requestAnimationFrame(() => {
				this.api?.focusActiveInput(targetId);
			});
		});
	}

	setRegistryFocused(viewId: string): void {
		this.plugin.viewRegistry.setFocused(viewId);
	}

	markFocused(focused: boolean): void {
		this.containerEl.classList.toggle("is-focused", focused);
	}

	hasFocus(viewId: string): boolean {
		if (!this.isExpandedState || this.activeTabId !== viewId) return false;
		const windowEl = this.api?.getWindowEl() ?? this.containerEl;
		return windowEl.contains(activeDocument.activeElement);
	}

	getContainerEl(): HTMLElement {
		return this.api?.getWindowEl() ?? this.containerEl;
	}

	bumpTitles(): void {
		this.api?.bumpTitles();
	}

	unmount(): void {
		const viewIds = Array.from(this.tabs.keys());
		this.tabs.clear();
		for (const viewId of viewIds) {
			this.plugin.viewRegistry.unregister(viewId);
		}
		if (this.root) {
			this.root.unmount();
			this.root = null;
		}
		this.api = null;
		this.containerEl.remove();
	}

	getTabCount(): number {
		return this.tabs.size;
	}
}

// ============================================================
// FloatingChatComponent (standalone window)
// ============================================================

interface FloatingChatComponentProps {
	plugin: AgentClientPlugin;
	viewId: string;
	initialExpanded?: boolean;
	initialPosition?: { x: number; y: number };
	/** Agent to launch (from an agent button's pin); default agent when omitted. */
	initialAgentId?: string;
	onRegisterCallbacks?: (callbacks: ChatPanelCallbacks) => void;
	onRegisterExpanded?: (setExpanded: (expanded: boolean) => void) => void;
	onExpandedChange?: (expanded: boolean) => void;
	onContainerRef?: (el: HTMLDivElement | null) => void;
}

function FloatingChatComponent({
	plugin,
	viewId,
	initialExpanded = false,
	initialPosition,
	initialAgentId,
	onRegisterCallbacks,
	onRegisterExpanded,
	onExpandedChange,
	onContainerRef,
}: FloatingChatComponentProps) {
	// ============================================================
	// Services (owned by FloatingViewContainer, created here for context)
	// ============================================================
	const acpClient = useMemo(
		() => plugin.getOrCreateAcpClient(viewId),
		[plugin, viewId],
	);

	const vaultService = useMemo(() => new VaultService(plugin), [plugin]);

	// Cleanup VaultService when component unmounts
	useEffect(() => {
		return () => {
			vaultService.destroy();
		};
	}, [vaultService]);

	// ============================================================
	// Context Value
	// ============================================================
	const contextValue = useMemo(
		() => ({
			plugin,
			acpClient,
			vaultService,
			settingsService: plugin.settingsService,
		}),
		[plugin, acpClient, vaultService],
	);

	// ============================================================
	// UI State (View-Specific)
	// ============================================================
	const settings = useSettings(plugin);
	const [isExpanded, setIsExpanded] = useState(initialExpanded);

	// Register setIsExpanded with the class so it can call expand/collapse directly
	useEffect(() => {
		onRegisterExpanded?.(setIsExpanded);
	}, [onRegisterExpanded]);

	const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
	const [size, setSize] = useState(settings.floatingWindowSize);
	const [position, setPosition] = useState(() => {
		if (initialPosition) {
			return clampPosition(
				initialPosition.x,
				initialPosition.y,
				settings.floatingWindowSize.width,
				settings.floatingWindowSize.height,
			);
		}
		if (settings.floatingWindowPosition) {
			return clampPosition(
				settings.floatingWindowPosition.x,
				settings.floatingWindowPosition.y,
				settings.floatingWindowSize.width,
				settings.floatingWindowSize.height,
			);
		}
		return clampPosition(
			window.innerWidth - settings.floatingWindowSize.width - 50,
			window.innerHeight - settings.floatingWindowSize.height - 50,
			settings.floatingWindowSize.width,
			settings.floatingWindowSize.height,
		);
	});
	const [isDragging, setIsDragging] = useState(false);
	const dragOffset = useRef({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);

	// Expose container element for ChatPanel focus tracking
	useEffect(() => {
		setContainerEl(containerRef.current);
	}, []);

	// Notify parent of expanded state changes
	useEffect(() => {
		onExpandedChange?.(isExpanded);
	}, [isExpanded, onExpandedChange]);

	// Keep refs up-to-date for viewport resize handler
	const positionRef = useRef(position);
	const sizeRef = useRef(size);
	useEffect(() => {
		positionRef.current = position;
	}, [position]);
	useEffect(() => {
		sizeRef.current = size;
	}, [size]);

	// Fit to viewport on expand, and re-fit whenever the viewport resizes
	useEffect(() => {
		if (!isExpanded) return;

		const adjust = () => {
			const { position: newPos, size: newSize } = fitToViewport(
				positionRef.current.x,
				positionRef.current.y,
				sizeRef.current.width,
				sizeRef.current.height,
			);
			if (
				newSize.width !== sizeRef.current.width ||
				newSize.height !== sizeRef.current.height
			) {
				setSize(newSize);
			}
			if (
				newPos.x !== positionRef.current.x ||
				newPos.y !== positionRef.current.y
			) {
				setPosition(newPos);
			}
		};

		adjust();
		window.addEventListener("resize", adjust);
		return () => window.removeEventListener("resize", adjust);
	}, [isExpanded]);

	// Notify parent of container ref
	useEffect(() => {
		onContainerRef?.(containerRef.current);
	}, [onContainerRef, isExpanded]); // re-notify when expanded changes (containerRef may change)

	// Handlers for window management
	const handleOpenNewFloatingChat = useCallback(() => {
		// Open new window with 30px offset from current position, clamped to viewport
		// (In tabs mode, openNewFloatingChat adds a tab instead — no offset used.)
		plugin.openNewFloatingChat(
			true,
			clampPosition(
				position.x - 30,
				position.y - 30,
				size.width,
				size.height,
			),
		);
	}, [plugin, position, size.width, size.height]);

	const handleMinimizeWindow = useCallback(() => {
		setIsExpanded(false);
	}, []);

	const handleCloseWindow = useCallback(() => {
		plugin.closeFloatingChat(viewId);
	}, [plugin, viewId]);

	// Sync manual resizing with state
	useEffect(() => {
		if (!isExpanded || !containerRef.current) return;

		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				// Only update if significantly different to avoid loops
				if (
					Math.abs(width - size.width) > 5 ||
					Math.abs(height - size.height) > 5
				) {
					setSize({ width, height });
				}
			}
		});

		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [isExpanded, size.width, size.height]);

	// Save size to settings
	useEffect(() => {
		const saveSize = async () => {
			if (
				size.width !== settings.floatingWindowSize.width ||
				size.height !== settings.floatingWindowSize.height
			) {
				await plugin.saveSettingsAndNotify({
					...plugin.settings,
					floatingWindowSize: size,
				});
			}
		};

		const timer = window.setTimeout(() => {
			void saveSize();
		}, 500);
		return () => window.clearTimeout(timer);
	}, [size, plugin, settings.floatingWindowSize]);

	// Save position to settings
	useEffect(() => {
		const savePosition = async () => {
			if (
				!settings.floatingWindowPosition ||
				position.x !== settings.floatingWindowPosition.x ||
				position.y !== settings.floatingWindowPosition.y
			) {
				await plugin.saveSettingsAndNotify({
					...plugin.settings,
					floatingWindowPosition: position,
				});
			}
		};

		const timer = window.setTimeout(() => {
			void savePosition();
		}, 500);
		return () => window.clearTimeout(timer);
	}, [position, plugin, settings.floatingWindowPosition]);

	// ============================================================
	// Dragging Logic (View-Specific)
	// ============================================================
	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!containerRef.current) return;
			setIsDragging(true);
			dragOffset.current = {
				x: e.clientX - position.x,
				y: e.clientY - position.y,
			};
		},
		[position],
	);

	useEffect(() => {
		const onMouseMove = (e: MouseEvent) => {
			if (!isDragging) return;
			setPosition(
				clampPosition(
					e.clientX - dragOffset.current.x,
					e.clientY - dragOffset.current.y,
					size.width,
					size.height,
				),
			);
		};

		const onMouseUp = () => {
			setIsDragging(false);
		};

		if (isDragging) {
			window.addEventListener("mousemove", onMouseMove);
			window.addEventListener("mouseup", onMouseUp);
		}

		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [isDragging, size.width, size.height]);

	// ============================================================
	// Render
	// ============================================================
	return (
		<div
			ref={containerRef}
			className="agent-client-floating-window"
			style={{
				left: position.x,
				top: position.y,
				width: size.width,
				height: size.height,
				display: isExpanded ? undefined : "none",
			}}
		>
			<ChatContextProvider value={contextValue}>
				<ChatPanel
					variant="floating"
					viewId={viewId}
					initialAgentId={initialAgentId}
					onRegisterCallbacks={onRegisterCallbacks}
					onMinimize={handleMinimizeWindow}
					onClose={handleCloseWindow}
					onOpenNewWindow={handleOpenNewFloatingChat}
					onFloatingHeaderMouseDown={onMouseDown}
					containerEl={containerEl}
				/>
			</ChatContextProvider>
		</div>
	);
}

// ============================================================
// FloatingTabbedShellComponent
// ============================================================

interface FloatingTabbedShellComponentProps {
	plugin: AgentClientPlugin;
	initialExpanded: boolean;
	initialPosition?: { x: number; y: number };
	getTabContainer: (viewId: string) => FloatingTabContainer | null;
	onCloseTab: (viewId: string) => void;
	onOpenNewTab: () => void;
	onExpandedChange: (expanded: boolean) => void;
	onActiveTabChange: (viewId: string | null) => void;
	onRegisterApi: (api: FloatingTabbedShellApi) => void;
}

function FloatingTabPanel({
	plugin,
	viewId,
	initialAgentId,
	isActive,
	onRegisterCallbacks,
	onSessionTitleChanged,
	onRegisterShowMenu,
	onOpenNewTab,
	onFloatingHeaderMouseDown,
}: {
	plugin: AgentClientPlugin;
	viewId: string;
	initialAgentId?: string;
	isActive: boolean;
	onRegisterCallbacks: (callbacks: ChatPanelCallbacks) => void;
	onSessionTitleChanged: () => void;
	onRegisterShowMenu: (
		tabViewId: string,
		showMenu: ((e: React.MouseEvent<HTMLElement>) => void) | null,
	) => void;
	onOpenNewTab: () => void;
	onFloatingHeaderMouseDown: (e: React.MouseEvent) => void;
}) {
	const acpClient = useMemo(
		() => plugin.getOrCreateAcpClient(viewId),
		[plugin, viewId],
	);
	const vaultService = useMemo(() => new VaultService(plugin), [plugin]);
	useEffect(() => {
		return () => {
			vaultService.destroy();
		};
	}, [vaultService]);

	const contextValue = useMemo(
		() => ({
			plugin,
			acpClient,
			vaultService,
			settingsService: plugin.settingsService,
		}),
		[plugin, acpClient, vaultService],
	);

	const panelRef = useRef<HTMLDivElement>(null);
	const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
	useEffect(() => {
		setContainerEl(panelRef.current);
	}, []);

	return (
		<div
			ref={panelRef}
			data-view-id={viewId}
			className={
				isActive
					? "agent-client-floating-tab-panel is-active"
					: "agent-client-floating-tab-panel"
			}
			hidden={!isActive}
		>
			<ChatContextProvider value={contextValue}>
				<ChatPanel
					variant="floating"
					viewId={viewId}
					initialAgentId={initialAgentId}
					onRegisterCallbacks={onRegisterCallbacks}
					onSessionTitleChanged={onSessionTitleChanged}
					floatingWindowControlsInTabBar
					onRegisterShowMenu={(showMenu) => {
						onRegisterShowMenu(viewId, showMenu);
					}}
					onOpenNewWindow={onOpenNewTab}
					onFloatingHeaderMouseDown={onFloatingHeaderMouseDown}
					containerEl={containerEl}
				/>
			</ChatContextProvider>
		</div>
	);
}

function FloatingTabbedShellComponent({
	plugin,
	initialExpanded,
	initialPosition,
	getTabContainer,
	onCloseTab,
	onOpenNewTab,
	onExpandedChange,
	onActiveTabChange,
	onRegisterApi,
}: FloatingTabbedShellComponentProps) {
	const settings = useSettings(plugin);
	const [isExpanded, setIsExpanded] = useState(initialExpanded);
	const [tabs, setTabs] = useState<TabPanelSpec[]>([]);
	const [activeTabId, setActiveTabId] = useState<string | null>(null);
	const [titleVersion, setTitleVersion] = useState(0);
	const [size, setSize] = useState(settings.floatingWindowSize);
	const [position, setPosition] = useState(() => {
		if (initialPosition) {
			return clampPosition(
				initialPosition.x,
				initialPosition.y,
				settings.floatingWindowSize.width,
				settings.floatingWindowSize.height,
			);
		}
		if (settings.floatingWindowPosition) {
			return clampPosition(
				settings.floatingWindowPosition.x,
				settings.floatingWindowPosition.y,
				settings.floatingWindowSize.width,
				settings.floatingWindowSize.height,
			);
		}
		return clampPosition(
			window.innerWidth - settings.floatingWindowSize.width - 50,
			window.innerHeight - settings.floatingWindowSize.height - 50,
			settings.floatingWindowSize.width,
			settings.floatingWindowSize.height,
		);
	});
	const [isDragging, setIsDragging] = useState(false);
	const dragOffset = useRef({ x: 0, y: 0 });
	const containerRef = useRef<HTMLDivElement>(null);
	const activeTabIdRef = useRef<string | null>(null);
	const isExpandedRef = useRef(isExpanded);
	const showMenuByTabRef = useRef(
		new Map<string, (e: React.MouseEvent<HTMLElement>) => void>(),
	);

	const registerTabShowMenu = useCallback(
		(
			tabViewId: string,
			showMenu: ((e: React.MouseEvent<HTMLElement>) => void) | null,
		) => {
			if (showMenu) {
				showMenuByTabRef.current.set(tabViewId, showMenu);
			} else {
				showMenuByTabRef.current.delete(tabViewId);
			}
		},
		[],
	);

	const handleTabBarShowMenu = useCallback(
		(e: React.MouseEvent<HTMLButtonElement>) => {
			e.stopPropagation();
			const tabId = activeTabIdRef.current;
			if (!tabId) return;
			showMenuByTabRef.current.get(tabId)?.(e);
		},
		[],
	);

	useEffect(() => {
		activeTabIdRef.current = activeTabId;
		onActiveTabChange(activeTabId);
	}, [activeTabId, onActiveTabChange]);

	useEffect(() => {
		isExpandedRef.current = isExpanded;
		onExpandedChange(isExpanded);
	}, [isExpanded, onExpandedChange]);

	const positionRef = useRef(position);
	const sizeRef = useRef(size);
	useEffect(() => {
		positionRef.current = position;
	}, [position]);
	useEffect(() => {
		sizeRef.current = size;
	}, [size]);

	useEffect(() => {
		if (!isExpanded) return;
		const adjust = () => {
			const { position: newPos, size: newSize } = fitToViewport(
				positionRef.current.x,
				positionRef.current.y,
				sizeRef.current.width,
				sizeRef.current.height,
			);
			if (
				newSize.width !== sizeRef.current.width ||
				newSize.height !== sizeRef.current.height
			) {
				setSize(newSize);
			}
			if (
				newPos.x !== positionRef.current.x ||
				newPos.y !== positionRef.current.y
			) {
				setPosition(newPos);
			}
		};
		adjust();
		window.addEventListener("resize", adjust);
		return () => window.removeEventListener("resize", adjust);
	}, [isExpanded]);

	useEffect(() => {
		if (!isExpanded || !containerRef.current) return;
		const observer = new ResizeObserver((entries) => {
			for (const entry of entries) {
				const { width, height } = entry.contentRect;
				if (
					Math.abs(width - size.width) > 5 ||
					Math.abs(height - size.height) > 5
				) {
					setSize({ width, height });
				}
			}
		});
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [isExpanded, size.width, size.height]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (
				size.width !== settings.floatingWindowSize.width ||
				size.height !== settings.floatingWindowSize.height
			) {
				void plugin.saveSettingsAndNotify({
					...plugin.settings,
					floatingWindowSize: size,
				});
			}
		}, 500);
		return () => window.clearTimeout(timer);
	}, [size, plugin, settings.floatingWindowSize]);

	useEffect(() => {
		const timer = window.setTimeout(() => {
			if (
				!settings.floatingWindowPosition ||
				position.x !== settings.floatingWindowPosition.x ||
				position.y !== settings.floatingWindowPosition.y
			) {
				void plugin.saveSettingsAndNotify({
					...plugin.settings,
					floatingWindowPosition: position,
				});
			}
		}, 500);
		return () => window.clearTimeout(timer);
	}, [position, plugin, settings.floatingWindowPosition]);

	const onMouseDown = useCallback(
		(e: React.MouseEvent) => {
			if (!containerRef.current) return;
			// Don't start a drag from interactive tab controls.
			const target = e.target as HTMLElement | null;
			if (
				target?.closest(
					".agent-client-floating-tab, .agent-client-floating-tab-add, .agent-client-floating-tab-bar-actions, .agent-client-floating-tab-bar-actions button",
				)
			) {
				return;
			}
			setIsDragging(true);
			dragOffset.current = {
				x: e.clientX - position.x,
				y: e.clientY - position.y,
			};
		},
		[position],
	);

	useEffect(() => {
		if (!isDragging) return;
		const onMouseMove = (e: MouseEvent) => {
			setPosition(
				clampPosition(
					e.clientX - dragOffset.current.x,
					e.clientY - dragOffset.current.y,
					size.width,
					size.height,
				),
			);
		};
		const onMouseUp = () => setIsDragging(false);
		window.addEventListener("mousemove", onMouseMove);
		window.addEventListener("mouseup", onMouseUp);
		return () => {
			window.removeEventListener("mousemove", onMouseMove);
			window.removeEventListener("mouseup", onMouseUp);
		};
	}, [isDragging, size.width, size.height]);

	useEffect(() => {
		const api: FloatingTabbedShellApi = {
			addTab: (viewId, initialAgentId) => {
				setTabs((prev) => {
					if (prev.some((t) => t.viewId === viewId)) return prev;
					return [...prev, { viewId, initialAgentId }];
				});
				activeTabIdRef.current = viewId;
				setActiveTabId(viewId);
			},
			removeTab: (viewId) => {
				setTabs((prev) => {
					const next = prev.filter((t) => t.viewId !== viewId);
					setActiveTabId((current) => {
						if (current !== viewId) return current;
						const nextId =
							next.length > 0 ? next[next.length - 1].viewId : null;
						activeTabIdRef.current = nextId;
						return nextId;
					});
					return next;
				});
			},
			activateTab: (viewId) => {
				activeTabIdRef.current = viewId;
				setActiveTabId(viewId);
			},
			setExpanded: setIsExpanded,
			bumpTitles: () => setTitleVersion((v) => v + 1),
			focusActiveInput: (viewId) => {
				const root = containerRef.current;
				if (!root) return;
				const targetId = viewId ?? activeTabIdRef.current;
				const panel = targetId
					? root.querySelector(
							`.agent-client-floating-tab-panel[data-view-id="${CSS.escape(targetId)}"]`,
						)
					: root.querySelector(
							".agent-client-floating-tab-panel.is-active",
						);
				const textarea = panel?.querySelector(
					"textarea.agent-client-chat-input-textarea",
				);
				if (textarea instanceof HTMLTextAreaElement) {
					textarea.focus();
				}
			},
			getWindowEl: () => containerRef.current,
			isExpanded: () => isExpandedRef.current,
		};
		onRegisterApi(api);
	}, [onRegisterApi]);

	const handleSelectTab = useCallback(
		(viewId: string) => {
			activeTabIdRef.current = viewId;
			setActiveTabId(viewId);
			plugin.viewRegistry.setFocused(viewId);
			window.requestAnimationFrame(() => {
				window.requestAnimationFrame(() => {
					const root = containerRef.current;
					const panel = root?.querySelector(
						`.agent-client-floating-tab-panel[data-view-id="${CSS.escape(viewId)}"]`,
					);
					const textarea = panel?.querySelector(
						"textarea.agent-client-chat-input-textarea",
					);
					if (textarea instanceof HTMLTextAreaElement) {
						textarea.focus();
					}
				});
			});
		},
		[plugin],
	);

	const handleMinimize = useCallback(() => {
		setIsExpanded(false);
	}, []);

	// titleVersion forces label refresh when session titles change
	void titleVersion;

	return (
		<div
			ref={containerRef}
			className="agent-client-floating-window agent-client-floating-window-tabbed"
			style={{
				left: position.x,
				top: position.y,
				width: size.width,
				height: size.height,
				display: isExpanded ? undefined : "none",
			}}
		>
			<div
				className="agent-client-floating-tab-bar"
				onMouseDown={onMouseDown}
			>
				<div className="agent-client-floating-tab-list">
					{tabs.map((tab) => {
						const container = getTabContainer(tab.viewId);
						const label =
							container?.getSessionTitle() ??
							container?.getDisplayName() ??
							"Chat";
						const isActive = tab.viewId === activeTabId;
						return (
							<div
								key={tab.viewId}
								className={
									isActive
										? "agent-client-floating-tab is-active"
										: "agent-client-floating-tab"
								}
								onClick={() => handleSelectTab(tab.viewId)}
								title={label}
							>
								<span className="agent-client-floating-tab-label">
									{label}
								</span>
								<button
									type="button"
									className="agent-client-floating-tab-close"
									title="Close tab"
									onClick={(e) => {
										e.stopPropagation();
										onCloseTab(tab.viewId);
									}}
								>
									×
								</button>
							</div>
						);
					})}
				</div>
				<HeaderButton
					iconName="plus"
					tooltip="Open new tab"
					className="agent-client-floating-tab-add"
					onClick={(e) => {
						e.stopPropagation();
						onOpenNewTab();
					}}
				/>
				<div className="agent-client-floating-tab-bar-actions">
					<HeaderButton
						iconName="more-vertical"
						tooltip="More"
						className="agent-client-floating-tab-bar-action"
						onClick={handleTabBarShowMenu}
					/>
					<HeaderButton
						iconName="minimize-2"
						tooltip="Minimize"
						className="agent-client-floating-tab-bar-action"
						onClick={(e) => {
							e.stopPropagation();
							handleMinimize();
						}}
					/>
					<HeaderButton
						iconName="x"
						tooltip="Close session"
						className="agent-client-floating-tab-bar-action agent-client-floating-close-session"
						onClick={(e) => {
							e.stopPropagation();
							if (activeTabId) onCloseTab(activeTabId);
						}}
					/>
				</div>
			</div>
			<div className="agent-client-floating-tab-panels">
				{tabs.map((tab) => (
					<FloatingTabPanel
						key={tab.viewId}
						plugin={plugin}
						viewId={tab.viewId}
						initialAgentId={tab.initialAgentId}
						isActive={tab.viewId === activeTabId}
						onRegisterCallbacks={(cbs) => {
							getTabContainer(tab.viewId)?.setCallbacks(cbs);
						}}
						onSessionTitleChanged={() =>
							setTitleVersion((v) => v + 1)
						}
						onRegisterShowMenu={registerTabShowMenu}
						onOpenNewTab={onOpenNewTab}
						onFloatingHeaderMouseDown={onMouseDown}
					/>
				))}
			</div>
		</div>
	);
}

// ============================================================
// Factory helpers
// ============================================================

/**
 * Create a new standalone floating chat view (multi-window mode).
 */
export function createFloatingChat(
	plugin: AgentClientPlugin,
	instanceId: string,
	initialExpanded = false,
	initialPosition?: { x: number; y: number },
	initialAgentId?: string,
): FloatingViewContainer {
	const container = new FloatingViewContainer(plugin, instanceId);
	container.mount(initialExpanded, initialPosition, initialAgentId);
	return container;
}

/**
 * Create a tabbed floating shell and its first tab.
 */
export function createFloatingTabbedShell(
	plugin: AgentClientPlugin,
	instanceId: string,
	initialExpanded = false,
	initialPosition?: { x: number; y: number },
	initialAgentId?: string,
): { shell: FloatingTabbedShell; tab: FloatingTabContainer } {
	const shell = new FloatingTabbedShell(
		plugin,
		initialExpanded,
		initialPosition,
	);
	shell.mount();
	const tab = shell.addTab(instanceId, initialExpanded, initialAgentId);
	return { shell, tab };
}
