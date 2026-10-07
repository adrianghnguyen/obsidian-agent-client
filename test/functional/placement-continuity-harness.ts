/**
 * Wires the real AcpClientPool and ChatViewRegistry the way a dock/float
 * move has to: reuse the view id when the ACP client is already up, copy
 * the composer when it is not, and refuse the move while connecting.
 *
 * ChatPlacementHost is optional on this branch. moveWithHarness applies
 * the outcomes against the real pool and registry on main. The host suite
 * is enabled when placement ships in #65 after rebase (that PR adds the
 * module). This file does not depend on #65 landing first.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { vi } from "vitest";
import type {
	AttachedFile,
	ChatInputState,
	ChatMessage,
} from "../../src/types/chat";
import type { ChatSession, SessionState } from "../../src/types/session";
import {
	AcpClientPool,
	type AcpClientLike,
} from "../../src/services/acp-client-pool";
import type { QueuedComposerSend } from "../../src/services/composer-send-queue";
import {
	ChatViewRegistry,
	type ChatViewType,
	type IChatViewContainer,
} from "../../src/services/view-registry";

export const CONNECTING_NOTICE =
	"[Agent Client] Wait for this chat to finish connecting before moving it.";
export const FLOATING_DISABLED_NOTICE =
	"[Agent Client] Floating chat is disabled in settings.";
export const MOVE_FAILED_NOTICE = "[Agent Client] Couldn't move this chat.";

export type PlacementOpenTarget = "left" | "right" | "editor" | "default";

export type PlacementKind = "dock" | "float";

/** Snapshot fields the move reads. Matches ChatPlacementSnapshot when present. */
export interface PlacementSnapshot {
	sourceViewId: string;
	reuseClient: boolean;
	agentId: string;
	cwd: string;
	session: ChatSession;
	messages: ChatMessage[];
	isSending: boolean;
	input: ChatInputState | null;
	queuedSends: QueuedComposerSend[];
	blockedReason: string | null;
}

export interface TrackedClient extends AcpClientLike {
	token: number;
	initialized: boolean;
	inflight: Promise<void> | null;
}

export interface PlacementDriver {
	dock(viewId: string, target?: PlacementOpenTarget): Promise<boolean>;
	float(viewId: string): Promise<boolean>;
}

export interface OpenSpec {
	viewId: string;
	viewType: Extract<ChatViewType, "sidebar" | "floating">;
	sessionState: SessionState;
	initialized: boolean;
	sessionId: string | null;
	inputText: string;
	files?: AttachedFile[];
	queued?: QueuedComposerSend[];
	isSending?: boolean;
	messageText?: string;
	cwd?: string;
	agentId?: string;
}

interface ViewModel {
	view: IChatViewContainer;
	viewId: string;
	viewType: Extract<ChatViewType, "sidebar" | "floating">;
	client: TrackedClient;
	sessionState: SessionState;
	sessionId: string | null;
	agentId: string;
	cwd: string;
	input: ChatInputState;
	queuedSends: QueuedComposerSend[];
	messages: ChatMessage[];
	isSending: boolean;
	retainClient: boolean;
}

interface OpenRecord {
	kind: PlacementKind;
	target: PlacementOpenTarget;
}

export interface ContinuityWorld {
	pool: AcpClientPool<TrackedClient>;
	registry: ChatViewRegistry;
	notices: string[];
	floatingEnabled: boolean;
	failNextOpen: boolean;
	lastDestination: IChatViewContainer | null;
	lastOpen: OpenRecord | null;
	pending: Promise<void>[];
	byView: Map<IChatViewContainer, ViewModel>;
	allocate(kind: OpenSpec["viewType"]): string;
}

interface HostPorts {
	getView(viewId: string): {
		readonly viewId: string;
		readonly viewType: ChatViewType;
		preparePlacementMove?: () => PlacementSnapshot | null;
		closeContainer(): void;
	} | null;
	isFloatingEnabled(): boolean;
	notice(message: string): void;
	openSidebar(
		snapshot: PlacementSnapshot,
		target: PlacementOpenTarget,
	): Promise<void>;
	openFloating(snapshot: PlacementSnapshot): void;
}

