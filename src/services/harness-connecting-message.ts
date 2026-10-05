import {
	ANTIGRAVITY_CONNECTING_COPY,
	ANTIGRAVITY_PRESET_ID,
} from "../harnesses/antigravity";
import { formatElapsedDuration } from "../utils/format-elapsed-duration";

export interface HarnessConnectingEmptyStateInput {
	agentId: string;
	agentLabel: string;
	elapsedMs: number;
}

/** Empty-state copy while the harness is connecting, with live elapsed suffix. */
export function formatHarnessConnectingEmptyState(
	input: HarnessConnectingEmptyStateInput,
): string {
	const base =
		input.agentId === ANTIGRAVITY_PRESET_ID
			? ANTIGRAVITY_CONNECTING_COPY
			: `Connecting to ${input.agentLabel}...`;
	return `${base} (${formatElapsedDuration(input.elapsedMs)})`;
}
