/**
 * Antigravity ACP bridge cold-start copy + thresholds.
 *
 * Google's `agy_acp_server` ships as a PyInstaller onefile: every spawn
 * unpacks the embedded runtime (python310.dll + ~8.3k binaries, ~312 MB) into a
 * fresh %TEMP%\_MEI* dir before it can answer the ACP `initialize` request.
 * On Windows that is ~15-20 s per process, so a first session can sit on the
 * connecting state for a while. The copy below escalates once that is clearly
 * not a normal connect.
 *
 * Optional one-time fix (removes the unpack): see `scripts/antigravity/`.
 * RCA + measurements + upstream thread:
 * https://discuss.ai.google.dev/t/acp-server-1-1-1-official-agy-acp-server-cold-starts-in-16s-on-every-windows-spawn/183427/3
 */

import { ANTIGRAVITY_PRESET_ID } from "./paths";

/** Elapsed (ms) after which the connecting copy switches to the slow-boot note. */
export const ANTIGRAVITY_SLOW_BOOT_WARN_MS = 15000;

/** Upstream RCA thread (linked from the slow-boot note and Debug Mode hint). */
export const ANTIGRAVITY_COLD_START_ISSUE_URL =
	"https://discuss.ai.google.dev/t/acp-server-1-1-1-official-agy-acp-server-cold-starts-in-16s-on-every-windows-spawn/183427/3";

/** Shown while an Antigravity session is still connecting (first ~15 s). */
export const ANTIGRAVITY_CONNECTING_COPY =
	"Starting ACP bridge… first initialize can take about 30 seconds";

/** Shown once a connect has taken longer than expected. */
export const ANTIGRAVITY_SLOW_BOOT_COPY =
	"Still starting the ACP bridge — a cold bridge can take 30–60 seconds. This is a known agy_acp_server cold start, not your setup.";

/** Link label rendered next to the slow-boot copy. */
export const ANTIGRAVITY_SLOW_BOOT_LINK_TEXT = "Why this is slow";

export interface ConnectingCopy {
	/** Message body to render in the empty/connecting state. */
	text: string;
	/** True once the wait has crossed {@link ANTIGRAVITY_SLOW_BOOT_WARN_MS}. */
	showWarn: boolean;
	/** Optional link to the RCA thread (only set when `showWarn`). */
	link?: { text: string; url: string };
}

/**
 * Resolve the connecting-state copy for a not-yet-ready session.
 *
 * Pure and time-driven so it can be unit-tested without React: the caller feeds
 * `elapsedMs` (time since the connecting state began). Non-Antigravity agents
 * always get the generic message and never a warning.
 */
export function resolveConnectingCopy(args: {
	agentId?: string | null;
	agentLabel: string;
	elapsedMs: number;
}): ConnectingCopy {
	const { agentId, agentLabel, elapsedMs } = args;

	if (agentId !== ANTIGRAVITY_PRESET_ID) {
		return { text: `Connecting to ${agentLabel}...`, showWarn: false };
	}

	if (elapsedMs >= ANTIGRAVITY_SLOW_BOOT_WARN_MS) {
		return {
			text: ANTIGRAVITY_SLOW_BOOT_COPY,
			showWarn: true,
			link: {
				text: ANTIGRAVITY_SLOW_BOOT_LINK_TEXT,
				url: ANTIGRAVITY_COLD_START_ISSUE_URL,
			},
		};
	}

	return { text: ANTIGRAVITY_CONNECTING_COPY, showWarn: false };
}
