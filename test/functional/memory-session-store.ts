/**
 * In-memory SessionStorage for functional tests.
 * Same slice the unit suite uses: vault adapter + settings snapshot.
 * The config dir is not ".obsidian" so path building must follow configDir.
 */

import { vi } from "vitest";
import { SessionStorage } from "../../src/services/session-storage";
import type { SavedSessionInfo } from "../../src/types/session";

export const CONFIG_DIR = "test-config";

export interface MemorySessionStore {
	storage: SessionStorage;
	state: {
		savedSessions: SavedSessionInfo[];
		windowsWslMode: boolean;
	};
	files: Map<string, string>;
}

export function createMemorySessionStore(): MemorySessionStore {
	const state = {
		savedSessions: [] as SavedSessionInfo[],
		windowsWslMode: false,
	};
	const files = new Map<string, string>();
	const adapter = {
		exists: vi.fn(async (p: string) => files.has(p)),
		remove: vi.fn(async (p: string) => {
			files.delete(p);
		}),
		read: vi.fn(async (p: string) => {
			const content = files.get(p);
			if (content === undefined) throw new Error(`ENOENT: ${p}`);
			return content;
		}),
		write: vi.fn(async (p: string, content: string) => {
			files.set(p, content);
		}),
		mkdir: vi.fn(async () => {}),
	};
	const plugin = {
		app: { vault: { configDir: CONFIG_DIR, adapter } },
	};
	const settingsAccess = {
		getSnapshot: () => state,
		updateSettings: async (
			updates: Partial<{
				savedSessions: SavedSessionInfo[];
				windowsWslMode: boolean;
			}>,
		) => {
			Object.assign(state, updates);
		},
	};
	const storage = new SessionStorage(
		plugin as unknown as ConstructorParameters<typeof SessionStorage>[0],
		settingsAccess as unknown as ConstructorParameters<
			typeof SessionStorage
		>[1],
	);
	return { storage, state, files };
}
