import { describe, it, expect, vi } from "vitest";
import { runSessionOpen } from "../../src/harnesses/shared/open-harness-session";
import type { SessionOpenPlan } from "../../src/harnesses/shared/build-session-open-plan";

function makeClient(options?: {
	authOk?: boolean;
	newSessionError?: unknown;
	newSessionErrorOnce?: boolean;
}) {
	const authOk = options?.authOk ?? true;
	const calls: string[] = [];
	let newSessionCalls = 0;
	return {
		calls,
		authenticate: vi.fn(async (methodId: string) => {
			calls.push(`authenticate:${methodId}`);
			return authOk;
		}),
		newSession: vi.fn(async (cwd: string) => {
			newSessionCalls += 1;
			calls.push(`session/new:${cwd}`);
			if (
				options?.newSessionError &&
				(!options.newSessionErrorOnce || newSessionCalls === 1)
			) {
				throw options.newSessionError;
			}
			return { sessionId: "s1", cwd };
		}),
	};
}

describe("runSessionOpen", () => {
	it("runs session/new only for an empty plan", async () => {
		const client = makeClient();
		const plan: SessionOpenPlan = {};
		const result = await runSessionOpen(plan, "/vault", client);
		expect(result).toEqual({ sessionId: "s1", cwd: "/vault" });
		expect(client.calls).toEqual(["session/new:/vault"]);
	});

	it("authenticates then session/new when preSessionMethodId is set", async () => {
		const client = makeClient();
		await runSessionOpen(
			{ preSessionMethodId: "test-auth" },
			"/vault",
			client,
		);
		expect(client.calls).toEqual([
			"authenticate:test-auth",
			"session/new:/vault",
		]);
	});

	it("throws without session/new when pre-session authenticate fails", async () => {
		const client = makeClient({ authOk: false });
		await expect(
			runSessionOpen({ preSessionMethodId: "test-auth" }, "/v", client),
		).rejects.toThrow("Authentication required");
		expect(client.newSession).not.toHaveBeenCalled();
	});

	it("skips authenticate when plan has no preSessionMethodId", async () => {
		const client = makeClient();
		await runSessionOpen({}, "/vault", client);
		expect(client.authenticate).not.toHaveBeenCalled();
	});

	it("retries authenticate once after skipped pre-auth and auth-classified session/new error", async () => {
		const client = makeClient({
			newSessionError: new Error("Authentication required"),
			newSessionErrorOnce: true,
		});
		await runSessionOpen(
			{
				retryMethodId: "retry-auth",
				shouldRetryAfterSessionError: async () => true,
			},
			"/vault",
			client,
		);
		expect(client.calls).toEqual([
			"session/new:/vault",
			"authenticate:retry-auth",
			"session/new:/vault",
		]);
	});

	it("rethrows non-retry session/new errors", async () => {
		const client = makeClient({
			newSessionError: new Error("network down"),
		});
		await expect(
			runSessionOpen(
				{
					retryMethodId: "retry-auth",
					shouldRetryAfterSessionError: async () => false,
				},
				"/vault",
				client,
			),
		).rejects.toThrow("network down");
		expect(client.calls).toEqual(["session/new:/vault"]);
	});
});
