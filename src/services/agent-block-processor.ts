/**
 * Markdown `agent` / `agent-client` code block rendering and persist id injection.
 */

import {
	MarkdownRenderChild,
	TFile,
	type MarkdownPostProcessorContext,
} from "obsidian";
import type AgentClientPlugin from "../plugin";
import {
	mountCodeBlockChat,
} from "../ui/CodeBlockChatView";
import { mountAgentButtonBlock } from "../ui/AgentButtonBlock";
import { parseAgentBlock } from "../utils/agent-block-parser";
import {
	findAgentSettings,
	isAgentEnabled,
} from "../services/session-helpers";
import { getLogger } from "../utils/logger";
import { generateEmbedId } from "../utils/embed-id";

export class AgentBlockProcessor {
	private embedIdInjectionInFlight = new Set<string>();

	constructor(private readonly plugin: AgentClientPlugin) {}

	render(
		source: string,
		el: HTMLElement,
		ctx: MarkdownPostProcessorContext,
	): void {
		const child = new MarkdownRenderChild(el);
		const parsed = parseAgentBlock(source);

		if (!parsed.ok) {
			const errorEl = el.createDiv({
				cls: "agent-client-code-block-error",
			});
			errorEl.createSpan({
				cls: "agent-client-code-block-error-label",
				text: "agent-client block error: ",
			});
			errorEl.createSpan({ text: parsed.error });
			const sourceEl = errorEl.createEl("pre", {
				cls: "agent-client-code-block-error-source",
			});
			sourceEl.setText(source);
			ctx.addChild(child);
			return;
		}

		const warnings = parsed.warnings ? [...parsed.warnings] : [];
		const requestedAgent = parsed.config.agent;
		if (requestedAgent) {
			const agentSettings = findAgentSettings(
				this.plugin.settings,
				requestedAgent,
			);
			if (!agentSettings) {
				warnings.push(
					parsed.config.type === "chat"
						? `Unknown agent "${requestedAgent}" — this block will fail to start. Check the agent id in Settings → Agent Client.`
						: `Unknown agent "${requestedAgent}", using the default agent instead.`,
				);
			} else if (!isAgentEnabled(agentSettings)) {
				warnings.push(
					`Agent "${requestedAgent}" is disabled in settings; this block pins it and will still use it.`,
				);
			}
		}

		if (warnings.length > 0) {
			const warnEl = el.createDiv({
				cls: "agent-client-code-block-warning",
			});
			for (const warning of warnings) {
				warnEl.createDiv({
					cls: "agent-client-code-block-warning-item",
					text: warning,
				});
			}
		}

		const sectionInfo = ctx.getSectionInfo(el);
		const sourcePath = ctx.sourcePath || "";
		const lineStart = sectionInfo?.lineStart ?? 0;
		const blockId = `${sourcePath || "untitled"}:${lineStart}`;

		if (parsed.config.type === "chat") {
			if (parsed.config.persist && !parsed.config.id && sectionInfo) {
				void this.ensureEmbedId(
					sourcePath,
					sectionInfo.lineStart,
					sectionInfo.lineEnd,
				);
			}
			const container = mountCodeBlockChat(
				this.plugin,
				el,
				parsed.config,
				{
					sourcePath,
					blockId: parsed.config.id ?? blockId,
					lineStart,
				},
			);
			child.onunload = () => container.unmount();
		} else {
			const root = mountAgentButtonBlock(
				this.plugin,
				el,
				parsed.config,
				{
					sourcePath,
					lineStart,
				},
			);
			child.onunload = () => root.unmount();
		}
		ctx.addChild(child);
	}

	async ensureEmbedId(
		sourcePath: string,
		lineStart: number,
		lineEnd: number,
	): Promise<void> {
		if (!sourcePath) return;
		const guardKey = `${sourcePath}:${lineStart}`;
		if (this.embedIdInjectionInFlight.has(guardKey)) return;

		const file = this.plugin.app.vault.getAbstractFileByPath(sourcePath);
		if (!(file instanceof TFile)) return;

		this.embedIdInjectionInFlight.add(guardKey);
		try {
			await this.plugin.app.vault.process(file, (content) => {
				const lines = content.split("\n");
				if (
					lineStart < 0 ||
					lineEnd >= lines.length ||
					lineStart >= lineEnd
				) {
					return content;
				}
				if (
					!/^\s*`{3,}\s*(agent-client|agent)(?:\s|$)/.test(
						lines[lineStart],
					)
				) {
					return content;
				}

				const body = lines.slice(lineStart + 1, lineEnd);
				const liveParsed = parseAgentBlock(body.join("\n"));
				if (
					!liveParsed.ok ||
					liveParsed.config.type !== "chat" ||
					!liveParsed.config.persist ||
					liveParsed.config.id
				) {
					return content;
				}

				const indent = lines[lineStart].match(/^\s*/)?.[0] ?? "";
				lines.splice(
					lineStart + 1,
					0,
					`${indent}id: ${generateEmbedId()}`,
				);
				return lines.join("\n");
			});
		} catch (error) {
			getLogger().error(
				`[AgentClient] Failed to inject embed id: ${error}`,
			);
		} finally {
			this.embedIdInjectionInFlight.delete(guardKey);
		}
	}
}
