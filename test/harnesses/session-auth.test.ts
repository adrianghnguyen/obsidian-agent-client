import { describe, it, expect, vi } from "vitest";
import {
	getAuthenticateBeforeNewSession,
	openHarnessSession,
} from "../../src/harnesses";
import { ANTIGRAVITY_SESSION_AUTH_METHOD } from "../../src/harnesses/antigravity";

function makeClient() {
	const calls: string[] = [];
	return {
		calls,
		initialize: vi.fn(async () => {
			calls.push("initialize");
		}),
		authenticate: vi.fn(async (methodId: string) => {
			calls.push(`authenticate:${methodId}`);
			return true;
		}),
		newSession: vi.fn(async (cwd: string) => {
			calls.push("session/new");
			return { sessionId: "sess-1", cwd };
		}),
	};
}

describe("openHarnessSession", () => {
	it("exposes gemini-api-key only on the Antigravity harness", () => {
		expect(getAuthenticateBeforeNewSession("antigravity")).toBe(
			ANTIGRAVITY_SESSION_AUTH_METHOD,
		);
		expect(ANTIGRAVITY_SESSION_AUTH_METHOD).toBe("gemini-api-key");
		expect(getAuthenticateBeforeNewSession("cursor")).toBeUndefined();
		expect(getAuthenticateBeforeNewSession("claude-code-acp")).toBeUndefined();
		expect(getAuthenticateBeforeNewSession("gemini-cli")).toBeUndefined();
	});

	it("authenticates Antigravity after initialize and before session/new", async () => {
		const client = makeClient();
		await client.initialize();
		const result = await openHarnessSession(
			"antigravity",
			"/vault",
			client,
		);
		expect(result).toEqual({ sessionId: "sess-1", cwd: "/vault" });
		expect(client.calls).toEqual([
			"initialize",
			"authenticate:gemini-api-key",
			"session/new",
		]);
		expect(client.authenticate).toHaveBeenCalledOnce();
		expect(client.authenticate).toHaveBeenCalledWith("gemini-api-key");
		expect(client.newSession).toHaveBeenCalledOnce();
		expect(client.newSession).toHaveBeenCalledWith("/vault");
	});

	it("does not authenticate Cursor before session/new", async () => {
		const client = makeClient();
		await client.initialize();
		await openHarnessSession("cursor", "/vault", client);
		expect(client.calls).toEqual(["initialize", "session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
		expect(client.newSession).toHaveBeenCalledOnce();
	});

	it("does not authenticate other presets before session/new", async () => {
		const client = makeClient();
		await client.initialize();
		await openHarnessSession("claude-code-acp", "/vault", client);
		expect(client.calls).toEqual(["initialize", "session/new"]);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("does not call session/new when Antigravity authenticate fails", async () => {
		const client = makeClient();
		client.authenticate.mockImplementation(async (methodId: string) => {
			client.calls.push(`authenticate:${methodId}`);
			return false;
		});
		await client.initialize();
		await expect(
			openHarnessSession("antigravity", "/vault", client),
		).rejects.toThrow("Authentication required");
		expect(client.calls).toEqual([
			"initialize",
			"authenticate:gemini-api-key",
		]);
		expect(client.newSession).not.toHaveBeenCalled();
	});
});
