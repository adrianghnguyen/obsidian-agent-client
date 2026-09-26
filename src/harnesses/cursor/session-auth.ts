import { extractErrorMessage } from "../../utils/error-utils";
import type { HarnessSessionAuthPolicy, HarnessSessionOpenContext } from "../shared/types";
import { classifyCursorFailureKind } from "./connection-errors";
import { isCursorCliSignedIn } from "./health";
import { CURSOR_SESSION_AUTH_METHOD } from "./preset";

function cursorProbeContext(
	ctx: HarnessSessionOpenContext,
): Parameters<typeof isCursorCliSignedIn>[0] {
	return {
		command: ctx.command ?? "agent",
		args:
			ctx.args && ctx.args.length > 0 ? [...ctx.args] : ["acp"],
		wslMode: ctx.wslMode ?? false,
		wslDistribution: ctx.wslDistribution,
		env: ctx.env,
	};
}

async function cursorCredentialsReady(
	ctx: HarnessSessionOpenContext,
): Promise<boolean> {
	return isCursorCliSignedIn(cursorProbeContext(ctx));
}

export const cursorSessionAuthPolicy: HarnessSessionAuthPolicy = {
	kind: "conditional",
	methodId: CURSOR_SESSION_AUTH_METHOD,
	credentialsReady: cursorCredentialsReady,
	retryOnSessionError: (error, ctx) =>
		classifyCursorFailureKind({
			...cursorProbeContext(ctx),
			errorMessage: extractErrorMessage(error),
		}) === "auth_missing",
};
