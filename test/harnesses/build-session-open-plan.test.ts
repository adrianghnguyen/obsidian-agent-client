import { describe, it, expect } from "vitest";
import { buildSessionOpenPlan } from "../../src/harnesses/shared/build-session-open-plan";
import type { HarnessDefinition } from "../../src/harnesses/shared/types";
import { SESSION_AUTH_NONE } from "../../src/harnesses/shared/session-auth-policy";

function fakeHarness(
	policy: HarnessDefinition["sessionAuthPolicy"],
): HarnessDefinition {
	return {
		preset: {
			presetId: "fake",
			defaultDisplayName: "Fake",
			defaultCommand: "fake",
			defaultArgs: [],
			installHint: { default: "install fake" },
			settingsCopy: { pathDesc: "path" },
			docsPage: "fake",
		},
		sessionAuthPolicy: policy,
	};
}

describe("buildSessionOpenPlan", () => {
	it("returns empty plan for sessionAuthPolicy none", async () => {
		const plan = await buildSessionOpenPlan(
			fakeHarness(SESSION_AUTH_NONE),
			{},
		);
		expect(plan).toEqual({});
	});

	it("sets preSessionMethodId when credentials are not ready", async () => {
		const plan = await buildSessionOpenPlan(
			fakeHarness({
				kind: "conditional",
				methodId: "method-a",
				credentialsReady: async () => false,
			}),
			{},
		);
		expect(plan.preSessionMethodId).toBe("method-a");
	});

	it("clears preSessionMethodId when credentials are ready", async () => {
		const plan = await buildSessionOpenPlan(
			fakeHarness({
				kind: "conditional",
				methodId: "method-a",
				credentialsReady: async () => true,
			}),
			{},
		);
		expect(plan.preSessionMethodId).toBeUndefined();
	});

	it("keeps retry hooks when credentials are ready but retryOnSessionError is defined", async () => {
		const plan = await buildSessionOpenPlan(
			fakeHarness({
				kind: "conditional",
				methodId: "method-a",
				credentialsReady: async () => true,
				retryOnSessionError: async () => true,
			}),
			{},
		);
		expect(plan.preSessionMethodId).toBeUndefined();
		expect(plan.retryMethodId).toBe("method-a");
		expect(plan.shouldRetryAfterSessionError).toEqual(expect.any(Function));
	});
});
