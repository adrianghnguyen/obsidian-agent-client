import type { HarnessDefinition, HarnessSessionAuthPolicy } from "./types";

/** Presets that never call ACP authenticate before session/new. */
export const SESSION_AUTH_NONE: HarnessSessionAuthPolicy = { kind: "none" };

export function assertValidSessionAuthPolicy(harness: HarnessDefinition): void {
	const id = harness.preset.presetId;
	const policy = harness.sessionAuthPolicy;
	if (!policy) {
		throw new Error(
			`Harness "${id}" must declare sessionAuthPolicy (none or conditional).`,
		);
	}
	if (policy.kind === "none") {
		return;
	}
	if (!policy.methodId.trim()) {
		throw new Error(
			`Harness "${id}" conditional sessionAuthPolicy requires a non-empty methodId.`,
		);
	}
	if (typeof policy.credentialsReady !== "function") {
		throw new Error(
			`Harness "${id}" conditional sessionAuthPolicy requires credentialsReady.`,
		);
	}
}

/** Test helper: force credentialsReady result without mutating production modules. */
export function withCredentialsReadyOverride(
	harness: HarnessDefinition,
	ready: boolean,
): HarnessDefinition {
	const policy = harness.sessionAuthPolicy;
	if (policy.kind !== "conditional") {
		return harness;
	}
	return {
		...harness,
		sessionAuthPolicy: {
			...policy,
			credentialsReady: async () => ready,
		},
	};
}
