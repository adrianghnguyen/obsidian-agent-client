import { defineHarness } from "../shared/define-harness";
import { SESSION_AUTH_NONE } from "../shared/session-auth-policy";
import { claudeCodePreset } from "./preset";

export const claudeCodeHarness = defineHarness(claudeCodePreset, {
	sessionAuthPolicy: SESSION_AUTH_NONE,
});