export interface ProductionHostModule {
	Host: new (ports: HostPorts) => {
		dock(viewId: string, target?: PlacementOpenTarget): Promise<boolean>;
		float(viewId: string): Promise<boolean>;
	};
	reset(): void;
}

export async function loadProductionHost(): Promise<ProductionHostModule | null> {
	const hostFile = join(process.cwd(), "src/services/chat-placement-host.ts");
	const placementFile = join(process.cwd(), "src/services/chat-placement.ts");
	if (!existsSync(hostFile) || !existsSync(placementFile)) return null;

	const hostMod = (await import(pathToFileURL(hostFile).href)) as {
		ChatPlacementHost?: unknown;
	};
	const placementMod = (await import(pathToFileURL(placementFile).href)) as {
		resetPlacementStateForTests?: unknown;
	};
	if (typeof hostMod.ChatPlacementHost !== "function") {
		throw new Error("chat-placement-host.ts is missing ChatPlacementHost");
	}
	if (typeof placementMod.resetPlacementStateForTests !== "function") {
		throw new Error(
			"chat-placement.ts is missing resetPlacementStateForTests",
		);
	}
	return {
		Host: hostMod.ChatPlacementHost as ProductionHostModule["Host"],
		reset: placementMod.resetPlacementStateForTests as () => void,
	};
}

export function createWorld(): ContinuityWorld {
	let nextToken = 0;
	let nextId = 0;
	const world: ContinuityWorld = {
		pool: new AcpClientPool<TrackedClient>({
			create: () => {
				nextToken += 1;
				const token = nextToken;
				return {
					token,
					initialized: false,
					inflight: null,
					updateAutoAllow: vi.fn(),
					disconnect: vi.fn(async () => {}),
				};
			},
			setTimeoutFn: (fn, ms) => setTimeout(fn, ms) as unknown as number,
			clearTimeoutFn: (id) =>
				clearTimeout(id as unknown as ReturnType<typeof setTimeout>),
		}),
		registry: new ChatViewRegistry(),
		notices: [],
		floatingEnabled: true,
		failNextOpen: false,
		lastDestination: null,
		lastOpen: null,
		pending: [],
		byView: new Map(),
		allocate(kind) {
			nextId += 1;
			return kind === "sidebar"
				? `leaf-adopt-${nextId}`
				: `floating-adopt-${nextId}`;
		},
	};
	return world;
}

export function openChat(
	world: ContinuityWorld,
	spec: OpenSpec,
): { view: IChatViewContainer; model: ViewModel } {
	const client = world.pool.getOrCreate(spec.viewId);
	client.initialized = spec.initialized;
	const messages: ChatMessage[] = spec.messageText
		? [
				{
					id: `${spec.viewId}-m1`,
					role: "user",
					content: [{ type: "text", text: spec.messageText }],
					timestamp: new Date("2026-01-02T00:00:00Z"),
				},
			]
		: [];
	const model: ViewModel = {
		view: undefined as unknown as IChatViewContainer,
		viewId: spec.viewId,
		viewType: spec.viewType,
		client,
		sessionState: spec.sessionState,
		sessionId: spec.sessionId,
		agentId: spec.agentId ?? "cursor",
		cwd: spec.cwd ?? "/vault",
		input: {
			text: spec.inputText,
			files: (spec.files ?? []).map((file) => ({ ...file })),
		},
		queuedSends: (spec.queued ?? []).map((item) => ({
			...item,
			files: item.files.map((file) => ({ ...file })),
		})),
		messages,
		isSending: spec.isSending ?? false,
		retainClient: false,
	};
	const view = createContainer(world, model);
	model.view = view;
	world.byView.set(view, model);
	world.registry.register(view);
	return { view, model };
}

