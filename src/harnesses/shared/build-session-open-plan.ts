import type {
	HarnessDefinition,
	HarnessSessionOpenContext,
} from "./types";

export interface SessionOpenPlan {
	readonly preSessionMethodId?: string;
	readonly retryMethodId?: string;
	readonly shouldRetryAfterSessionError?: (
		error: unknown,
	) => boolean | Promise<boolean>;
}

export async function buildSessionOpenPlan(
	harness: HarnessDefinition,
	ctx: HarnessSessionOpenContext = {},
): Promise<SessionOpenPlan> {
	const policy = harness.sessionAuthPolicy;
	if (policy.kind === "none") {
		return {};
	}

	const ready = await policy.credentialsReady(ctx);
	if (ready) {
		if (!policy.retryOnSessionError) {
			return {};
		}
		return {
			retryMethodId: policy.methodId,
			shouldRetryAfterSessionError: (error) =>
				policy.retryOnSessionError!(error, ctx),
		};
	}

	if (!policy.retryOnSessionError) {
		return { preSessionMethodId: policy.methodId };
	}
	return {
		preSessionMethodId: policy.methodId,
		retryMethodId: policy.methodId,
		shouldRetryAfterSessionError: (error) =>
			policy.retryOnSessionError!(error, ctx),
	};
}
