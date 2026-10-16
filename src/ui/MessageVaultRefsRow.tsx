import * as React from "react";
const { useMemo, useState } = React;
import { FileSystemAdapter, TFile, parseLinktext } from "obsidian";

import type AgentClientPlugin from "../plugin";
import type { ChatMessage } from "../types/chat";
import {
	extractMessagesVaultRefs,
	resolveVaultRefs,
	VAULT_REF_PILL_CAP,
	type MessageVaultRef,
	type ResolvedVaultRef,
	type ResolveVaultPath,
} from "../utils/message-vault-refs";

function vaultBasePath(plugin: AgentClientPlugin): string | null {
	const adapter = plugin.app.vault.adapter;
	return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

function resolvePathWithPlugin(plugin: AgentClientPlugin): ResolveVaultPath {
	return (linkText: string) => {
		const { path } = parseLinktext(linkText);
		const dest = plugin.app.metadataCache.getFirstLinkpathDest(path, "");
		if (dest instanceof TFile) return dest.path;
		const byPath = plugin.app.vault.getAbstractFileByPath(path);
		if (byPath instanceof TFile) return byPath.path;
		return undefined;
	};
}

function openVaultRef(plugin: AgentClientPlugin, ref: ResolvedVaultRef): void {
	const path = ref.resolvedPath ?? ref.path;
	if (!path) return;
	const heading = ref.heading;
	const target = heading ? `${path}#${heading}` : path;
	void plugin.app.workspace.openLinkText(target, "");
}

function VaultRefPill({
	refItem,
	plugin,
}: {
	refItem: ResolvedVaultRef;
	plugin: AgentClientPlugin;
}) {
	const missing = !refItem.resolvedPath;
	const titleParts = [refItem.resolvedPath ?? refItem.linkText];
	if (refItem.kind === "edited") titleParts.push("Edited");
	else titleParts.push("Mentioned");
	if (missing) titleParts.push("Not in vault");

	const badge = (
		<span className="agent-client-mention-badge">
			{refItem.label}
			{refItem.kind === "edited" && (
				<span
					className="agent-client-vault-ref-edited"
					aria-hidden="true"
				/>
			)}
		</span>
	);

	if (missing) {
		return (
			<span
				className="agent-client-auto-mention-inline agent-client-context-chip agent-client-vault-ref-pill is-missing"
				title={titleParts.join(" · ")}
			>
				{badge}
			</span>
		);
	}

	return (
		<button
			type="button"
			className="agent-client-auto-mention-inline agent-client-context-chip agent-client-vault-ref-pill"
			title={titleParts.join(" · ")}
			aria-label={`Open ${refItem.label}`}
			onClick={() => openVaultRef(plugin, refItem)}
		>
			{badge}
		</button>
	);
}

export function MessageVaultRefsRow({
	refs,
	plugin,
	resolvePath,
}: {
	refs: MessageVaultRef[];
	plugin: AgentClientPlugin;
	resolvePath?: ResolveVaultPath;
}) {
	const [expanded, setExpanded] = useState(false);
	const resolved = useMemo(
		() =>
			resolveVaultRefs(
				refs,
				resolvePath ?? resolvePathWithPlugin(plugin),
			),
		[refs, plugin, resolvePath],
	);

	if (resolved.length === 0) return null;

	const overflow =
		!expanded && resolved.length > VAULT_REF_PILL_CAP
			? resolved.length - VAULT_REF_PILL_CAP
			: 0;
	const visible =
		overflow > 0 ? resolved.slice(0, VAULT_REF_PILL_CAP) : resolved;

	return (
		<div
			className="agent-client-message-vault-refs"
			aria-label="Linked notes"
		>
			{visible.map((refItem) => (
				<VaultRefPill
					key={refItem.resolvedPath ?? refItem.key}
					refItem={refItem}
					plugin={plugin}
				/>
			))}
			{overflow > 0 && (
				<button
					type="button"
					className="agent-client-auto-mention-inline agent-client-context-chip agent-client-vault-ref-overflow"
					aria-label={`Show ${overflow} more linked notes`}
					title={`Show ${overflow} more`}
					onClick={() => setExpanded(true)}
				>
					<span className="agent-client-mention-badge">
						{`+${overflow}`}
					</span>
				</button>
			)}
		</div>
	);
}

/** Footer pill strip for assistant messages / turns. Hidden when off or empty. */
export function AssistantVaultRefsRow({
	messages,
	plugin,
	enabled,
}: {
	messages: ChatMessage[];
	plugin: AgentClientPlugin;
	enabled: boolean;
}) {
	const refs = useMemo(() => {
		if (!enabled) return [];
		return extractMessagesVaultRefs(messages, {
			vaultBasePath: vaultBasePath(plugin),
		});
	}, [enabled, messages, plugin]);

	if (!enabled || refs.length === 0) return null;
	return <MessageVaultRefsRow refs={refs} plugin={plugin} />;
}
