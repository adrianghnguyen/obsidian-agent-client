import { describe, it, expect, vi } from "vitest";
import {
	HARNESS_DEFINITIONS,
	assertValidSessionAuthPolicy,
	buildSessionOpenPlan,
	withCredentialsReadyOverride,
} from "../../src/harnesses";
import { runSessionOpen } from "../../src/harnesses/shared/open-harness-session";

function makeClient() {
	const calls: string[] = [];
	return {
		calls,
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

describe("session auth registry contract", () => {
	for (const harness of HARNESS_DEFINITIONS) {
		describe(harness.preset.presetId, () => {
			it("declares a valid sessionAuthPolicy", () => {
				expect(() => assertValidSessionAuthPolicy(harness)).not.toThrow();
				expect(harness.sessionAuthPolicy).toBeDefined();
			});

			it("never calls authenticate on session open when credentialsReady is true for every registered harness", async () => {
				const readyHarness = withCredentialsReadyOverride(harness, true);
				const plan = await buildSessionOpenPlan(readyHarness, {});
				expect(plan.preSessionMethodId).toBeUndefined();

				const client = makeClient();
				await runSessionOpen(plan, "/vault", client);
				expect(client.authenticate).not.toHaveBeenCalled();
				expect(client.calls).toEqual(["session/new"]);
			});

			if (harness.sessionAuthPolicy.kind === "conditional") {
				it("calls authenticate once before session/new when credentials are not ready", async () => {
					const notReady = withCredentialsReadyOverride(harness, false);
					const plan = await buildSessionOpenPlan(notReady, {});
					expect(plan.preSessionMethodId).toBe(
						harness.sessionAuthPolicy.methodId,
					);

					const client = makeClient();
					await runSessionOpen(plan, "/vault", client);
					expect(client.calls).toEqual([
						`authenticate:${harness.sessionAuthPolicy.methodId}`,
						"session/new",
					]);
				});
			}

			if (harness.sessionAuthPolicy.kind === "none") {
				it("never includes pre-session auth in the plan", async () => {
					const plan = await buildSessionOpenPlan(harness, {});
					expect(plan.preSessionMethodId).toBeUndefined();
					expect(plan.retryMethodId).toBeUndefined();
				});
			}
		});
	}
});
