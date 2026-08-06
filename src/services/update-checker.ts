/**
 * Agent Update Checker
 *
 * Checks preset agent ACP adapters for:
 * 1. Package migration — deprecated packages that have been renamed
 * 2. Version updates — newer versions available on npm
 *
 * Pure functions (non-React). Uses Obsidian's requestUrl for network access.
 */

import { requestUrl } from "obsidian";
import * as semver from "semver";
import type { OverlayVariant } from "../types/errors";

// ============================================================================
// Types
// ============================================================================

/**
 * Agent update notification to display in the UI.
 * Compatible with ErrorInfo shape (title/message/suggestion).
 */
export interface AgentUpdateNotification {
	/** Visual variant for the overlay */
	variant: OverlayVariant;
	/** Short notification title */
	title: string;
	/** Detailed notification message */
	message: string;
	/** Actionable suggestion (e.g., npm command) */
	suggestion?: string;
	/** Optional external link rendered as an actionable anchor (e.g. docs). */
	link?: { text: string; url: string };
}

// ============================================================================
// Known Packages
// ============================================================================

/**
 * Maps agentInfo.name → npm package name.
 * Agents may report their name with or without the npm scope prefix,
 * so we handle both forms.
 */
const KNOWN_AGENT_PACKAGES: Readonly<Record<string, string>> = {
	"@agentclientprotocol/claude-agent-acp":
		"@agentclientprotocol/claude-agent-acp",
	"codex-acp": "@agentclientprotocol/codex-acp",
	"@agentclientprotocol/codex-acp": "@agentclientprotocol/codex-acp",
};

/**
 * A deprecated adapter package and its replacement.
 *
 * `name` is the agentInfo.name the deprecated adapter reports — not always
 * the npm package name (codex-acp reports its unscoped bin name), so the
 * uninstall target is carried separately as `oldPackage`.
 */
interface DeprecationRule {
	/** agentInfo.name reported by the deprecated adapter. */
	name: string;
	/** npm package the user should uninstall. */
	oldPackage: string;
	/** npm package that replaces it. */
	replacement: string;
	/**
	 * Only versions strictly below this are deprecated. Needed when the old
	 * and new adapters report the SAME name (codex-acp kept its bin name
	 * across the package move): the old package never published this
	 * version, so the boundary tells them apart. Undefined = deprecated at
	 * every version.
	 */
	onlyBelow?: string;
}

const DEPRECATION_RULES: readonly DeprecationRule[] = [
	{
		name: "@zed-industries/claude-code-acp",
		oldPackage: "@zed-industries/claude-code-acp",
		replacement: "@agentclientprotocol/claude-agent-acp",
	},
	{
		name: "@zed-industries/claude-agent-acp",
		oldPackage: "@zed-industries/claude-agent-acp",
		replacement: "@agentclientprotocol/claude-agent-acp",
	},
	{
		// @zed-industries/codex-acp → @agentclientprotocol/codex-acp (#380).
		// Both adapters report "codex-acp"; the old package topped out at
		// 0.16.0 and never published 1.x, so < 1.0.0 identifies it.
		name: "codex-acp",
		oldPackage: "@zed-industries/codex-acp",
		replacement: "@agentclientprotocol/codex-acp",
		onlyBelow: "1.0.0",
	},
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if the agent needs a package migration or version update.
 *
 * Priority: migration notification > version update notification.
 * - Migration is checked locally (no network) based on agentInfo.name.
 * - Version update queries the npm registry.
 *
 * @returns AgentUpdateNotification if action needed, null otherwise.
 */
export async function checkAgentUpdate(agentInfo: {
	name: string;
	version?: string;
}): Promise<AgentUpdateNotification | null> {
	// 1. Check for deprecated package (migration takes priority)
	const rule = DEPRECATION_RULES.find((r) => r.name === agentInfo.name);
	if (rule && isDeprecatedVersion(agentInfo.version, rule.onlyBelow)) {
		return {
			variant: "info",
			title: "Package Migration Required",
			message: `"${rule.oldPackage}" has been renamed to "${rule.replacement}".\nRun the following in your terminal:`,
			suggestion: `npm uninstall -g ${rule.oldPackage} && npm install -g ${rule.replacement}`,
		};
	}

	// 2. Check for version update (known packages only)
	const npmPackage = KNOWN_AGENT_PACKAGES[agentInfo.name];
	if (!npmPackage || !agentInfo.version) {
		return null;
	}

	try {
		const latestVersion = await fetchLatestVersion(npmPackage);
		if (
			latestVersion &&
			semver.valid(agentInfo.version) &&
			semver.gt(latestVersion, agentInfo.version)
		) {
			return {
				variant: "info",
				title: "Agent Update Available",
				message: `${npmPackage}: ${agentInfo.version} → ${latestVersion}.\nRun the following in your terminal:`,
				suggestion: `npm install -g ${npmPackage}@latest`,
			};
		}
	} catch {
		// Silently ignore network errors — update check is best-effort
	}

	return null;
}

// ============================================================================
// Internal
// ============================================================================

/**
 * Fetch the latest version of an npm package from the registry.
 */
async function fetchLatestVersion(packageName: string): Promise<string | null> {
	const response = await requestUrl({
		url: `https://registry.npmjs.org/${packageName}/latest`,
	});
	const data = response.json as { version?: string };
	return data.version ? (semver.clean(data.version) ?? null) : null;
}

/**
 * Whether a reported version falls under a rule's `onlyBelow` boundary.
 * No boundary = always deprecated. With a boundary, an absent or non-semver
 * version is NOT treated as deprecated — we only notify when the version
 * proves the adapter is the old package.
 */
function isDeprecatedVersion(
	version: string | undefined,
	onlyBelow: string | undefined,
): boolean {
	if (!onlyBelow) return true;
	return (
		version !== undefined &&
		semver.valid(version) !== null &&
		semver.lt(version, onlyBelow)
	);
}
