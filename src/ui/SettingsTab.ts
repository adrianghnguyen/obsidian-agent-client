import {
	App,
	Notice,
	PluginSettingTab,
	Setting,
	DropdownComponent,
	Platform,
	SecretComponent,
	ToggleComponent,
	ExtraButtonComponent,
	setIcon,
	SliderComponent,
	TextComponent,
} from "obsidian";
import type AgentClientPlugin from "../plugin";
import type {
	CustomAgentSettings,
	PresetAgentUserSettings,
	AgentEnvVar,
	ChatViewLocation,
} from "../plugin";
import type { TraceVerbosity } from "../types/settings";
import {
	TRACE_VERBOSITY_LABELS,
	TRACE_VERBOSITY_SUMMARY,
} from "../services/trace-verbosity";
import {
	PRESET_AGENTS,
	type PresetAgentDefinition,
} from "../services/preset-agents";
import { getHarnessById } from "../harnesses";
import type { HarnessDefinition } from "../harnesses/shared/types";
import {
	ANTIGRAVITY_PRESET_ID,
	checkAntigravityHealth,
	getAntigravityMcpConfigNote,
	getDefaultAntigravityBridgePath,
	resolveAntigravityBridgePath,
	type AntigravityHealthReport,
} from "../harnesses/antigravity";
import {
	getAvailableAgentsFromSettings,
	getCurrentAgent,
	isAgentEnabled,
} from "../services/session-helpers";
import { resolveCommandPath, resolveCommandPathInWsl } from "../utils/paths";
import {
	normalizeEnvVars,
	CHAT_FONT_SIZE_MAX,
	CHAT_FONT_SIZE_MIN,
	parseChatFontSize,
	FLOATING_WINDOW_SIZE_MIN,
	FLOATING_WINDOW_SIZE_MAX,
	FLOATING_IDLE_TIMEOUT_MAX_MS,
	FLOATING_IDLE_OPACITY_MIN,
	FLOATING_IDLE_OPACITY_MAX,
	clampFloatingWindowSize,
	clampFloatingIdleTimeoutMs,
	clampFloatingIdleOpacityPercent,
} from "../services/settings-normalizer";
import { VOICE_INPUT_SECRET_ID } from "../voice-input/VoiceInputSettings";
import changelogMarkdown from "../../CHANGELOG.md";
import { buildManifestBanner } from "../services/changelog-banner";

/** Nested (L2) settings sections are foldable only when they have 4+ items. */
function nestedFoldable(itemCount: number): boolean {
	return itemCount >= 4;
}

export class AgentClientSettingTab extends PluginSettingTab {
	plugin: AgentClientPlugin;
	private agentSelector: DropdownComponent | null = null;
	private unsubscribe: (() => void) | null = null;
	private idleOpacitySlider: SliderComponent | null = null;
	private idleOpacityText: TextComponent | null = null;
	private idleTransparencyToggle: ToggleComponent | null = null;
	/**
	 * Open sections: agent rows ("preset:<id>" / "custom:<id>") and
	 * settings callouts ("settings:<id>"). Deliberately non-persisted
	 * (cleared on hide), but held on the instance so renderContent() calls
	 * from in-section actions re-render in their current open state.
	 */
	private openSections = new Set<string>();
	/** True after default-open settings callouts have been seeded this visit. */
	private settingsCalloutDefaultsApplied = false;

	constructor(app: App, plugin: AgentClientPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	/**
	 * Obsidian's entry point for rendering the tab. Kept as a thin delegate:
	 * SettingTab.display() is deprecated since Obsidian 1.13, so internal
	 * re-renders must call renderContent() directly — a this.display() call
	 * would trip @typescript-eslint/no-deprecated (an error in the obsidianmd
	 * config), and Obsidian's plugin review rejects disabling that rule.
	 * Overriding the method itself is lint-clean. Migrate to
	 * getSettingDefinitions() once Obsidian 1.13 leaves Catalyst beta.
	 */
	display(): void {
		this.renderContent();
	}

	/**
	 * Full render of the settings tab into containerEl. Called by display()
	 * (Obsidian's entry point) and directly by in-tab actions that need a
	 * re-render (visibility toggles, custom agent add/delete, auto-detect).
	 * Same delegation shape as SessionHistoryModal.renderContent().
	 */
	private renderContent(): void {
		const { containerEl } = this;

		containerEl.empty();
		this.agentSelector = null;

		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}

		this.seedSettingsCalloutDefaults();

		containerEl.addClass("agent-client-settings");
		this.renderPageHeader(containerEl);
		this.renderAgentsSection(containerEl);
		this.renderComposerSection(containerEl);
		this.renderAppearanceSection(containerEl);
		this.renderReplyFormattingSection(containerEl);
		this.renderBehaviorSection(containerEl);
		this.renderFloatingChatSection(containerEl);
		this.renderExportSection(containerEl);
		this.renderVoiceInputSection(containerEl);
		this.renderAdvancedSection(containerEl);

		this.unsubscribe = this.plugin.settingsService.subscribe(() => {
			this.updateAgentDropdown();
		});
		this.updateAgentDropdown();
	}

	/**
	 * Seed default-open settings callouts once per settings-tab visit.
	 * Cleared together with openSections in hide().
	 */
	private seedSettingsCalloutDefaults(): void {
		if (this.settingsCalloutDefaultsApplied) {
			return;
		}
		// Agents is why people open this tab. Other sections stay closed;
		// their headers show the current value so the page scans as a list.
		this.openSections.add("settings:agents");
		this.settingsCalloutDefaultsApplied = true;
	}

	/**
	 * One quiet line for version and help links. Recent changelog bullets
	 * stay folded so the page does not open on a second card of release notes.
	 */
	private renderPageHeader(containerEl: HTMLElement): void {
		const banner = buildManifestBanner(
			this.plugin.manifest.version,
			changelogMarkdown,
			{ repoUrl: this.plugin.manifest.authorUrl },
		);
		const header = containerEl.createDiv({
			cls: "agent-client-settings-page-header",
		});
		header.createDiv({
			cls: "agent-client-settings-page-title",
			text: `${this.plugin.manifest.name} ${banner.label}`.trim(),
		});
		const links = header.createDiv({
			cls: "agent-client-settings-page-links",
		});
		links.createEl("a", {
			text: "Documentation",
			href: "https://rait-09.github.io/obsidian-agent-client/",
			attr: { target: "_blank" },
		});
		links.createSpan({
			cls: "agent-client-settings-page-sep",
			text: "·",
		});
		links.createEl("a", {
			text: "Releases",
			href: banner.releasesUrl,
			attr: { target: "_blank" },
		});

		if (banner.items.length === 0) {
			return;
		}

		this.renderSettingsCallout(
			containerEl,
			"whats-new",
			banner.heading,
			(bodyEl) => {
				const list = bodyEl.createEl("ul", {
					cls: "agent-client-settings-whats-new-list",
				});
				for (const item of banner.items) {
					list.createEl("li", { text: item });
				}
				if (banner.moreCount > 0) {
					const more = bodyEl.createDiv({
						cls: "agent-client-settings-whats-new-more",
					});
					more.createEl("a", {
						text: `${banner.moreCount} more on GitHub`,
						href: banner.releasesUrl,
						attr: { target: "_blank" },
					});
				}
			},
		);
	}

	/**
	 * Settings callout (top-level or nested). Open state is keyed in
	 * openSections as "settings:<id>". Defaults are seeded once per visit.
	 * Nested sections with foldable:false render as a static heading.
	 */
	private renderSettingsCallout(
		containerEl: HTMLElement,
		id: string,
		title: string,
		renderBody: (bodyEl: HTMLElement) => void,
		options?: {
			nested?: boolean;
			/** Default true. Nested callers should pass nestedFoldable(count). */
			foldable?: boolean;
			trailing?: string;
		},
	): void {
		const sectionId = `settings:${id}`;
		const foldable = options?.foldable !== false;
		const isOpen = foldable ? this.openSections.has(sectionId) : true;

		const calloutEl = containerEl.createDiv({
			cls: "agent-client-settings-callout",
		});
		if (options?.nested) {
			calloutEl.addClass("is-nested");
		}
		if (!foldable) {
			calloutEl.addClass("is-static");
		}
		calloutEl.toggleClass("is-open", isOpen);

		if (foldable) {
			const headerEl = calloutEl.createEl("button", {
				cls: "agent-client-settings-callout-header",
				attr: { type: "button", "aria-expanded": String(isOpen) },
			});
			const chevronEl = headerEl.createSpan({
				cls: "agent-client-settings-callout-chevron",
			});
			setIcon(chevronEl, "chevron-right");
			headerEl.createSpan({
				cls: "agent-client-settings-callout-title",
				text: title,
			});
			if (options?.trailing) {
				headerEl.createSpan({
					cls: "agent-client-settings-callout-trailing",
					text: options.trailing,
				});
			}

			const bodyEl = calloutEl.createDiv({
				cls: "agent-client-settings-callout-body",
			});
			bodyEl.toggleClass("is-collapsed", !isOpen);

			headerEl.addEventListener("click", () => {
				const open = !this.openSections.has(sectionId);
				if (open) {
					this.openSections.add(sectionId);
				} else {
					this.openSections.delete(sectionId);
				}
				headerEl.setAttribute("aria-expanded", String(open));
				calloutEl.toggleClass("is-open", open);
				bodyEl.toggleClass("is-collapsed", !open);
			});

			renderBody(bodyEl);
			return;
		}

		const headerEl = calloutEl.createDiv({
			cls: "agent-client-settings-callout-header is-static-header",
		});
		headerEl.createSpan({
			cls: "agent-client-settings-callout-title",
			text: title,
		});
		if (options?.trailing) {
			headerEl.createSpan({
				cls: "agent-client-settings-callout-trailing",
				text: options.trailing,
			});
		}

		const bodyEl = calloutEl.createDiv({
			cls: "agent-client-settings-callout-body",
		});
		renderBody(bodyEl);
	}

