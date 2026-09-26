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
	readonly deferAuthRetry?: boolean;
}

export async function buildSessionOpenPlan(
	harness: HarnessDefinition,
	ctx: HarnessSessionOpenContext = {},
): Promise<SessionOpenPlan> {
	const policy = harness.sessionAuthPolicy;
	if (policy.kind === "none") {
		return {};
	}

	const deferAuthRetry = policy.deferAuthRetry === true;
	const retryPlan = policy.retryOnSessionError
		? {
				retryMethodId: policy.methodId,
				shouldRetryAfterSessionError: (error: unknown) =>
					policy.retryOnSessionError!(error, ctx),
				...(deferAuthRetry ? { deferAuthRetry: true as const } : {}),
			}
		: {};

	const ready = await policy.credentialsReady(ctx);
	if (ready) {
		if (!policy.retryOnSessionError) {
			return {};
		}
		return retryPlan;
	}

	if (!policy.retryOnSessionError) {
		return { preSessionMethodId: policy.methodId };
	}
	return {
		preSessionMethodId: policy.methodId,
		...retryPlan,
	};
}
