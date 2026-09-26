import { Platform } from "obsidian";
import { extractErrorMessage } from "../../utils/error-utils";
import type { HarnessSessionAuthPolicy, HarnessSessionOpenContext } from "../shared/types";
import { classifyCursorFailureKind } from "./connection-errors";
import { hasCursorApiKey, isCursorCliSignedIn } from "./health";
import { CURSOR_SESSION_AUTH_METHOD } from "./preset";
import {
	type CursorSessionAuthTrustAccess,
	isCursorSessionAuthTrusted,
} from "./session-auth-trust";

let trustStorageOverride: CursorSessionAuthTrustAccess | null = null;

/** Test hook: inject localStorage access without Obsidian App. */
export function setCursorSessionAuthTrustStorageForTests(
	storage: CursorSessionAuthTrustAccess | null,
): void {
	trustStorageOverride = storage;
}

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

function useOptimisticCursorAuth(ctx: HarnessSessionOpenContext): boolean {
	const wslMode = ctx.wslMode ?? false;
	return Platform.isWin && !wslMode;
}

async function cursorCredentialsReady(
	ctx: HarnessSessionOpenContext,
): Promise<boolean> {
	if (hasCursorApiKey(ctx.env)) {
		return true;
	}
	if (useOptimisticCursorAuth(ctx)) {
		return true;
	}
	if (trustStorageOverride && isCursorSessionAuthTrusted(trustStorageOverride)) {
		return true;
	}
	return isCursorCliSignedIn(cursorProbeContext(ctx));
}

export const cursorSessionAuthPolicy: HarnessSessionAuthPolicy = {
	kind: "conditional",
	methodId: CURSOR_SESSION_AUTH_METHOD,
	credentialsReady: cursorCredentialsReady,
	deferAuthRetry: true,
	retryOnSessionError: (error, ctx) =>
		classifyCursorFailureKind({
			...cursorProbeContext(ctx),
			errorMessage: extractErrorMessage(error),
		}) === "auth_missing",
};