	private renderNodePathSetting(containerEl: HTMLElement): void {
		const nodePathSetting = new Setting(containerEl)
			.setName("Node.js path")
			.setDesc(
				"Absolute path to Node.js. Leave blank to use the login shell.",
			)
			.addText((text) => {
				text.setPlaceholder("Leave blank (login shell auto-resolves)")
					.setValue(this.plugin.settings.nodePath)
					.onChange(async (value) => {
						await this.plugin.settingsService.updateSettings({
							nodePath: value.trim(),
						});
					});
			});
		this.addAutoDetectButton(nodePathSetting, "node", async (path) => {
			await this.plugin.settingsService.updateSettings({
				nodePath: path,
			});
		});
	}

	private renderAgentsSection(containerEl: HTMLElement): void {
		const enabledCount =
			PRESET_AGENTS.filter((def) =>
				isAgentEnabled(
					this.plugin.settings.presetAgents[def.presetId] ?? {
						enabled: true,
					},
				),
			).length +
			this.plugin.settings.customAgents.filter((agent) =>
				isAgentEnabled(agent),
			).length;
		const trailingParts = [
			getCurrentAgent(this.plugin.settings).displayName,
			enabledCount === 1 ? "1 enabled" : `${enabledCount} enabled`,
		];
		if (Platform.isWin && this.plugin.settings.windowsWslMode) {
			trailingParts.push("WSL");
		}
		const trailing = trailingParts.join(" · ");
		this.renderSettingsCallout(
			containerEl,
			"agents",
			"Agents",
			(bodyEl) => {
				this.renderAgentSelector(bodyEl);

				if (Platform.isWin && this.plugin.settings.windowsWslMode) {
					bodyEl.createDiv({
						cls: "agent-client-settings-warning-callout",
						text: "WSL mode is on. Agents run inside your Linux distribution.",
					});
				}

				if (Platform.isWin) {
					new Setting(bodyEl)
						.setName("Enable WSL mode")
						.setDesc(
							"Run agents inside WSL when a CLI does not work in native Windows.",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(this.plugin.settings.windowsWslMode)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											windowsWslMode: value,
										},
									);
									this.renderContent();
								}),
						);

