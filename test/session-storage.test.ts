import { describe, it, expect, vi } from "vitest";
import { SessionStorage } from "../src/services/session-storage";
import type { SavedSessionInfo } from "../src/types/session";

// SessionStorage only needs a tiny slice of the plugin (vault adapter +
// configDir) and a {getSnapshot, updateSettings} settings access. We stub both
// and cast to the real constructor parameter types (the settings-access
// interface is module-private, so we borrow it via ConstructorParameters).
type StorageState = {
	savedSessions: SavedSessionInfo[];
	windowsWslMode: boolean;
};

// Intentionally NOT ".obsidian": the code must derive the path from
// Vault#configDir, not assume the default config folder.
const CONFIG_DIR = "test-config";
const SESSIONS_DIR = `${CONFIG_DIR}/plugins/agent-client/sessions`;
const filePath = (sessionId: string) => `${SESSIONS_DIR}/${sessionId}.json`;

function makeSession(
	partial: Partial<SavedSessionInfo> & Pick<SavedSessionInfo, "sessionId">,
): SavedSessionInfo {
	return {
		agentId: "claude",
		cwd: "/vault",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		...partial,
	};
}

function makeStorage() {
	const state: StorageState = { savedSessions: [], windowsWslMode: false };
	const existing = new Set<string>();
	const adapter = {
		exists: vi.fn(async (p: string) => existing.has(p)),
		remove: vi.fn(async (p: string) => {
			existing.delete(p);
		}),
	};
	const plugin = {
		app: { vault: { configDir: CONFIG_DIR, adapter } },
	};
	const settingsAccess = {
		getSnapshot: () => state,
		updateSettings: async (updates: Partial<StorageState>) => {
			Object.assign(state, updates);
		},
	};
	const storage = new SessionStorage(
		plugin as unknown as ConstructorParameters<typeof SessionStorage>[0],
		settingsAccess as unknown as ConstructorParameters<
			typeof SessionStorage
		>[1],
	);
	return { storage, state, adapter, existing };
}

describe("SessionStorage — getSavedSessionByEmbedId (#5/#11)", () => {
	it("returns the most-recently-updated match", () => {
		const { storage, state } = makeStorage();
		state.savedSessions = [
			makeSession({
				sessionId: "old",
				embedId: "blk1",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
			makeSession({
				sessionId: "new",
				embedId: "blk1",
				updatedAt: "2026-02-01T00:00:00.000Z",
			}),
		];
		expect(storage.getSavedSessionByEmbedId("blk1")?.sessionId).toBe("new");
	});

	it("returns undefined when no row carries the embedId", () => {
		const { storage, state } = makeStorage();
		state.savedSessions = [makeSession({ sessionId: "s1" })];
		expect(storage.getSavedSessionByEmbedId("missing")).toBeUndefined();
	});

	it("resolves regardless of agentId/cwd (rename/switch safe)", () => {
		const { storage, state } = makeStorage();
		state.savedSessions = [
			makeSession({
				sessionId: "s1",
				embedId: "blk1",
				agentId: "codex",
				cwd: "/some/other/dir",
			}),
		];
		expect(storage.getSavedSessionByEmbedId("blk1")?.sessionId).toBe("s1");
	});
});

describe("SessionStorage — embedId-only dedup + orphan transcript (#10)", () => {
	it("replaces the single row and deletes the old transcript on a new sessionId", async () => {
		const { storage, state, adapter, existing } = makeStorage();
		state.savedSessions = [
			makeSession({ sessionId: "s1", embedId: "blk1" }),
		];
		existing.add(filePath("s1"));

		await storage.saveSession(
			makeSession({ sessionId: "s2", embedId: "blk1" }),
		);

		expect(state.savedSessions).toHaveLength(1);
		expect(state.savedSessions[0].sessionId).toBe("s2");
		expect(adapter.remove).toHaveBeenCalledWith(filePath("s1"));
	});

	it("dedups by embedId alone — an agent/cwd switch replaces, not accumulates", async () => {
		const { storage, state, adapter, existing } = makeStorage();
		state.savedSessions = [
			makeSession({
				sessionId: "s1",
				embedId: "blk1",
				agentId: "claude",
				cwd: "/vault",
			}),
		];
		existing.add(filePath("s1"));

		await storage.saveSession(
			makeSession({
				sessionId: "s2",
				embedId: "blk1",
				agentId: "codex",
				cwd: "/other",
			}),
		);

		expect(state.savedSessions).toHaveLength(1);
		expect(state.savedSessions[0]).toMatchObject({
			sessionId: "s2",
			agentId: "codex",
			cwd: "/other",
		});
		expect(adapter.remove).toHaveBeenCalledWith(filePath("s1"));
	});

	it("does NOT delete when the embedId row keeps the same sessionId", async () => {
		const { storage, state, adapter } = makeStorage();
		state.savedSessions = [
			makeSession({ sessionId: "s1", embedId: "blk1", title: "old" }),
		];

		await storage.saveSession(
			makeSession({ sessionId: "s1", embedId: "blk1", title: "new" }),
		);

		expect(state.savedSessions).toHaveLength(1);
		expect(state.savedSessions[0].title).toBe("new");
		expect(adapter.remove).not.toHaveBeenCalled();
	});
});

describe("SessionStorage — non-embedded saves keep sessionId fallback", () => {
	it("dedups by sessionId and never deletes a transcript", async () => {
		const { storage, state, adapter } = makeStorage();
		state.savedSessions = [makeSession({ sessionId: "s1", title: "old" })];

		await storage.saveSession(
			makeSession({ sessionId: "s1", title: "new" }),
		);
		expect(state.savedSessions).toHaveLength(1);
		expect(state.savedSessions[0].title).toBe("new");

		await storage.saveSession(makeSession({ sessionId: "s2" }));
		expect(state.savedSessions).toHaveLength(2);
		expect(adapter.remove).not.toHaveBeenCalled();
	});
});
