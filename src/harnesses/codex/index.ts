import { defineHarness } from "../shared/define-harness";
import { SESSION_AUTH_NONE } from "../shared/session-auth-policy";
import { codexPreset } from "./preset";

export const codexHarness = defineHarness(codexPreset, {
	sessionAuthPolicy: SESSION_AUTH_NONE,
});