					if (this.plugin.settings.windowsWslMode) {
						new Setting(bodyEl)
							.setName("WSL distribution")
							.setDesc(
								"Distribution name, such as Ubuntu. Leave empty for the default.",
							)
							.addText((text) =>
								text
									.setPlaceholder("Leave empty for default")
									.setValue(
										this.plugin.settings
											.windowsWslDistribution || "",
									)
									.onChange(async (value) => {
										await this.plugin.settingsService.updateSettings(
											{
												windowsWslDistribution:
													value.trim() || undefined,
											},
										);
									}),
							);
					}
				}

				this.renderSettingsCallout(
					bodyEl,
					"hide-unused",
					"More",
					(nestedEl) => {
						new Setting(nestedEl)
							.setName("Hide unused agents")
							.setDesc("Hide disabled agents in the lists below.")
							.addToggle((toggle) =>
								toggle
									.setValue(
										this.plugin.settings.hideUnusedAgents,
									)
									.onChange(async (value) => {
										await this.plugin.settingsService.updateSettings(
											{
												hideUnusedAgents: value,
											},
										);
										this.renderContent();
									}),
							);
					},
					{
						nested: true,
						foldable: true,
						trailing: this.plugin.settings.hideUnusedAgents
							? "Hiding disabled"
							: "Showing all",
					},
				);

				bodyEl.createDiv({
					cls: "agent-client-settings-subhead",
					text: "Preset agents",
				});
				const sortedPresets = [...PRESET_AGENTS]
					.filter((def) => {
						if (!this.plugin.settings.hideUnusedAgents) {
							return true;
						}
						return isAgentEnabled(
							this.plugin.settings.presetAgents[def.presetId] ?? {
								enabled: true,
							},
						);
					})
					.sort((a, b) => {
						const aEnabled = isAgentEnabled(
							this.plugin.settings.presetAgents[a.presetId] ?? {
								enabled: true,
							},
						);
						const bEnabled = isAgentEnabled(
							this.plugin.settings.presetAgents[b.presetId] ?? {
								enabled: true,
							},
						);
						if (aEnabled === bEnabled) {
							return 0;
						}
						return aEnabled ? -1 : 1;
					});
				if (sortedPresets.length === 0) {
					bodyEl.createEl("p", {
						text: "No enabled preset agents. Turn off Hide unused agents to show disabled ones.",
						cls: "setting-item-description",
					});
				} else {
					for (const def of sortedPresets) {
						this.renderPresetSettings(bodyEl, def);
					}
				}

				bodyEl.createDiv({
					cls: "agent-client-settings-subhead",
					text: "Custom agents",
				});
				this.renderCustomAgents(bodyEl);
			},
			{ trailing },
		);
	}

	private renderComposerSection(containerEl: HTMLElement): void {
		const sendLabel =
			this.plugin.settings.sendMessageShortcut === "cmd-enter"
				? "Ctrl+Enter sends"
				: "Enter sends";
		this.renderSettingsCallout(containerEl, "composer", "Composer", (bodyEl) => {
			new Setting(bodyEl)
				.setName("Send message shortcut")
				.setDesc(
					"Key that sends a message. Cmd/Ctrl+Enter must be free under Settings > Hotkeys.",
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption(
							"enter",
							"Enter to send, Shift+Enter for newline",
						)
						.addOption(
							"cmd-enter",
							"Cmd/Ctrl+Enter to send, Enter for newline",
						)
						.setValue(this.plugin.settings.sendMessageShortcut)
						.onChange(async (value) => {
							await this.plugin.settingsService.updateSettings({
								sendMessageShortcut: value as
									| "enter"
									| "cmd-enter",
							});
						}),
				);

			this.renderSettingsCallout(
				bodyEl,
				"mentions",
				"Mentions & context",
				(nestedEl) => {
					new Setting(nestedEl)
						.setName("Auto-mention active note")
						.setDesc(
							"Attach the current note to each message without typing @.",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.autoMentionActiveNote,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											autoMentionActiveNote: value,
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Expand wikilink context")
						.setDesc(
							"List [[wikilinks]] inside mentioned notes as file paths. Does not insert the linked text.",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.expandWikilinkContext,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											expandWikilinkContext: value,
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Max note length")
						.setDesc(
							"Maximum characters per mentioned note. Notes longer than this will be truncated.",
						)
						.addText((text) =>
							text
								.setPlaceholder("10000")
								.setValue(
									String(
										this.plugin.settings.displaySettings
											.maxNoteLength,
									),
								)
								.onChange(async (value) => {
									const num = parseInt(value, 10);
									if (!isNaN(num) && num >= 1) {
										await this.plugin.settingsService.updateSettings(
											{
												displaySettings: {
													...this.plugin.settings
														.displaySettings,
													maxNoteLength: num,
												},
											},
										);
									}
								}),
						);

					new Setting(nestedEl)
						.setName("Max selection length")
						.setDesc(
							"Maximum characters for text selection in auto-mention. Selections longer than this will be truncated.",
						)
						.addText((text) =>
							text
								.setPlaceholder("10000")
								.setValue(
									String(
										this.plugin.settings.displaySettings
											.maxSelectionLength,
									),
								)
								.onChange(async (value) => {
									const num = parseInt(value, 10);
									if (!isNaN(num) && num >= 1) {
										await this.plugin.settingsService.updateSettings(
											{
												displaySettings: {
													...this.plugin.settings
														.displaySettings,
													maxSelectionLength: num,
												},
											},
										);
									}
								}),
						);
				},
				{ nested: true, foldable: nestedFoldable(4) },
			);
		}, { trailing: sendLabel });
	}

	private renderAppearanceSection(containerEl: HTMLElement): void {
		const locationLabels: Record<string, string> = {
			"right-tab": "Right pane",
			"right-split": "Right split",
			"editor-tab": "Editor",
			"editor-split": "Editor split",
		};
		this.renderSettingsCallout(
			containerEl,
			"appearance",
			"Appearance",
			(nestedEl) => {
					new Setting(nestedEl)
						.setName("Chat view location")
						.setDesc("Where to open new chat views")
						.addDropdown((dropdown) =>
							dropdown
								.addOption("right-tab", "Right pane (tabs)")
								.addOption("right-split", "Right pane (split)")
								.addOption("editor-tab", "Editor area (tabs)")
								.addOption(
									"editor-split",
									"Editor area (split)",
								)
								.setValue(this.plugin.settings.chatViewLocation)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											chatViewLocation:
												value as ChatViewLocation,
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Chat font size")
						.setDesc(
							`Adjust the font size of the chat message area (${CHAT_FONT_SIZE_MIN}-${CHAT_FONT_SIZE_MAX}px).`,
						)
						.addText((text) => {
							const getCurrentDisplayValue = (): string => {
								const currentFontSize =
									this.plugin.settings.displaySettings
										.fontSize;
								return currentFontSize === null
									? ""
									: String(currentFontSize);
							};

							const persistChatFontSize = async (
								fontSize: number | null,
							): Promise<void> => {
								if (
									this.plugin.settings.displaySettings
										.fontSize === fontSize
								) {
									return;
								}

								const nextSettings = {
									...this.plugin.settings,
									displaySettings: {
										...this.plugin.settings.displaySettings,
										fontSize,
									},
								};
								await this.plugin.saveSettingsAndNotify(
									nextSettings,
								);
							};

							text.setPlaceholder(
								`${CHAT_FONT_SIZE_MIN}-${CHAT_FONT_SIZE_MAX}`,
							)
								.setValue(getCurrentDisplayValue())
								.onChange(async (value) => {
									if (value.trim().length === 0) {
										await persistChatFontSize(null);
										return;
									}

									const trimmedValue = value.trim();
									if (!/^-?\d+$/.test(trimmedValue)) {
										return;
									}

									const numericValue = Number.parseInt(
										trimmedValue,
										10,
									);
									if (
										numericValue < CHAT_FONT_SIZE_MIN ||
										numericValue > CHAT_FONT_SIZE_MAX
									) {
										return;
									}

									const parsedFontSize =
										parseChatFontSize(numericValue);
									if (parsedFontSize === null) {
										return;
									}

									const hasChanged =
										this.plugin.settings.displaySettings
											.fontSize !== parsedFontSize;
									if (hasChanged) {
										await persistChatFontSize(
											parsedFontSize,
										);
									}
								});

							text.inputEl.addEventListener("blur", () => {
								const currentInputValue = text.getValue();
								const parsedFontSize =
									parseChatFontSize(currentInputValue);

								if (
									currentInputValue.trim().length > 0 &&
									parsedFontSize === null
								) {
									text.setValue(getCurrentDisplayValue());
									return;
								}

								if (parsedFontSize !== null) {
									text.setValue(String(parsedFontSize));
									const hasChanged =
										this.plugin.settings.displaySettings
											.fontSize !== parsedFontSize;
									if (hasChanged) {
										void persistChatFontSize(
											parsedFontSize,
										);
									}
									return;
								}

								text.setValue("");
							});
						});

					new Setting(nestedEl)
						.setName("Verbosity level")
						.setDesc(TRACE_VERBOSITY_SUMMARY)
						.addDropdown((dropdown) =>
							dropdown
								.addOption("hidden", TRACE_VERBOSITY_LABELS.hidden)
								.addOption(
									"compact",
									TRACE_VERBOSITY_LABELS.compact,
								)
								.addOption("full", TRACE_VERBOSITY_LABELS.full)
								.setValue(
									this.plugin.settings.displaySettings
										.traceVerbosity,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											displaySettings: {
												...this.plugin.settings
													.displaySettings,
												traceVerbosity:
													value as TraceVerbosity,
											},
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Show emojis")
						.setDesc(
							"Display emoji icons in tool calls, thoughts, plans, and terminal blocks.",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.displaySettings
										.showEmojis,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											displaySettings: {
												...this.plugin.settings
													.displaySettings,
												showEmojis: value,
											},
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Auto-collapse long diffs")
						.setDesc(
							"Automatically collapse diffs that exceed the line threshold.",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.displaySettings
										.autoCollapseDiffs,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											displaySettings: {
												...this.plugin.settings
													.displaySettings,
												autoCollapseDiffs: value,
											},
										},
									);
									this.renderContent();
								}),
						);

					if (this.plugin.settings.displaySettings.autoCollapseDiffs) {
						new Setting(nestedEl)
							.setName("Collapse threshold")
							.setDesc(
								"Diffs with more lines than this will be collapsed by default.",
							)
							.addText((text) =>
								text
									.setPlaceholder("10")
									.setValue(
										String(
											this.plugin.settings.displaySettings
												.diffCollapseThreshold,
										),
									)
									.onChange(async (value) => {
										const num = parseInt(value, 10);
										if (!isNaN(num) && num > 0) {
											await this.plugin.settingsService.updateSettings(
												{
													displaySettings: {
														...this.plugin.settings
															.displaySettings,
														diffCollapseThreshold:
															num,
													},
												},
											);
										}
									}),
							);
					}
			}, {
				trailing:
					locationLabels[this.plugin.settings.chatViewLocation] ??
					"Right pane",
			});
	}

	private renderFloatingChatSection(containerEl: HTMLElement): void {
		this.idleOpacitySlider = null;
		this.idleOpacityText = null;
		this.idleTransparencyToggle = null;
		const entry = this.plugin.settings.floatingChatEntry;
		const trailing =
			entry === "off"
				? "Off"
				: entry === "button"
					? "Button"
					: entry === "status-bar"
						? "Status bar"
						: "Commands";

		this.renderSettingsCallout(
			containerEl,
			"floating-chat",
			"Floating chat",
			(bodyEl) => {
				new Setting(bodyEl)
					.setName("Floating chat")
					.setDesc(
						"Choose how to open floating chat: floating button, status bar, or commands only.",
					)
					.addDropdown((dropdown) =>
						dropdown
							.addOption("off", "Off")
							.addOption("button", "Floating button")
							.addOption("status-bar", "Status bar")
							.addOption("commands", "Commands only")
							.setValue(this.plugin.settings.floatingChatEntry)
							.onChange(async (value) => {
								const next = value as
									| "off"
									| "button"
									| "status-bar"
									| "commands";
								const wasEnabled =
									this.plugin.isFloatingChatEnabled();
								await this.plugin.settingsService.updateSettings(
									{
										floatingChatEntry: next,
									},
								);

								const isEnabled = next !== "off";
								if (isEnabled && !wasEnabled) {
									this.plugin.openNewFloatingChat();
									this.openSections.add(
										"settings:floating-chat",
									);
								} else if (!isEnabled && wasEnabled) {
									const instances =
										this.plugin.getFloatingChatInstances();
									for (const instanceId of instances) {
										this.plugin.closeFloatingChat(
											instanceId,
										);
									}
								}
								this.renderContent();
							}),
					);

				new Setting(bodyEl)
					.setName("Enable floating chat tabs")
					.setDesc(
						"Group multiple floating chats as tabs in one window. Focus next/previous still cycles each chat.",
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.enableFloatingChatTabs,
							)
							.setDisabled(!this.plugin.isFloatingChatEnabled())
							.onChange(async (value) => {
								await this.plugin.settingsService.updateSettings(
									{
										enableFloatingChatTabs: value,
									},
								);
							}),
					);

				new Setting(bodyEl)
					.setName("One-key toggle")
					.setDesc(
						"When on, the Toggle floating chat command opens or minimizes with the same hotkey. Turn off to use separate Open and Minimize hotkeys.",
					)
					.addToggle((toggle) =>
						toggle
							.setValue(
								this.plugin.settings.floatingChatOneKeyToggle,
							)
							.setDisabled(!this.plugin.isFloatingChatEnabled())
							.onChange(async (value) => {
								await this.plugin.settingsService.updateSettings(
									{
										floatingChatOneKeyToggle: value,
									},
								);
							}),
					);

				this.renderSettingsCallout(
					bodyEl,
					"floating-appearance",
					"Window & button appearance",
					(nestedEl) => {
						new Setting(nestedEl)
							.setName("Floating button image")
							.setDesc(
								"URL or path to an image for the floating button. Leave empty for default icon. Only applies when Floating chat is set to Floating button.",
							)
							.addText((text) =>
								text
									.setPlaceholder(
										"https://example.com/avatar.png",
									)
									.setValue(
										this.plugin.settings
											.floatingButtonImage,
									)
									.setDisabled(
										this.plugin.settings
											.floatingChatEntry !== "button",
									)
									.onChange(async (value) => {
										await this.plugin.settingsService.updateSettings(
											{
												floatingButtonImage:
													value.trim(),
											},
										);
									}),
							);

						new Setting(nestedEl)
							.setName("Default window width")
							.setDesc(
								`Used on this device when no last window size is saved (${FLOATING_WINDOW_SIZE_MIN.width}-${FLOATING_WINDOW_SIZE_MAX.width}px). Drag and resize are remembered per device.`,
							)
							.addText((text) =>
								text
									.setPlaceholder(
										String(
											FLOATING_WINDOW_SIZE_MIN.width,
										),
									)
									.setValue(
										String(
											this.plugin.settings
												.floatingWindowDefaultSize
												.width,
										),
									)
									.setDisabled(
										!this.plugin.isFloatingChatEnabled(),
									)
									.onChange(async (value) => {
										const parsed = parseInt(value, 10);
										if (isNaN(parsed)) return;
										const next = clampFloatingWindowSize({
											width: parsed,
											height: this.plugin.settings
												.floatingWindowDefaultSize
												.height,
										});
										await this.plugin.settingsService.updateSettings(
											{
												floatingWindowDefaultSize:
													next,
											},
										);
									}),
							);

						new Setting(nestedEl)
							.setName("Default window height")
							.setDesc(
								`Used on this device when no last window size is saved (${FLOATING_WINDOW_SIZE_MIN.height}-${FLOATING_WINDOW_SIZE_MAX.height}px).`,
							)
							.addText((text) =>
								text
									.setPlaceholder(
										String(
											FLOATING_WINDOW_SIZE_MIN.height,
										),
									)
									.setValue(
										String(
											this.plugin.settings
												.floatingWindowDefaultSize
												.height,
										),
									)
									.setDisabled(
										!this.plugin.isFloatingChatEnabled(),
									)
									.onChange(async (value) => {
										const parsed = parseInt(value, 10);
										if (isNaN(parsed)) return;
										const next = clampFloatingWindowSize({
											width: this.plugin.settings
												.floatingWindowDefaultSize
												.width,
											height: parsed,
										});
										await this.plugin.settingsService.updateSettings(
											{
												floatingWindowDefaultSize:
													next,
											},
										);
									}),
							);

						const idleFadeEnabled =
							this.plugin.settings.floatingIdleTimeoutMs > 0;
						const idleOpacityDisabled =
							!this.plugin.isFloatingChatEnabled() ||
							!idleFadeEnabled;

						new Setting(nestedEl)
							.setName("Idle fade delay (ms)")
							.setDesc(
								`Fade the floating window this many ms after you leave it (pointer out, no focus inside). Hover, scroll, focus, or active voice recording keeps it opaque. Set to 0 to disable (max ${FLOATING_IDLE_TIMEOUT_MAX_MS}). Also toggled from the floating chat header.`,
							)
							.addText((text) =>
								text
									.setPlaceholder("0")
									.setValue(
										String(
											this.plugin.settings
												.floatingIdleTimeoutMs,
										),
									)
									.setDisabled(
										!this.plugin.isFloatingChatEnabled(),
									)
									.onChange(async (value) => {
										const parsed = parseInt(value, 10);
										if (isNaN(parsed)) return;
										const next =
											clampFloatingIdleTimeoutMs(parsed);
										await this.plugin.settingsService.updateSettings(
											{
												floatingIdleTimeoutMs: next,
											},
										);
										this.setIdleOpacityControlsEnabled(
											next > 0,
										);
									}),
							);

						const applyIdleOpacity = async (
							value: number,
						): Promise<void> => {
							const next =
								clampFloatingIdleOpacityPercent(value);
							await this.plugin.settingsService.updateSettings({
								floatingIdleOpacityPercent: next,
							});
							this.idleOpacitySlider?.setValue(next);
							this.idleOpacityText?.setValue(String(next));
						};

						new Setting(nestedEl)
							.setName("Idle opacity (%)")
							.setDesc(
								`How visible the window stays when faded (${FLOATING_IDLE_OPACITY_MIN}–${FLOATING_IDLE_OPACITY_MAX}). Lower values are more transparent. Disabled when fade delay is 0.`,
							)
							.addSlider((slider) => {
								this.idleOpacitySlider = slider;
								slider
									.setLimits(
										FLOATING_IDLE_OPACITY_MIN,
										FLOATING_IDLE_OPACITY_MAX,
										5,
									)
									.setValue(
										this.plugin.settings
											.floatingIdleOpacityPercent,
									)
									.setDynamicTooltip()
									.setDisabled(idleOpacityDisabled)
									.onChange(applyIdleOpacity);
							})
							.addText((text) => {
								this.idleOpacityText = text;
								text
									.setPlaceholder(
										String(FLOATING_IDLE_OPACITY_MIN),
									)
									.setValue(
										String(
											this.plugin.settings
												.floatingIdleOpacityPercent,
										),
									)
									.setDisabled(idleOpacityDisabled)
									.onChange(async (value) => {
										const parsed = parseInt(value, 10);
										if (isNaN(parsed)) return;
										await applyIdleOpacity(parsed);
									});
							});

						new Setting(nestedEl)
							.setName("Transparency mode")
							.setDesc(
								"Fade floating windows when idle. Turn off to keep every floating window fully opaque. Also toggled from the floating chat header.",
							)
							.addToggle((toggle) => {
								this.idleTransparencyToggle = toggle;
								toggle
									.setValue(
										this.plugin.settings
											.floatingTransparencyMode,
									)
									.setDisabled(idleOpacityDisabled)
									.onChange(async (value) => {
										await this.plugin.settingsService.updateSettings(
											{
												floatingTransparencyMode:
													value,
											},
										);
									});
							});
					},
					{ nested: true, foldable: nestedFoldable(6) },
				);
			},
			{ trailing },
		);
	}

	private setIdleOpacityControlsEnabled(enabled: boolean): void {
		const disabled =
			!enabled || !this.plugin.isFloatingChatEnabled();
		this.idleOpacitySlider?.setDisabled(disabled);
		this.idleOpacityText?.setDisabled(disabled);
		this.idleTransparencyToggle?.setDisabled(disabled);
	}

	private renderBehaviorSection(containerEl: HTMLElement): void {
		this.renderSettingsCallout(containerEl, "behavior", "Behavior", (bodyEl) => {
			new Setting(bodyEl)
				.setName("Auto-allow permissions")
				.setDesc(
					"Allow every permission request without asking. Agents can then change files and run commands.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.autoAllowPermissions)
						.onChange(async (value) => {
							await this.plugin.settingsService.updateSettings({
								autoAllowPermissions: value,
							});
							this.plugin.updateAllAutoAllow(value);
						}),
				);

			new Setting(bodyEl)
				.setName("System notifications")
				.setDesc(
					"Notify when a reply finishes or a permission is waiting, unless Obsidian is focused.",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(
							this.plugin.settings.enableSystemNotifications,
						)
						.onChange(async (value) => {
							await this.plugin.settingsService.updateSettings({
								enableSystemNotifications: value,
							});
						}),
				);

		}, {
			trailing:
				[
					this.plugin.settings.autoAllowPermissions
						? "Auto-allow"
						: "",
					this.plugin.settings.enableSystemNotifications
						? "Notifications"
						: "",
				]
					.filter(Boolean)
					.join(" · ") || undefined,
		});
	}

	private renderReplyFormattingSection(containerEl: HTMLElement): void {
		this.renderSettingsCallout(
			containerEl,
			"reply-formatting",
			"Reply formatting",
			(nestedEl) => {
					new Setting(nestedEl)
						.setName("Inject Obsidian Markdown instructions")
						.setDesc(
							"Include formatting guidance in the first message of each session so agents produce Obsidian-compatible Markdown.",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.promptInjection
										.enabled,
								)
								.onChange(async (value) => {
									this.plugin.settings.promptInjection.enabled =
										value;
									await this.plugin.saveSettings();
									this.renderContent();
								}),
						);

					if (this.plugin.settings.promptInjection.enabled) {
						new Setting(nestedEl)
							.setName("Wikilink formatting")
							.setDesc(
								"Ask agents to write note links as [[Note Name]].",
							)
							.addToggle((toggle) =>
								toggle
									.setValue(
										this.plugin.settings.promptInjection
											.wikiLinks,
									)
									.onChange(async (value) => {
										this.plugin.settings.promptInjection.wikiLinks =
											value;
										await this.plugin.saveSettings();
									}),
							);

						new Setting(nestedEl)
							.setName("Markdown table spacing")
							.setDesc(
								"Instruct agents to leave a blank line before Markdown tables so Obsidian renders them correctly.",
							)
							.addToggle((toggle) =>
								toggle
									.setValue(
										this.plugin.settings.promptInjection
											.tables,
									)
									.onChange(async (value) => {
										this.plugin.settings.promptInjection.tables =
											value;
										await this.plugin.saveSettings();
									}),
							);

						new Setting(nestedEl)
							.setName("LaTeX math formatting")
							.setDesc(
								"Instruct agents to use $...$ and $$...$$ delimiters for math expressions.",
							)
							.addToggle((toggle) =>
								toggle
									.setValue(
										this.plugin.settings.promptInjection
											.latex,
									)
									.onChange(async (value) => {
										this.plugin.settings.promptInjection.latex =
											value;
										await this.plugin.saveSettings();
									}),
							);
					}
				},
			{
				trailing: this.plugin.settings.promptInjection.enabled
					? "On"
					: "Off",
			},
		);
	}

	private renderExportSection(containerEl: HTMLElement): void {
		this.renderSettingsCallout(containerEl, "export", "Export", (bodyEl) => {
			new Setting(bodyEl)
				.setName("Export folder")
				.setDesc("Folder where chat exports will be saved")
				.addText((text) =>
					text
						.setPlaceholder("Agent Client")
						.setValue(
							this.plugin.settings.exportSettings.defaultFolder,
						)
						.onChange(async (value) => {
							await this.plugin.settingsService.updateSettings({
								exportSettings: {
									...this.plugin.settings.exportSettings,
									defaultFolder: value,
								},
							});
						}),
				);

			this.renderSettingsCallout(
				bodyEl,
				"export-note-format",
				"Note format",
				(nestedEl) => {
					new Setting(nestedEl)
						.setName("Filename")
						.setDesc(
							"Template for exported filenames. Use {date} for date and {time} for time.",
						)
						.addText((text) =>
							text
								.setPlaceholder("agent_client_{date}_{time}")
								.setValue(
									this.plugin.settings.exportSettings
										.filenameTemplate,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											exportSettings: {
												...this.plugin.settings
													.exportSettings,
												filenameTemplate: value,
											},
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Frontmatter tag")
						.setDesc(
							"Tag added to exported notes. Leave empty to skip the tag.",
						)
						.addText((text) =>
							text
								.setPlaceholder("agent-client")
								.setValue(
									this.plugin.settings.exportSettings
										.frontmatterTag,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											exportSettings: {
												...this.plugin.settings
													.exportSettings,
												frontmatterTag: value,
											},
										},
									);
								}),
						);
				},
				{ nested: true, foldable: true },
			);

			this.renderSettingsCallout(
				bodyEl,
				"export-images",
				"Images & automation",
				(nestedEl) => {
					new Setting(nestedEl)
						.setName("Include images")
						.setDesc("Include images in exported markdown files")
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.exportSettings
										.includeImages,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											exportSettings: {
												...this.plugin.settings
													.exportSettings,
												includeImages: value,
											},
										},
									);
									this.renderContent();
								}),
						);

					if (this.plugin.settings.exportSettings.includeImages) {
						new Setting(nestedEl)
							.setName("Image location")
							.setDesc("Where to save exported images")
							.addDropdown((dropdown) =>
								dropdown
									.addOption(
										"obsidian",
										"Use Obsidian's attachment setting",
									)
									.addOption(
										"custom",
										"Save to custom folder",
									)
									.addOption(
										"base64",
										"Embed as Base64 (not recommended)",
									)
									.setValue(
										this.plugin.settings.exportSettings
											.imageLocation,
									)
									.onChange(async (value) => {
										await this.plugin.settingsService.updateSettings(
											{
												exportSettings: {
													...this.plugin.settings
														.exportSettings,
													imageLocation: value as
														| "obsidian"
														| "custom"
														| "base64",
												},
											},
										);
										this.renderContent();
									}),
							);

						if (
							this.plugin.settings.exportSettings
								.imageLocation === "custom"
						) {
							new Setting(nestedEl)
								.setName("Custom image folder")
								.setDesc(
									"Folder path for exported images (relative to vault root)",
								)
								.addText((text) =>
									text
										.setPlaceholder("Agent Client")
										.setValue(
											this.plugin.settings.exportSettings
												.imageCustomFolder,
										)
										.onChange(async (value) => {
											await this.plugin.settingsService.updateSettings(
												{
													exportSettings: {
														...this.plugin.settings
															.exportSettings,
														imageCustomFolder:
															value,
													},
												},
											);
										}),
								);
						}
					}

					new Setting(nestedEl)
						.setName("Auto-export on new chat")
						.setDesc(
							"Automatically export the current chat when starting a new chat",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.exportSettings
										.autoExportOnNewChat,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											exportSettings: {
												...this.plugin.settings
													.exportSettings,
												autoExportOnNewChat: value,
											},
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Auto-export on close chat")
						.setDesc(
							"Automatically export the current chat when closing the chat view",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.exportSettings
										.autoExportOnCloseChat,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											exportSettings: {
												...this.plugin.settings
													.exportSettings,
												autoExportOnCloseChat: value,
											},
										},
									);
								}),
						);

					new Setting(nestedEl)
						.setName("Open note after export")
						.setDesc(
							"Automatically open the exported note after exporting",
						)
						.addToggle((toggle) =>
							toggle
								.setValue(
									this.plugin.settings.exportSettings
										.openFileAfterExport,
								)
								.onChange(async (value) => {
									await this.plugin.settingsService.updateSettings(
										{
											exportSettings: {
												...this.plugin.settings
													.exportSettings,
												openFileAfterExport: value,
											},
										},
									);
								}),
						);
				},
				{ nested: true, foldable: nestedFoldable(4) },
			);
		}, {
			trailing:
				this.plugin.settings.exportSettings.defaultFolder.trim() ||
				undefined,
		});
	}

	private renderVoiceInputSection(containerEl: HTMLElement): void {
		this.renderSettingsCallout(
			containerEl,
			"voice-input",
			"Voice input",
			(bodyEl) => {
				new Setting(bodyEl)
					.setName("Enable voice input")
					.setDesc(
						"Show a microphone button on the chat input for live transcription.",
					)
					.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.voiceInput.enabled)
							.onChange(async (value) => {
								this.plugin.settings.voiceInput.enabled =
									value;
								await this.plugin.saveSettings();
								if (value) {
									this.openSections.add(
										"settings:voice-input",
									);
								}
								this.renderContent();
							}),
					);

				if (this.plugin.settings.voiceInput.enabled) {
					new Setting(bodyEl)
						.setName("Gemini API key")
						.setDesc(
							"Your Google AI Studio API key for Gemini Live transcription.",
						)
						.addComponent((el) => {
							const secretId = VOICE_INPUT_SECRET_ID;
							const currentValue =
								this.plugin.app.secretStorage.getSecret(
									secretId,
								) ?? "";
							const secret = new SecretComponent(this.app, el);
							secret
								.setValue(
									currentValue
										? secretId
										: this.plugin.settings.voiceInput
												.geminiApiKeySecretId,
								)
								.onChange(async (value) => {
									if (value.trim()) {
										this.plugin.app.secretStorage.setSecret(
											secretId,
											value.trim(),
										);
										this.plugin.settings.voiceInput.geminiApiKeySecretId =
											secretId;
									}
									await this.plugin.saveSettings();
								});
							return secret;
						});

					new Setting(bodyEl)
						.setName("Model")
						.setDesc(
							"Gemini Live model name (e.g. gemini-3.5-transcribe-live).",
						)
						.addText((text) =>
							text
								.setPlaceholder("gemini-3.5-transcribe-live")
								.setValue(
									this.plugin.settings.voiceInput.model,
								)
								.onChange(async (value) => {
									this.plugin.settings.voiceInput.model =
										value.trim() ||
										"gemini-3.5-transcribe-live";
									await this.plugin.saveSettings();
								}),
						);

					new Setting(bodyEl)
						.setName("Transcription mode")
						.setDesc(
							"Smart mode for clean transcripts, verbatim for exact word-for-word.",
						)
						.addDropdown((dropdown) =>
							dropdown
								.addOption("smart", "Smart")
								.addOption("verbatim", "Verbatim")
								.setValue(
									this.plugin.settings.voiceInput
										.transcriptionMode,
								)
								.onChange(async (value) => {
									this.plugin.settings.voiceInput.transcriptionMode =
										value as "smart" | "verbatim";
									await this.plugin.saveSettings();
								}),
						);

					new Setting(bodyEl)
						.setName("Language codes")
						.setDesc(
							"Comma-separated BCP-47 language codes (e.g. en-US, fr-CA). Leave empty for auto-detect.",
						)
						.addText((text) =>
							text
								.setPlaceholder("en-US, fr-CA")
								.setValue(
									this.plugin.settings.voiceInput
										.languageCodes,
								)
								.onChange(async (value) => {
									this.plugin.settings.voiceInput.languageCodes =
										value;
									await this.plugin.saveSettings();
								}),
						);

					new Setting(bodyEl)
						.setName("Custom vocabulary")
						.setDesc(
							"Names and jargon for Gemini to recognize. Applies on the next voice session.",
						)
						.addTextArea((text) => {
							text
								.setPlaceholder(
									"Obsidian\nKubernetes\nZyntriQix",
								)
								.setValue(
									this.plugin.settings.voiceInput
										.customVocabulary,
								)
								.onChange(async (value) => {
									this.plugin.settings.voiceInput.customVocabulary =
										value;
									await this.plugin.saveSettings();
								});
							text.inputEl.rows = 2;
						});

					new Setting(bodyEl)
						.setName("Pause tolerance")
						.setDesc(
							"Silence length before a phrase ends. Longer keeps mid-sentence pauses together.",
						)
						.addDropdown((dropdown) => {
							dropdown
								.addOption("1000", "Short (1 s)")
								.addOption("1500", "Medium (1.5 s)")
								.addOption("2000", "Long (2 s, default)")
								.addOption("2500", "Relaxed (2.5 s)")
								.addOption("3000", "Very long (3 s)")
								.setValue(
									String(
										this.plugin.settings.voiceInput
											.silenceDurationMs,
									),
								)
								.onChange(async (value) => {
									this.plugin.settings.voiceInput.silenceDurationMs =
										Number(value) || 2000;
									await this.plugin.saveSettings();
								});
						});

					new Setting(bodyEl)
						.setName("Stop flush delay (ms)")
						.setDesc(
							"Wait after Stop so the last words are not cut off. 0 skips the wait.",
						)
						.addText((text) =>
							text
								.setPlaceholder("1000")
								.setValue(
									String(
										this.plugin.settings.voiceInput
											.flushDelayMs,
									),
								)
								.onChange(async (value) => {
									const parsed = Number.parseInt(
										value.trim(),
										10,
									);
									this.plugin.settings.voiceInput.flushDelayMs =
										Number.isFinite(parsed) ? parsed : 1000;
									await this.plugin.saveSettings();
								}),
						);

				}
			},
			{
				trailing: this.plugin.settings.voiceInput.enabled
					? "On"
					: "Off",
			},
		);
	}

	private renderAdvancedSection(containerEl: HTMLElement): void {
		const trailing = this.plugin.settings.debugMode
			? "Debug on"
			: undefined;
		this.renderSettingsCallout(
			containerEl,
			"advanced",
			"Advanced",
			(bodyEl) => {
				this.renderNodePathSetting(bodyEl);
				this.renderSpeechDetection(bodyEl);
				new Setting(bodyEl)
					.setName("Debug mode")
					.setDesc(
						"Log ACP connection details in the developer console.",
					)
					.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.debugMode)
							.onChange(async (value) => {
								await this.plugin.settingsService.updateSettings(
									{
										debugMode: value,
									},
								);
							}),
					);
			},
			{ trailing },
		);
	}

	private renderSpeechDetection(containerEl: HTMLElement): void {
		this.renderSettingsCallout(
			containerEl,
			"speech-detection",
			"Speech detection",
			(nestedEl) => {
				new Setting(nestedEl)
					.setName("Prefix padding (ms)")
					.setDesc("Audio included before detected speech starts.")
					.addText((text) =>
						text
							.setPlaceholder("300")
							.setValue(
								String(
									this.plugin.settings.voiceInput
										.prefixPaddingMs,
								),
							)
							.onChange(async (value) => {
								const parsed = Number.parseInt(value.trim(), 10);
								this.plugin.settings.voiceInput.prefixPaddingMs =
									Number.isFinite(parsed) ? parsed : 300;
								await this.plugin.saveSettings();
							}),
					);

				new Setting(nestedEl)
					.setName("Start-of-speech sensitivity")
					.setDesc(
						"High reacts quickly when you begin speaking. Low waits for clearer speech.",
					)
					.addDropdown((dropdown) =>
						dropdown
							.addOption("START_SENSITIVITY_HIGH", "High (default)")
							.addOption("START_SENSITIVITY_LOW", "Low")
							.setValue(
								this.plugin.settings.voiceInput
									.startOfSpeechSensitivity,
							)
							.onChange(async (value) => {
								this.plugin.settings.voiceInput.startOfSpeechSensitivity =
									value as
										| "START_SENSITIVITY_HIGH"
										| "START_SENSITIVITY_LOW";
								await this.plugin.saveSettings();
							}),
					);

				new Setting(nestedEl)
					.setName("End-of-speech sensitivity")
					.setDesc(
						"Low tolerates longer pauses. High ends a phrase sooner.",
					)
					.addDropdown((dropdown) =>
						dropdown
							.addOption(
								"END_SENSITIVITY_LOW",
								"Low (default, pause tolerant)",
							)
							.addOption("END_SENSITIVITY_HIGH", "High")
							.setValue(
								this.plugin.settings.voiceInput
									.endOfSpeechSensitivity,
							)
							.onChange(async (value) => {
								this.plugin.settings.voiceInput.endOfSpeechSensitivity =
									value as
										| "END_SENSITIVITY_LOW"
										| "END_SENSITIVITY_HIGH";
								await this.plugin.saveSettings();
							}),
					);
			},
			{ nested: true, foldable: true },
		);
	}

	/**
	 * Update the agent dropdown when settings change.
	 * Only updates if the value is different to avoid infinite loops.
	 */
	private updateAgentDropdown(): void {
		if (!this.agentSelector) {
			return;
		}

		// Get latest settings from store snapshot
		const settings = this.plugin.settingsService.getSnapshot();
		const currentValue = this.agentSelector.getValue();

		// Only update if different to avoid triggering onChange
		if (settings.defaultAgentId !== currentValue) {
			this.agentSelector.setValue(settings.defaultAgentId);
		}
	}

	/**
	 * Called when the settings tab is hidden.
	 * Clean up subscriptions to prevent memory leaks.
	 */
	hide(): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.openSections.clear();
		this.settingsCalloutDefaultsApplied = false;
	}

	private renderAgentSelector(containerEl: HTMLElement) {
		this.plugin.ensureDefaultAgentId();

		new Setting(containerEl)
			.setName("Default agent")
			.setDesc(
				this.plugin.settings.defaultAgentPerDevice
					? "Used when opening a new chat view on this computer only."
					: "Used when opening a new chat view on every device (synced).",
			)
			.addDropdown((dropdown) => {
				this.agentSelector = dropdown;
				this.populateAgentDropdown(dropdown);
				dropdown.setValue(this.plugin.settings.defaultAgentId);
				dropdown.onChange(async (value) => {
					const nextSettings = {
						...this.plugin.settings,
						defaultAgentId: value,
					};
					this.plugin.ensureDefaultAgentId();
					await this.plugin.saveSettingsAndNotify(nextSettings);
				});
			});

		new Setting(containerEl)
			.setName("Default agent scope")
			.setDesc(
				"All devices syncs the default. This device only stays on this computer.",
			)
			.addDropdown((dropdown) => {
				dropdown.addOption("shared", "All devices (sync)");
				dropdown.addOption("device", "This device only");
				dropdown.setValue(
					this.plugin.settings.defaultAgentPerDevice
						? "device"
						: "shared",
				);
				dropdown.onChange(async (value) => {
					await this.plugin.setDefaultAgentPerDevice(
						value === "device",
					);
					this.renderContent();
				});
			});
	}

	private populateAgentDropdown(dropdown: DropdownComponent) {
		dropdown.selectEl.empty();
		for (const option of this.getAgentOptions()) {
			dropdown.addOption(option.id, option.label);
		}
	}

	private refreshAgentDropdown() {
		if (!this.agentSelector) {
			return;
		}
		this.populateAgentDropdown(this.agentSelector);
		this.agentSelector.setValue(this.plugin.settings.defaultAgentId);
	}

	private getAgentOptions(): { id: string; label: string }[] {
		// Default-agent candidates come from the enabled enumeration —
		// disabled agents can't be picked as the default.
		const options = getAvailableAgentsFromSettings(
			this.plugin.settings,
		).map(({ id, displayName }) => ({
			id,
			label: `${displayName} (${id})`,
		}));
		const seen = new Set<string>();
		return options.filter(({ id }) => {
			if (seen.has(id)) {
				return false;
			}
			seen.add(id);
			return true;
		});
	}

	/** True when `agentId` is the only agent still enabled. */
	private isLastEnabledAgent(agentId: string): boolean {
		const enabled = getAvailableAgentsFromSettings(this.plugin.settings);
		return enabled.length === 1 && enabled[0].id === agentId;
	}

	/**
	 * Move a custom section's open state when its agent id changes. Without
	 * this, a section renamed while open stays keyed under the old id and
	 * the next renderContent() collapses it mid-edit.
	 */
	private rekeyOpenSection(oldId: string, newId: string): void {
		if (oldId === newId) {
			return;
		}
		if (this.openSections.delete(`custom:${oldId}`)) {
			this.openSections.add(`custom:${newId}`);
		}
	}

	/**
	 * "Enabled" toggle rendered into an agent section's summary row.
	 * Refuses to disable the last enabled agent (Notice + revert). After the
	 * write, re-validates the default agent and refreshes the default-agent
	 * dropdown in place — no renderContent(), so open sections, scroll,
	 * and focus are kept.
	 */
	private addEnabledToggleControl(
		parentEl: HTMLElement,
		// Resolved at interaction time: a custom agent's id can be renamed
		// after this row rendered (the id editor commits per keystroke).
		getAgentId: () => string | undefined,
		currentValue: boolean,
		writer: { write: (value: boolean) => Promise<void> | void },
	): void {
		const toggle = new ToggleComponent(parentEl);
		toggle
			.setValue(currentValue)
			.setTooltip("Show this agent in agent lists, menus, and commands")
			.onChange(async (value) => {
				const agentId = getAgentId();
				if (agentId === undefined) {
					return;
				}
				if (!value && this.isLastEnabledAgent(agentId)) {
					toggle.setValue(true);
					new Notice(
						"[Agent Client] At least one agent must stay enabled.",
					);
					return;
				}
				await writer.write(value);
				this.plugin.ensureAtLeastOneEnabled();
				this.plugin.ensureDefaultAgentId();
				await this.flushSettings();
				this.refreshAgentDropdown();
				this.renderContent();
			});
		toggle.toggleEl.setAttribute("aria-label", "Enabled");
	}

	/**
	 * Collapsible section shell shared by preset and custom agent sections.
	 * The summary row is a real <button> (keyboard/focus for free, with
	 * aria-expanded) holding the chevron + agent name; the Enabled toggle
	 * sits in the row as a flex sibling — not nested, since interactive
	 * content inside a button is invalid and as a sibling its clicks can't
	 * reach the collapse handler. Open/close flips classes in place, no
	 * re-render. Interim UI until the SettingsTab migrates to the
	 * declarative settings API (Obsidian 1.13, see plan/TODO.md).
	 *
	 * `renderBody` receives the (initially hidden when closed) body element
	 * plus the summary name element, so body controls that edit the display
	 * name can sync the summary label in place.
	 */
	private renderCollapsibleAgentSection(
		containerEl: HTMLElement,
		sectionId: string,
		name: string,
		enabledToggle: {
			getAgentId: () => string | undefined;
			currentValue: boolean;
			write: (value: boolean) => Promise<void> | void;
		},
		renderBody: (bodyEl: HTMLElement, nameEl: HTMLElement) => void,
		// Optional controls rendered after the Enabled toggle (e.g. the
		// custom agent delete button). Siblings of the collapse button, so
		// their clicks can't toggle the section.
		renderSummaryTrailing?: (summaryEl: HTMLElement) => void,
	): void {
		const isOpen = this.openSections.has(sectionId);

		const summaryEl = containerEl.createDiv({
			cls: "agent-client-agent-summary",
		});
		summaryEl.toggleClass("agent-client-open", isOpen);
		const buttonEl = summaryEl.createEl("button", {
			cls: "agent-client-agent-summary-button",
			attr: { type: "button", "aria-expanded": String(isOpen) },
		});
		const nameEl = buttonEl.createSpan({
			cls: "agent-client-agent-summary-name",
			text: name,
		});
		const chevronEl = buttonEl.createSpan({
			cls: "agent-client-agent-summary-chevron",
		});
		setIcon(chevronEl, "chevron-right");
		this.addEnabledToggleControl(
			summaryEl,
			enabledToggle.getAgentId,
			enabledToggle.currentValue,
			{ write: enabledToggle.write },
		);
		renderSummaryTrailing?.(summaryEl);

		const bodyEl = containerEl.createDiv({
			cls: "agent-client-agent-section-body",
		});
		bodyEl.toggleClass("agent-client-collapsed", !isOpen);

		buttonEl.addEventListener("click", () => {
			const open = !this.openSections.has(sectionId);
			if (open) {
				this.openSections.add(sectionId);
			} else {
				this.openSections.delete(sectionId);
			}
			buttonEl.setAttribute("aria-expanded", String(open));
			summaryEl.toggleClass("agent-client-open", open);
			bodyEl.toggleClass("agent-client-collapsed", !open);
		});

		renderBody(bodyEl, nameEl);
	}

	/**
	 * Write a partial update for one preset agent through the settings
	 * service. Emits a fresh presetAgents record + fresh entry so slice
	 * subscribers (ChatPanel via useSettingsSelector) detect the change by
	 * reference compare.
	 */
	private async updatePresetAgent(
		presetId: string,
		updates: Partial<PresetAgentUserSettings>,
	): Promise<void> {
		const current = this.plugin.settings.presetAgents[presetId];
		if (!current) {
			return;
		}
		await this.plugin.settingsService.updateSettings({
			presetAgents: {
				...this.plugin.settings.presetAgents,
				[presetId]: { ...current, ...updates },
			},
		});
	}

	/**
	 * Render the collapsible settings section for one preset agent, driven
	 * entirely by its registry definition (summary row with Enabled toggle,
	 * API key row, path + auto-detect, install hint, arguments, environment
	 * variables).
	 */
	private renderPresetSettings(
		containerEl: HTMLElement,
		def: PresetAgentDefinition,
	) {
		const preset = this.plugin.settings.presetAgents[def.presetId];
		if (!preset) {
			// Normalization guarantees an entry per registry preset.
			return;
		}

		this.renderCollapsibleAgentSection(
			containerEl,
			`preset:${def.presetId}`,
			preset.displayName || def.defaultDisplayName,
			{
				getAgentId: () => def.presetId,
				currentValue: isAgentEnabled(preset),
				write: (value) =>
					this.updatePresetAgent(def.presetId, { enabled: value }),
			},
			(bodyEl) => this.renderPresetSettingsBody(bodyEl, def, preset),
		);
	}

	private renderPresetSettingsBody(
		bodyEl: HTMLElement,
		def: PresetAgentDefinition,
		preset: PresetAgentUserSettings,
	) {
		if (def.apiKey) {
			new Setting(bodyEl)
				.setName("API key")
				.setDesc(def.apiKey.settingDesc)
				.addComponent((el) =>
					new SecretComponent(this.app, el)
						.setValue(preset.apiKeySecretId)
						.onChange(async (value) => {
							await this.updatePresetAgent(def.presetId, {
								apiKeySecretId: value,
							});
						}),
				);
		}

		const pathPlaceholder =
			def.presetId === ANTIGRAVITY_PRESET_ID
				? getDefaultAntigravityBridgePath()
				: def.defaultCommand;
		const pathSetting = new Setting(bodyEl)
			.setName("Path")
			.setDesc(def.settingsCopy.pathDesc)
			.addText((text) => {
				text.setPlaceholder(pathPlaceholder)
					.setValue(preset.command)
					.onChange(async (value) => {
						await this.updatePresetAgent(def.presetId, {
							command: value.trim(),
						});
					});
			});
		this.addAutoDetectButton(
			pathSetting,
			def.defaultCommand,
			async (path) => {
				await this.updatePresetAgent(def.presetId, { command: path });
			},
			def.presetId === ANTIGRAVITY_PRESET_ID
				? () => resolveAntigravityBridgePath()
				: undefined,
		);
		// Native Windows may need a different install command than the
		// POSIX-shell one (WSL mode runs commands in bash, so it keeps the
		// default). The WSL toggle re-renders the tab, keeping this in sync.
		const isNativeWindows =
			Platform.isWin && !this.plugin.settings.windowsWslMode;
		this.addInstallHint(
			bodyEl,
			isNativeWindows && def.installHint.nativeWindows
				? def.installHint.nativeWindows
				: def.installHint.default,
		);

		if (def.presetId === ANTIGRAVITY_PRESET_ID) {
			this.renderAntigravityHealthCheck(bodyEl, preset.command);
		} else {
			const harness = getHarnessById(def.presetId);
			if (harness?.healthCheck) {
				this.renderHarnessHealthCheck(bodyEl, preset, harness);
			}
		}

		new Setting(bodyEl)
			.setName("Arguments")
			.setDesc(
				"Enter one argument per line. Leave empty to run without arguments." +
					(def.settingsCopy.argsDescSuffix ?? ""),
			)
			.addTextArea((text) => {
				text.setPlaceholder("")
					.setValue(this.formatArgs(preset.args))
					.onChange(async (value) => {
						await this.updatePresetAgent(def.presetId, {
							args: this.parseArgs(value),
						});
					});
				text.inputEl.rows = 3;
			});

		const envDescParts = ["Enter KEY=VALUE pairs, one per line."];
		if (def.settingsCopy.envDescExtra) {
			envDescParts.push(def.settingsCopy.envDescExtra);
		}
		if (def.apiKey) {
			envDescParts.push(
				`${def.apiKey.envVarName} is derived from the field above.`,
			);
		}

		new Setting(bodyEl)
			.setName("Environment variables")
			.setDesc(envDescParts.join(" "))
			.addTextArea((text) => {
				text.setPlaceholder(def.settingsCopy.envPlaceholder ?? "")
					.setValue(this.formatEnv(preset.env))
					.onChange(async (value) => {
						await this.updatePresetAgent(def.presetId, {
							env: this.parseEnv(value),
						});
					});
				text.inputEl.rows = 3;
			});
	}

	private renderCustomAgents(containerEl: HTMLElement) {
		if (this.plugin.settings.customAgents.length === 0) {
			containerEl.createEl("p", {
				text: "No custom agents configured yet.",
			});
		} else {
			const sortedCustoms = this.plugin.settings.customAgents
				.map((agent, index) => ({ agent, index }))
				.filter(({ agent }) => {
					if (!this.plugin.settings.hideUnusedAgents) {
						return true;
					}
					return isAgentEnabled(agent);
				})
				.sort((a, b) => {
					const aEnabled = isAgentEnabled(a.agent);
					const bEnabled = isAgentEnabled(b.agent);
					if (aEnabled === bEnabled) {
						return 0;
					}
					return aEnabled ? -1 : 1;
				});
			if (sortedCustoms.length === 0) {
				containerEl.createEl("p", {
					text: this.plugin.settings.hideUnusedAgents
						? "No enabled custom agents. Turn off Hide unused agents to show disabled ones."
						: "No custom agents configured yet.",
				});
			} else {
				sortedCustoms.forEach(({ agent, index }) => {
					this.renderCustomAgent(containerEl, agent, index);
				});
			}
		}

		new Setting(containerEl)
			.setName("New custom agent")
			.setDesc("Register any ACP-compatible agent.")
			.addButton((button) => {
				button
					.setButtonText("Add custom agent")
					.setCta()
					.onClick(async () => {
						const newId = this.generateCustomAgentId();
						const newDisplayName =
							this.generateCustomAgentDisplayName();
						this.plugin.settings.customAgents.push({
							id: newId,
							displayName: newDisplayName,
							command: "",
							args: [],
							env: [],
						});
						// Open the new agent's section so it can be configured
						// right away.
						this.openSections.add(`custom:${newId}`);
						this.plugin.ensureDefaultAgentId();
						await this.flushSettings();
						this.renderContent();
					});
			});
	}

	private renderCustomAgent(
		containerEl: HTMLElement,
		agent: CustomAgentSettings,
		index: number,
	) {
		this.renderCollapsibleAgentSection(
			containerEl,
			`custom:${agent.id}`,
			agent.displayName || agent.id,
			{
				getAgentId: () => this.plugin.settings.customAgents[index]?.id,
				currentValue: isAgentEnabled(agent),
				write: (value) => {
					this.plugin.settings.customAgents[index].enabled = value;
				},
			},
			(bodyEl, nameEl) =>
				this.renderCustomAgentBody(bodyEl, nameEl, agent, index),
			(summaryEl) => {
				// Delete lives in the summary row (next to the Enabled
				// toggle) so it clearly removes the whole agent — inside the
				// body it read as deleting just the Agent ID.
				new ExtraButtonComponent(summaryEl)
					.setIcon("trash")
					.setTooltip("Delete this agent")
					.onClick(async () => {
						this.plugin.settings.customAgents.splice(index, 1);
						// Deleting the last enabled agent must not leave
						// everything disabled.
						this.plugin.ensureAtLeastOneEnabled();
						this.plugin.ensureDefaultAgentId();
						await this.flushSettings();
						this.renderContent();
					});
			},
		);
	}

	private renderCustomAgentBody(
		bodyEl: HTMLElement,
		summaryNameEl: HTMLElement,
		agent: CustomAgentSettings,
		index: number,
	) {
		new Setting(bodyEl)
			.setName("Agent ID")
			.setDesc("Unique identifier used to reference this agent.")
			.addText((text) => {
				text.setPlaceholder("custom-agent")
					.setValue(agent.id)
					.onChange(async (value) => {
						const trimmed = value.trim();
						// An empty field is a transient state while retyping,
						// not a committable id — keep the last valid id in
						// settings and let the user keep typing. The blur
						// handler below restores the field if it is abandoned
						// empty.
						if (trimmed.length === 0) {
							return;
						}
						const previousId =
							this.plugin.settings.customAgents[index].id;
						this.plugin.settings.customAgents[index].id = trimmed;
						this.rekeyOpenSection(previousId, trimmed);
						if (
							this.plugin.settings.defaultAgentId === previousId
						) {
							this.plugin.settings.defaultAgentId = trimmed;
						}
						this.plugin.ensureDefaultAgentId();
						await this.flushSettings();
						this.refreshAgentDropdown();
					});
				// Captured on focus: was the custom being edited the default
				// agent? At blur time `defaultAgentId === presetId` is
				// ambiguous — either onChange's keystroke-retargeting followed
				// this edit, or the default pointed at the preset all along —
				// and only the former should follow the repair rename.
				let wasDefaultAtFocus = false;
				text.inputEl.addEventListener("focus", () => {
					const currentId =
						this.plugin.settings.customAgents[index]?.id;
					wasDefaultAtFocus =
						currentId !== undefined &&
						this.plugin.settings.defaultAgentId === currentId;
				});
				// Preset ids are reserved. Validate on blur, not per
				// keystroke: onChange commits every intermediate value, so a
				// mid-typing collision check would misfire.
				text.inputEl.addEventListener("blur", () => {
					// Restore an abandoned-empty field: onChange skips empty
					// values (transient while retyping), so settings still
					// hold the last valid id — put it back into the visible
					// field. Settings are unchanged, so no commit is needed.
					// Fall through to the preset-collision check: the
					// committed id may still be a reserved preset id (typed,
					// committed, then emptied before this blur).
					if (text.getValue().trim().length === 0) {
						const currentId =
							this.plugin.settings.customAgents[index]?.id;
						if (currentId) {
							text.setValue(currentId);
						}
					}
					const committed =
						this.plugin.settings.customAgents[index]?.id;
					if (
						!committed ||
						!PRESET_AGENTS.some((def) => def.presetId === committed)
					) {
						return;
					}
					const taken = new Set<string>(
						PRESET_AGENTS.map((def) => def.presetId),
					);
					this.plugin.settings.customAgents.forEach((item, i) => {
						if (i !== index) {
							taken.add(item.id);
						}
					});
					let suffix = 2;
					let candidate = `${committed}-${suffix}`;
					while (taken.has(candidate)) {
						suffix += 1;
						candidate = `${committed}-${suffix}`;
					}
					this.plugin.settings.customAgents[index].id = candidate;
					this.rekeyOpenSection(committed, candidate);
					if (wasDefaultAtFocus) {
						this.plugin.settings.defaultAgentId = candidate;
					}
					text.setValue(candidate);
					new Notice(
						`[Agent Client] "${committed}" is reserved for a preset agent. This custom agent was renamed to "${candidate}".`,
					);
					this.plugin.ensureDefaultAgentId();
					void this.flushSettings().then(() => {
						this.refreshAgentDropdown();
					});
				});
			});

		new Setting(bodyEl)
			.setName("Display name")
			.setDesc("Shown in menus and headers.")
			.addText((text) => {
				text.setPlaceholder("Custom agent")
					.setValue(agent.displayName || agent.id)
					.onChange(async (value) => {
						const trimmed = value.trim();
						const next =
							trimmed.length > 0
								? trimmed
								: this.plugin.settings.customAgents[index].id;
						this.plugin.settings.customAgents[index].displayName =
							next;
						// Keep the collapsed-summary label in sync without a
						// re-render (which would drop focus mid-typing).
						summaryNameEl.setText(next);
						await this.flushSettings();
						this.refreshAgentDropdown();
					});
			});

		new Setting(bodyEl)
			.setName("Path")
			.setDesc(
				"Command name or path to the custom agent. Use just the command name to let the login shell resolve it, or enter an absolute path.",
			)
			.addText((text) => {
				text.setPlaceholder("Command name or path")
					.setValue(agent.command)
					.onChange(async (value) => {
						this.plugin.settings.customAgents[index].command =
							value.trim();
						await this.flushSettings();
					});
			});

		new Setting(bodyEl)
			.setName("Arguments")
			.setDesc(
				"Enter one argument per line. Leave empty to run without arguments.",
			)
			.addTextArea((text) => {
				text.setPlaceholder("--flag\n--another=value")
					.setValue(this.formatArgs(agent.args))
					.onChange(async (value) => {
						this.plugin.settings.customAgents[index].args =
							this.parseArgs(value);
						await this.flushSettings();
					});
				text.inputEl.rows = 3;
			});

		new Setting(bodyEl)
			.setName("Environment variables")
			.setDesc(
				"Enter KEY=VALUE pairs, one per line. (Stored as plain text)",
			)
			.addTextArea((text) => {
				text.setPlaceholder("TOKEN=...")
					.setValue(this.formatEnv(agent.env))
					.onChange(async (value) => {
						this.plugin.settings.customAgents[index].env =
							this.parseEnv(value);
						await this.flushSettings();
					});
				text.inputEl.rows = 3;
			});
	}

	/**
	 * Flush the current `plugin.settings` state through `settingsService.updateSettings()`
	 * so that React components subscribed via `useSettings` re-render.
	 *
	 * Use this after calling legacy helpers (e.g. `ensureDefaultAgentId`) that mutate
	 * `plugin.settings` directly. Passes the current values as the "update" to trigger
	 * the notification pipeline without re-merging.
	 */
	private async flushSettings(): Promise<void> {
		await this.plugin.settingsService.updateSettings({
			// Emit a fresh array + fresh elements so the customAgents reference
			// flips on every edit. SettingsTab mutates custom agents in place
			// (e.g. customAgents[i].displayName = …); without this the reference
			// is carried through updateSettings unchanged and slice subscribers
			// (ChatPanel via useSettingsSelector) can't detect the change (#341/#4).
			customAgents: this.plugin.settings.customAgents.map((a) => ({
				...a,
			})),
			defaultAgentId: this.plugin.settings.defaultAgentId,
		});
	}

	private generateCustomAgentDisplayName(): string {
		const base = "Custom agent";
		const existing = new Set<string>();
		for (const def of PRESET_AGENTS) {
			const preset = this.plugin.settings.presetAgents[def.presetId];
			existing.add(preset?.displayName || def.presetId);
		}
		for (const item of this.plugin.settings.customAgents) {
			existing.add(item.displayName || item.id);
		}
		if (!existing.has(base)) {
			return base;
		}
		let counter = 2;
		let candidate = `${base} ${counter}`;
		while (existing.has(candidate)) {
			counter += 1;
			candidate = `${base} ${counter}`;
		}
		return candidate;
	}

	// Create a readable ID for new custom agents and avoid collisions
	private generateCustomAgentId(): string {
		const base = "custom-agent";
		const existing = new Set(
			this.plugin.settings.customAgents.map((item) => item.id),
		);
		if (!existing.has(base)) {
			return base;
		}
		let counter = 2;
		let candidate = `${base}-${counter}`;
		while (existing.has(candidate)) {
			counter += 1;
			candidate = `${base}-${counter}`;
		}
		return candidate;
	}

	private renderHarnessHealthCheck(
		bodyEl: HTMLElement,
		preset: PresetAgentUserSettings,
		harness: HarnessDefinition,
	): void {
		const resultEl = bodyEl.createDiv({
			cls: "agent-client-cursor-health-results",
		});
		const displayName = harness.preset.defaultDisplayName;
		const defaultCommand = harness.preset.defaultCommand;
		const defaultArgs = harness.preset.defaultArgs;

		const renderChecks = (
			checks: Array<{ ok: boolean; message: string }>,
			summary: string,
		) => {
			resultEl.empty();
			const list = resultEl.createEl("ul");
			for (const check of checks) {
				list.createEl("li", {
					text: check.message,
					cls: check.ok
						? "agent-client-cursor-health-ok"
						: "agent-client-cursor-health-fail",
				});
			}
			resultEl.createEl("p", {
				text: summary,
				cls: "setting-item-description",
			});
		};

		new Setting(bodyEl)
			.setName("Setup check")
			.setDesc(
				`Verify ${displayName} is installed, reachable, and authenticated.`,
			)
			.addButton((btn) => {
				btn.setButtonText("Check setup").onClick(async () => {
					btn.setButtonText("Checking…");
					btn.setDisabled(true);
					resultEl.empty();
					try {
						const live =
							this.plugin.settings.presetAgents[
								harness.preset.presetId
							] ?? preset;
						const envRecord: Record<string, string> = {};
						for (const entry of live.env) {
							if (entry.key) {
								envRecord[entry.key] = entry.value ?? "";
							}
						}
						const result = await harness.healthCheck!({
							agentId: harness.preset.presetId,
							command: live.command.trim() || defaultCommand,
							args:
								live.args.length > 0
									? live.args
									: defaultArgs,
							wslMode: this.plugin.settings.windowsWslMode,
							wslDistribution:
								this.plugin.settings.windowsWslDistribution,
							env: envRecord,
						});
						renderChecks(
							result.checks ? [...result.checks] : [],
							result.summary ?? result.message ?? "",
						);
					} catch {
						resultEl.setText(
							"Health check failed to run. Try again from a terminal.",
						);
					} finally {
						btn.setButtonText("Check setup");
						btn.setDisabled(false);
					}
				});
			});
	}

	private renderAntigravityHealthCheck(
		bodyEl: HTMLElement,
		configuredPath: string,
	): void {
		const container = bodyEl.createDiv({
			cls: "agent-client-antigravity-health",
		});
		const statusEl = container.createDiv({
			cls: "agent-client-antigravity-health-status",
			text: "Health check: click Run to probe bridge, auth, and endpoint.",
		});
		const listEl = container.createDiv({
			cls: "agent-client-antigravity-health-list",
		});

		const renderReport = (report: AntigravityHealthReport) => {
			listEl.empty();
			statusEl.setText(
				report.overall === "ok"
					? "Health check: ready"
					: report.overall === "warning"
						? "Health check: warnings — review below"
						: "Health check: issues found",
			);
			statusEl.toggleClass(
				"agent-client-antigravity-health--ok",
				report.overall === "ok",
			);
			statusEl.toggleClass(
				"agent-client-antigravity-health--warning",
				report.overall === "warning",
			);
			statusEl.toggleClass(
				"agent-client-antigravity-health--error",
				report.overall === "error",
			);

			for (const check of report.checks) {
				const row = listEl.createDiv({
					cls: `agent-client-antigravity-health-row agent-client-antigravity-health-row--${check.status}`,
				});
				row.createEl("strong", { text: `${check.label}: ` });
				row.createSpan({ text: check.detail });
				if (check.suggestion) {
					row.createEl("p", {
						cls: "agent-client-antigravity-health-suggestion",
						text: check.suggestion,
					});
				}
			}
		};

		new Setting(container)
			.setName("Health check")
			.setDesc(
				"Verify the ACP bridge binary, Antigravity ACP auth (~/.gemini/antigravity-acp/), and spawn endpoint before chatting.",
			)
			.addButton((btn) => {
				btn.setButtonText("Run").onClick(async () => {
					btn.setButtonText("Checking…");
					btn.setDisabled(true);
					try {
						const live =
							this.plugin.settings.presetAgents[
								ANTIGRAVITY_PRESET_ID
							];
						const path = live?.command ?? configuredPath;
						const envRecord: Record<string, string> = {};
						for (const entry of live?.env ?? []) {
							if (entry.key) {
								envRecord[entry.key] = entry.value ?? "";
							}
						}
						const report = await checkAntigravityHealth(path, {
							env: envRecord,
						});
						renderReport(report);
						const mcpNote = await getAntigravityMcpConfigNote();
						if (mcpNote) {
							listEl.createEl("p", {
								cls: "agent-client-antigravity-health-note",
								text: mcpNote,
							});
						}
					} finally {
						btn.setButtonText("Run");
						btn.setDisabled(false);
					}
				});
			});
	}

	/**
	 * Renders a copyable install command hint below a Path setting.
	 */
	private addInstallHint(containerEl: HTMLElement, command: string): void {
		const frag = createFragment();
		frag.appendText("Not installed? Run in terminal: ");
		frag.createEl("code", { text: command });
		new Setting(containerEl).setDesc(frag).addButton((btn) => {
			btn.setButtonText("Copy").onClick(() => {
				void navigator.clipboard.writeText(command).then(
					() => {
						btn.setButtonText("Copied!");
						window.setTimeout(() => {
							btn.setButtonText("Copy");
						}, 1500);
					},
					() => undefined,
				);
			});
		});
	}

	/**
	 * Shared helper: adds an "Auto-detect" button to a Path setting.
	 * Calls `resolveCommandPath(commandName)` and, on success, writes the
	 * resolved absolute path via `onResolved`, then re-renders the tab.
	 */
	private addAutoDetectButton(
		setting: import("obsidian").Setting,
		commandName: string,
		onResolved: (path: string) => Promise<void>,
		resolvePath?: () => Promise<string | null>,
	): void {
		setting.addButton((btn) => {
			const isWsl = Platform.isWin && this.plugin.settings.windowsWslMode;
			const lookupCmd = Platform.isWin && !isWsl ? "where" : "which";
			btn.setButtonText("Auto-detect")
				.setTooltip(
					resolvePath
						? "Probe platform paths for agy_acp_server.par or agy_acp_server.exe"
						: `Run \`${lookupCmd} ${commandName}\` to find the path`,
				)
				.onClick(async () => {
					btn.setButtonText("Detecting…");
					btn.setDisabled(true);
					try {
						const found = resolvePath
							? await resolvePath()
							: isWsl
								? await resolveCommandPathInWsl(
										commandName,
										this.plugin.settings
											.windowsWslDistribution || undefined,
									)
								: await resolveCommandPath(commandName);
						if (found) {
							await onResolved(found);
							this.renderContent();
						} else {
							btn.setButtonText("Not found");
							window.setTimeout(() => {
								btn.setButtonText("Auto-detect");
								btn.setDisabled(false);
							}, 2000);
						}
					} catch {
						btn.setButtonText("Error");
						window.setTimeout(() => {
							btn.setButtonText("Auto-detect");
							btn.setDisabled(false);
						}, 2000);
					}
				});
		});
	}

	private formatArgs(args: string[]): string {
		return args.join("\n");
	}

	private parseArgs(value: string): string[] {
		return value
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
	}

	private formatEnv(env: AgentEnvVar[]): string {
		return env
			.map((entry) => `${entry.key}=${entry.value ?? ""}`)
			.join("\n");
	}

	private parseEnv(value: string): AgentEnvVar[] {
		const envVars: AgentEnvVar[] = [];

		for (const line of value.split(/\r?\n/)) {
			const trimmed = line.trim();
			if (!trimmed) {
				continue;
			}
			const delimiter = trimmed.indexOf("=");
			if (delimiter === -1) {
				continue;
			}
			const key = trimmed.slice(0, delimiter).trim();
			const envValue = trimmed.slice(delimiter + 1).trim();
			if (!key) {
				continue;
			}
			envVars.push({ key, value: envValue });
		}

		return normalizeEnvVars(envVars);
	}
}
