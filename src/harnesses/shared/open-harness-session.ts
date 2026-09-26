import type { SessionOpenPlan } from "./build-session-open-plan";

export interface HarnessSessionClient<T> {
	authenticate(methodId: string): Promise<boolean>;
	newSession(workingDirectory: string): Promise<T>;
}

/**
 * Run session/new with optional pre-session authenticate and one-shot retry
 * when pre-session auth was skipped but session/new failed with an auth error.
 */
export async function runSessionOpen<T>(
	plan: SessionOpenPlan,
	workingDirectory: string,
	client: HarnessSessionClient<T>,
): Promise<T> {
	const ranPreSessionAuth = Boolean(plan.preSessionMethodId);
	if (plan.preSessionMethodId) {
		const ok = await client.authenticate(plan.preSessionMethodId);
		if (!ok) {
			throw new Error("Authentication required");
		}
	}

	try {
		return await client.newSession(workingDirectory);
	} catch (error) {
		if (
			!ranPreSessionAuth &&
			plan.retryMethodId &&
			plan.shouldRetryAfterSessionError &&
			(await plan.shouldRetryAfterSessionError(error))
		) {
			const ok = await client.authenticate(plan.retryMethodId);
			if (!ok) {
				throw new Error("Authentication required");
			}
			return client.newSession(workingDirectory);
		}
		throw error;
	}
}
