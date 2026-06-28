/**
 * Image / avatar URL resolution (services layer).
 *
 * - resolveImageSrc: http(s)/data URLs pass through; vault-relative paths are
 *   resolved via FileSystemAdapter.getResourcePath. Paths that escape the
 *   vault root are rejected.
 * - getAgentAvatarImage: looks up a configured avatarImage by agentId
 *   (pure settings read).
 * - resolveAvatarSrc: the unified fallback chain (explicit -> agent -> global).
 *
 * NOTE: a service may depend on the plugin type via `import type` (matches the
 * existing VaultService / settings-normalizer pattern); no runtime cycle.
 */

import { FileSystemAdapter, normalizePath } from "obsidian";
import type AgentClientPlugin from "../plugin";

/**
 * Validate that a vault-relative path does not escape the vault root.
 *
 * getResourcePath() returns an `app://<hash>/...` URL, so validating its
 * output by prefix does not work. Instead we validate the INPUT path before
 * resolving it.
 */
function isVaultRelativePathSafe(path: string): boolean {
	// Absolute paths / drive letters / home references are not vault-relative.
	if (path.startsWith("/") || path.startsWith("\\")) return false;
	if (/^[a-zA-Z]:[\\/]/.test(path)) return false;
	if (path.startsWith("~")) return false;

	// Reject `..` segments that climb above the vault root.
	let depth = 0;
	for (const segment of normalizePath(path).split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") {
			depth -= 1;
			if (depth < 0) return false; // escapes the vault root
		} else {
			depth += 1;
		}
	}
	return true;
}

export function resolveImageSrc(
	plugin: AgentClientPlugin,
	value: string | undefined | null,
): string | null {
	if (!value) return null;
	const trimmed = value.trim();
	if (trimmed.length === 0) return null;

	// Absolute URLs (http/https/data) pass through.
	if (/^(https?:|data:)/i.test(trimmed)) {
		return trimmed;
	}

	// Vault-relative path: reject escapes before resolving (#6).
	if (!isVaultRelativePathSafe(trimmed)) return null;

	const adapter = plugin.app.vault.adapter;
	if (adapter instanceof FileSystemAdapter) {
		return adapter.getResourcePath(normalizePath(trimmed));
	}
	return null;
}

export function getAgentAvatarImage(
	plugin: AgentClientPlugin,
	agentId: string | undefined,
): string | undefined {
	if (!agentId) return undefined;
	const settings = plugin.settings;
	if (agentId === settings.claude.id) return settings.claude.avatarImage;
	if (agentId === settings.codex.id) return settings.codex.avatarImage;
	if (agentId === settings.gemini.id) return settings.gemini.avatarImage;
	return settings.customAgents.find((agent) => agent.id === agentId)
		?.avatarImage;
}

/**
 * Unified avatar resolution fallback chain (#36).
 * 1. block-specified explicit image
 * 2. the agent's avatarImage
 * 3. the global floatingButtonImage (only when includeFloatingButton)
 */
export function resolveAvatarSrc(options: {
	plugin: AgentClientPlugin;
	explicitImage?: string;
	agentId?: string;
	/** true for embedded chats, false for button blocks. */
	includeFloatingButton?: boolean;
}): string | null {
	const {
		plugin,
		explicitImage,
		agentId,
		includeFloatingButton = true,
	} = options;

	if (explicitImage) {
		const resolved = resolveImageSrc(plugin, explicitImage);
		if (resolved) return resolved;
	}
	if (agentId) {
		const resolved = resolveImageSrc(
			plugin,
			getAgentAvatarImage(plugin, agentId),
		);
		if (resolved) return resolved;
	}
	if (includeFloatingButton) {
		const resolved = resolveImageSrc(
			plugin,
			plugin.settings.floatingButtonImage,
		);
		if (resolved) return resolved;
	}
	return null;
}