export function modelFor(
	world: ContinuityWorld,
	view: IChatViewContainer,
): ViewModel {
	const model = world.byView.get(view);
	if (!model) throw new Error(`No model for view ${view.viewId}`);
	return model;
}

export function destination(world: ContinuityWorld): ViewModel {
	if (!world.lastDestination)
		throw new Error("Move did not open a destination");
	return modelFor(world, world.lastDestination);
}

export function bindHarness(world: ContinuityWorld): PlacementDriver {
	return {
		dock: (viewId, target = "default") =>
			moveWithHarness(world, viewId, "dock", target),
		float: (viewId) => moveWithHarness(world, viewId, "float", "default"),
	};
}

export function bindProductionHost(
	world: ContinuityWorld,
	loaded: ProductionHostModule,
): PlacementDriver {
	loaded.reset();
	const host = new loaded.Host({
		getView: (viewId) => toPlacementPort(world, viewId),
		isFloatingEnabled: () => world.floatingEnabled,
		notice: (message) => {
			world.notices.push(message);
		},
		openSidebar: async (snapshot, target) => {
			openDestination(world, snapshot, "sidebar", "dock", target);
		},
		openFloating: (snapshot) => {
			openDestination(world, snapshot, "floating", "float", "default");
		},
	});
	return {
		dock: async (viewId, target = "default") => {
			const ok = await host.dock(viewId, target);
			await flush(world);
			return ok;
		},
		float: async (viewId) => {
			const ok = await host.float(viewId);
			await flush(world);
			return ok;
		},
	};
}

async function moveWithHarness(
	world: ContinuityWorld,
	viewId: string,
	kind: PlacementKind,
	target: PlacementOpenTarget,
): Promise<boolean> {
	const view = world.registry.get(viewId);
	if (!view) return false;
	if (kind === "dock" && view.viewType !== "floating") return false;
	if (kind === "float") {
		if (view.viewType !== "sidebar") return false;
		if (!world.floatingEnabled) {
			world.notices.push(FLOATING_DISABLED_NOTICE);
			return false;
		}
	}
	const model = modelFor(world, view);
	const snapshot = prepare(model);
	if (snapshot.blockedReason) {
		world.notices.push(snapshot.blockedReason);
		return false;
	}
	try {
		openDestination(
			world,
			snapshot,
			kind === "dock" ? "sidebar" : "floating",
			kind,
			target,
		);
		view.closeContainer();
		await flush(world);
		return true;
	} catch {
		world.notices.push(MOVE_FAILED_NOTICE);
		return false;
	}
}

function toPlacementPort(world: ContinuityWorld, viewId: string) {
	const view = world.registry.get(viewId);
	if (!view) return null;
	const model = modelFor(world, view);
	return {
		viewId: view.viewId,
		viewType: view.viewType,
		preparePlacementMove: () => prepare(model),
		closeContainer() {
			view.closeContainer();
		},
	};
}

function prepare(model: ViewModel): PlacementSnapshot {
	const blockedReason =
		model.sessionState === "initializing" ||
		model.sessionState === "authenticating"
			? CONNECTING_NOTICE
			: null;
	const snapshot: PlacementSnapshot = {
		sourceViewId: model.viewId,
		reuseClient: blockedReason === null && model.client.initialized,
		agentId: model.agentId,
		cwd: model.cwd,
		session: sessionOf(model),
		messages: model.messages.map((message) => ({
			...message,
			content: message.content.slice(),
		})),
		isSending: model.isSending,
		input: {
			text: model.input.text,
			files: model.input.files.map((file) => ({ ...file })),
		},
		queuedSends: model.queuedSends.map((item) => ({
			...item,
			files: item.files.map((file) => ({ ...file })),
		})),
		blockedReason,
	};
	// Arm only for a live move. A blocked chat must still disconnect if the
	// user closes it normally.
	model.retainClient = snapshot.reuseClient;
	return snapshot;
}

