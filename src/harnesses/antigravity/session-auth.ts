import type { HarnessSessionOpenContext } from "../shared/types";
import {
	classifyAntigravityAuth,
	defaultAntigravityAuthIo,
	gatherAntigravityAuthSignals,
} from "./auth";
import { ANTIGRAVITY_SESSION_AUTH_METHOD } from "./paths";

export async function antigravityCredentialsReady(
	ctx: HarnessSessionOpenContext,
): Promise<boolean> {
	const signals = await gatherAntigravityAuthSignals(
		defaultAntigravityAuthIo(),
		{ ...process.env, ...ctx.env },
	);
	return classifyAntigravityAuth(signals).sessionAuthMethod === undefined;
}

export const antigravitySessionAuthPolicy = {
	kind: "conditional" as const,
	methodId: ANTIGRAVITY_SESSION_AUTH_METHOD,
	credentialsReady: antigravityCredentialsReady,
};