function openDestination(
	world: ContinuityWorld,
	snapshot: PlacementSnapshot,
	destType: OpenSpec["viewType"],
	kind: PlacementKind,
	target: PlacementOpenTarget,
): void {
	world.lastOpen = { kind, target };
	if (world.failNextOpen) {
		world.failNextOpen = false;
		throw new Error("no leaf");
	}
	adopt(world, snapshot, destType);
}

function adopt(
	world: ContinuityWorld,
	snapshot: PlacementSnapshot,
	destType: OpenSpec["viewType"],
): void {
	const viewId = snapshot.reuseClient
		? snapshot.sourceViewId
		: world.allocate(destType);
	const client = world.pool.getOrCreate(viewId);
	const keep = snapshot.reuseClient;
	const model: ViewModel = {
		view: undefined as unknown as IChatViewContainer,
		viewId,
		viewType: destType,
		client,
		sessionState: keep ? snapshot.session.state : "disconnected",
		sessionId: keep ? snapshot.session.sessionId : null,
		agentId: snapshot.agentId,
		cwd: snapshot.cwd,
		input: {
			text: snapshot.input?.text ?? "",
			files: (snapshot.input?.files ?? []).map((file) => ({ ...file })),
		},
		queuedSends: snapshot.queuedSends.map((item) => ({
			...item,
			files: item.files.map((file) => ({ ...file })),
		})),
		messages: keep
			? snapshot.messages.map((message) => ({
					...message,
					content: message.content.slice(),
				}))
			: [],
		isSending: keep ? snapshot.isSending : false,
		retainClient: false,
	};
	const view = createContainer(world, model);
	model.view = view;
	world.byView.set(view, model);
	world.registry.register(view);
	world.lastDestination = view;
}

async function closeSource(
	world: ContinuityWorld,
	view: IChatViewContainer,
	model: ViewModel,
): Promise<void> {
	world.registry.unregisterInstance(view);
	if (!model.retainClient) {
		await world.pool.remove(view.viewId);
	}
}

function createContainer(
	world: ContinuityWorld,
	model: ViewModel,
): IChatViewContainer {
	const view: IChatViewContainer = {
		viewId: model.viewId,
		viewType: model.viewType,
		getDisplayName: () => model.agentId,
		onActivate: vi.fn(),
		onDeactivate: vi.fn(),
		focus: vi.fn(),
		hasFocus: () => false,
		isExpanded: () => true,
		expand: vi.fn(),
		collapse: vi.fn(),
		getInputState: () => ({
			text: model.input.text,
			files: model.input.files.slice(),
		}),
		setInputState: (state) => {
			model.input = {
				text: state.text,
				files: state.files.slice(),
			};
		},
		canSend: () => model.sessionState === "ready",
		sendMessage: vi.fn(async () => false),
		cancelOperation: vi.fn(async () => {}),
		getSessionStatus: () =>
			model.sessionState === "ready"
				? "ready"
				: model.sessionState === "busy"
					? "busy"
					: model.sessionState === "error"
						? "error"
						: "disconnected",
		isAwaitingReply: () => model.isSending,
		getSessionTitle: () => "New session",
		getSessionId: () => model.sessionId,
		closeContainer() {
			world.pending.push(closeSource(world, view, model));
		},
		getContainerEl: () => ({}) as HTMLElement,
	};
	return view;
}

function sessionOf(model: ViewModel): ChatSession {
	return {
		sessionId: model.sessionId,
		state: model.sessionState,
		agentId: model.agentId,
		agentDisplayName: "Cursor",
		authMethods: [],
		createdAt: new Date("2026-01-01T00:00:00Z"),
		lastActivityAt: new Date("2026-01-01T00:00:00Z"),
		workingDirectory: model.cwd,
	};
}

async function flush(world: ContinuityWorld): Promise<void> {
	const pending = world.pending.splice(0);
	await Promise.all(pending);
}
