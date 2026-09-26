import { describe, it, expect, vi } from "vitest";
import {
	absorbCustomAgents,
	hasOrphanPresetAgentKeys,
	normalizePresetAgents,
	defaultPresetAgentSettings,
	normalizeCustomAgent,
	ensureUniqueCustomAgentIds,
	resolveDefaultAgentId,
	clampFloatingIdleTimeoutMs,
	clampFloatingIdleOpacityPercent,
	parseFloatingIdleTimeoutMs,
	parseFloatingIdleOpacityPercent,
	resolveFloatingIdleOpacityPercent,
	bool,
	type ApiKeyMigrator,
} from "../src/services/settings-normalizer";
import { PRESET_AGENTS } from "../src/services/preset-agents";
import type { CustomAgentSettings } from "../src/types/agent";

// Pass-through migrator: returns the stored secret id unchanged. Tests that
// exercise the migration chain use a vi.fn wrapper instead.
const noMigration: ApiKeyMigrator = ({ current }) => current;

const PRESET_IDS = PRESET_AGENTS.map((def) => def.presetId);

describe("normalizePresetAgents", () => {
	it("migrates the legacy per-agent sub-objects with values preserved", () => {
		const raw = {
			claude: {
				id: "claude-code-acp",
				displayName: "My Claude",
				apiKeySecretId: "claude-secret",
				command: "/opt/claude-agent-acp",
				args: ["--verbose"],
				env: [{ key: "FOO", value: "bar" }],
			},
			codex: { command: "/opt/codex-acp" },
		};
		const result = normalizePresetAgents(raw, PRESET_AGENTS, noMigration);

		expect(result["claude-code-acp"]).toEqual({
			id: "claude-code-acp",
			displayName: "My Claude",
			apiKeySecretId: "claude-secret",
			command: "/opt/claude-agent-acp",
			args: ["--verbose"],
			env: [{ key: "FOO", value: "bar" }],
			enabled: true,
		});
		expect(result["codex-acp"].command).toBe("/opt/codex-acp");
	});

	it("respects the legacy top-level command-path keys", () => {
		const raw = {
			claudeCodeAcpCommandPath: "/legacy/claude-agent-acp",
		};
		const result = normalizePresetAgents(raw, PRESET_AGENTS, noMigration);

		expect(result["claude-code-acp"].command).toBe(
			"/legacy/claude-agent-acp",
		);
		// A stored command wins over the legacy top-level key.
		const withStored = normalizePresetAgents(
			{ ...raw, claude: { command: "/stored/claude" } },
			PRESET_AGENTS,
			noMigration,
		);
		expect(withStored["claude-code-acp"].command).toBe("/stored/claude");
	});

	it("force-syncs the entry id to the record key, never from raw", () => {
		const fromNew = normalizePresetAgents(
			{ presetAgents: { "claude-code-acp": { id: "polluted" } } },
			PRESET_AGENTS,
			noMigration,
		);
		expect(fromNew["claude-code-acp"].id).toBe("claude-code-acp");

		const fromLegacy = normalizePresetAgents(
			{ claude: { id: "claude" } },
			PRESET_AGENTS,
			noMigration,
		);
		expect(fromLegacy["claude-code-acp"].id).toBe("claude-code-acp");
	});

	it("prefers the new presetAgents record over legacy sub-objects, and falls back to registry defaults when both are absent", () => {
		const both = normalizePresetAgents(
			{
				presetAgents: { "claude-code-acp": { command: "/new/path" } },
				claude: { command: "/old/path" },
			},
			PRESET_AGENTS,
			noMigration,
		);
		expect(both["claude-code-acp"].command).toBe("/new/path");

		const neither = normalizePresetAgents({}, PRESET_AGENTS, noMigration);
		for (const def of PRESET_AGENTS) {
			expect(neither[def.presetId]).toEqual(
				defaultPresetAgentSettings(def),
			);
		}
	});

	it("drops orphan presetIds (removed harnesses or stale sync)", () => {
		const raw = {
			presetAgents: {
				"gemini-cli": { apiKeySecretId: "gemini-api-key" },
				opencode: {
					displayName: "OpenCode",
					command: "opencode",
					args: ["acp"],
					enabled: false,
				},
				"codex-acp": { apiKeySecretId: "openai-api-key" },
			},
		};
		const result = normalizePresetAgents(raw, PRESET_AGENTS, noMigration);
		expect(Object.keys(result).sort()).toEqual([...PRESET_IDS].sort());
		expect(result["codex-acp"].apiKeySecretId).toBe("openai-api-key");
		expect(result).not.toHaveProperty("gemini-cli");
		expect(result).not.toHaveProperty("opencode");
	});

	it("defaults enabled to true and preserves an explicit false", () => {
		const result = normalizePresetAgents(
			{
				presetAgents: {
					"codex-acp": { enabled: false },
				},
			},
			PRESET_AGENTS,
			noMigration,
		);
		expect(result["claude-code-acp"].enabled).toBe(true);
		expect(result["codex-acp"].enabled).toBe(false);
	});

	it("routes legacy plaintext apiKeys through the injected migrator with registry wiring", () => {
		const migrate = vi.fn<ApiKeyMigrator>(({ def, legacyPlain }) =>
			legacyPlain ? `migrated-${def.presetId}` : "",
		);
		const result = normalizePresetAgents(
			{
				claude: { apiKey: "sk-plain-key" },
			},
			PRESET_AGENTS,
			migrate,
		);

		// Once per active preset with legacy apiKey wiring (claude, codex, cursor).
		expect(migrate).toHaveBeenCalledTimes(3);
		const claudeCall = migrate.mock.calls.find(
			([args]) => args.def.presetId === "claude-code-acp",
		);
		expect(claudeCall).toBeDefined();
		expect(claudeCall?.[0]).toMatchObject({
			current: "",
			legacyPlain: "sk-plain-key",
		});
		// The registry carries the historic Notice label ("Claude", not
		// "Claude Code") so the migrator reproduces the exact user-facing text.
		expect(claudeCall?.[0].def.apiKey?.legacy?.noticeLabel).toBe("Claude");
		expect(result["claude-code-acp"].apiKeySecretId).toBe(
			"migrated-claude-code-acp",
		);
		expect(result["codex-acp"].apiKeySecretId).toBe("");
		expect(result.cursor.apiKeySecretId).toBe("");
		const cursorCall = migrate.mock.calls.find(
			([args]) => args.def.presetId === "cursor",
		);
		expect(cursorCall?.[0].def.apiKey?.legacy?.noticeLabel).toBe("Cursor");
	});
});

describe("ensureUniqueCustomAgentIds with reserved ids", () => {
	const custom = (id: string): CustomAgentSettings => ({
		id,
		displayName: id,
		command: "cmd",
		args: [],
		env: [],
	});

	it("suffix-renames a custom agent colliding with a preset id", () => {
		const result = ensureUniqueCustomAgentIds(
			[custom("claude-code-acp"), custom("my-agent")],
			PRESET_IDS,
		);
		expect(result.map((a) => a.id)).toEqual([
			"claude-code-acp-2",
			"my-agent",
		]);
	});

	it("keeps repairing duplicates among customs themselves", () => {
		const result = ensureUniqueCustomAgentIds(
			[custom("dup"), custom("dup")],
			PRESET_IDS,
		);
		expect(result.map((a) => a.id)).toEqual(["dup", "dup-2"]);
	});
});

describe("absorbCustomAgents", () => {
	const docsAdvisedCursor = {
		id: "cursor",
		displayName: "My Cursor",
		command: "/opt/agent",
		args: ["acp"],
		env: [{ key: "FOO", value: "bar" }],
		enabled: false,
	};

	it("adopts the docs-advised custom as the preset's raw source", () => {
		const raw = {
			customAgents: [docsAdvisedCursor, { id: "my-agent" }],
		};
		const result = absorbCustomAgents(raw, PRESET_AGENTS);

		expect(result.absorbed).toEqual([
			{ presetId: "cursor", displayName: "Cursor" },
		]);
		expect(result.customAgents).toEqual([{ id: "my-agent" }]);
		expect(result.presetAgents.cursor).toBe(docsAdvisedCursor);

		const normalized = normalizePresetAgents(
			{ presetAgents: result.presetAgents },
			PRESET_AGENTS,
			noMigration,
		);
		expect(normalized.cursor).toEqual({
			id: "cursor",
			displayName: "My Cursor",
			apiKeySecretId: "",
			command: "/opt/agent",
			args: ["acp"],
			env: [{ key: "FOO", value: "bar" }],
			enabled: false,
		});
	});

	it("does not absorb customs for removed preset ids", () => {
		const opencodeCustom = {
			id: "opencode",
			displayName: "My OpenCode",
			command: "/opt/opencode",
			args: ["acp"],
			env: [],
		};
		const result = absorbCustomAgents(
			{ customAgents: [opencodeCustom] },
			PRESET_AGENTS,
		);
		expect(result.absorbed).toEqual([]);
		expect(result.customAgents).toEqual([opencodeCustom]);
	});

	it("absorbs the docs-advised antigravity custom the same way", () => {
		const antigravityCustom = {
			id: "antigravity",
			displayName: "My Antigravity",
			command: "/opt/agy_acp_server.par",
			args: [],
			env: [],
		};
		const result = absorbCustomAgents(
			{ customAgents: [antigravityCustom] },
			PRESET_AGENTS,
		);
		expect(result.absorbed).toEqual([
			{ presetId: "antigravity", displayName: "Antigravity" },
		]);
		expect(result.customAgents).toEqual([]);
		expect(result.presetAgents.antigravity).toBe(antigravityCustom);
	});

	it("skips when the preset already has a stored entry", () => {
		const raw = {
			presetAgents: { cursor: { command: "agent" } },
			customAgents: [docsAdvisedCursor],
		};
		const result = absorbCustomAgents(raw, PRESET_AGENTS);
		expect(result.absorbed).toEqual([]);
		expect(result.customAgents).toEqual([docsAdvisedCursor]);
		expect(result.presetAgents.cursor).toEqual({ command: "agent" });
	});

	it("is a no-op without a matching custom", () => {
		const raw = { customAgents: [{ id: "my-agent" }] };
		const result = absorbCustomAgents(raw, PRESET_AGENTS);
		expect(result.absorbed).toEqual([]);
		expect(result.customAgents).toEqual([{ id: "my-agent" }]);
	});

	it("never absorbs into presets without the declaration", () => {
		const raw = {
			customAgents: [{ id: "mistral-vibe", command: "x" }],
		};
		const result = absorbCustomAgents(raw, PRESET_AGENTS);
		expect(result.absorbed).toEqual([]);
		expect(result.customAgents).toHaveLength(1);
	});

	it("is idempotent across a save round-trip", () => {
		const first = absorbCustomAgents(
			{ customAgents: [docsAdvisedCursor] },
			PRESET_AGENTS,
		);
		expect(first.absorbed).toHaveLength(1);

		const second = absorbCustomAgents(
			{
				customAgents: first.customAgents,
				presetAgents: first.presetAgents,
			},
			PRESET_AGENTS,
		);
		expect(second.absorbed).toEqual([]);
		expect(second.presetAgents.cursor).toBe(docsAdvisedCursor);
	});

	it("backfills empty absorbed args to the registry default", () => {
		const result = absorbCustomAgents(
			{ customAgents: [{ id: "cursor", command: "agent", args: [] }] },
			PRESET_AGENTS,
		);
		const normalized = normalizePresetAgents(
			{ presetAgents: result.presetAgents },
			PRESET_AGENTS,
			noMigration,
		);
		expect(normalized.cursor.args).toEqual(["acp"]);
	});
});

describe("normalizeCustomAgent", () => {
	it("defaults enabled to true and preserves an explicit false", () => {
		expect(normalizeCustomAgent({ id: "a" }).enabled).toBe(true);
		expect(normalizeCustomAgent({ id: "a", enabled: false }).enabled).toBe(
			false,
		);
	});
});

describe("hasOrphanPresetAgentKeys", () => {
	it("detects removed preset keys in raw data.json", () => {
		expect(
			hasOrphanPresetAgentKeys(
				{ presetAgents: { "gemini-cli": {}, "codex-acp": {} } },
				PRESET_AGENTS,
			),
		).toBe(true);
		expect(
			hasOrphanPresetAgentKeys(
				{ presetAgents: { "codex-acp": {} } },
				PRESET_AGENTS,
			),
		).toBe(false);
	});
});

describe("resolveDefaultAgentId", () => {
	const available = ["claude-code-acp", "codex-acp", "my-custom"];

	it("keeps a stored defaultAgentId that is available", () => {
		expect(
			resolveDefaultAgentId({ defaultAgentId: "my-custom" }, available),
		).toBe("my-custom");
	});

	it("migrates the old activeAgentId name", () => {
		expect(
			resolveDefaultAgentId({ activeAgentId: "codex-acp" }, available),
		).toBe("codex-acp");
	});

	it("prefers defaultAgentId over activeAgentId", () => {
		expect(
			resolveDefaultAgentId(
				{ defaultAgentId: "codex-acp", activeAgentId: "my-custom" },
				available,
			),
		).toBe("codex-acp");
	});

	it("falls back to preferredFallbackId when unset or unknown", () => {
		expect(
			resolveDefaultAgentId({}, available, "codex-acp"),
		).toBe("codex-acp");
		expect(
			resolveDefaultAgentId({ defaultAgentId: "ghost" }, available, "codex-acp"),
		).toBe("codex-acp");
	});

	it("falls back to the first available id when unset and no preferred fallback", () => {
		expect(resolveDefaultAgentId({}, available)).toBe("claude-code-acp");
	});
});

describe("floating idle opacity clamps", () => {
	it("clamps timeout to 0…600000", () => {
		expect(clampFloatingIdleTimeoutMs(-1)).toBe(0);
		expect(clampFloatingIdleTimeoutMs(0)).toBe(0);
		expect(clampFloatingIdleTimeoutMs(3000)).toBe(3000);
		expect(clampFloatingIdleTimeoutMs(999_999)).toBe(600_000);
		expect(clampFloatingIdleTimeoutMs(Number.NaN)).toBe(0);
	});

	it("clamps opacity to 10…100 (lower = more transparent)", () => {
		expect(clampFloatingIdleOpacityPercent(5)).toBe(10);
		expect(clampFloatingIdleOpacityPercent(50)).toBe(50);
		expect(clampFloatingIdleOpacityPercent(150)).toBe(100);
		expect(clampFloatingIdleOpacityPercent(Number.NaN)).toBe(50);
	});

	it("parses raw settings with fallbacks", () => {
		expect(parseFloatingIdleTimeoutMs(undefined, 0)).toBe(0);
		expect(parseFloatingIdleTimeoutMs(2500, 0)).toBe(2500);
		expect(parseFloatingIdleOpacityPercent("x", 50)).toBe(50);
		expect(parseFloatingIdleOpacityPercent(80, 50)).toBe(80);
	});

	it("defaults transparency mode on (idle fade allowed)", async () => {
		const { DEFAULT_SETTINGS } = await import(
			"../src/services/default-settings"
		);
		expect(DEFAULT_SETTINGS.floatingTransparencyMode).toBe(true);
		expect(bool(undefined, true)).toBe(true);
		expect(bool(false, true)).toBe(false);
		expect(bool("no", true)).toBe(true);
	});

	it("migrates legacy transparency percent to inverted opacity", () => {
		expect(
			resolveFloatingIdleOpacityPercent(
				{ floatingIdleTransparencyPercent: 90 },
				50,
			),
		).toBe(10);
		expect(
			resolveFloatingIdleOpacityPercent(
				{ floatingIdleTransparencyPercent: 50 },
				50,
			),
		).toBe(50);
		expect(
			resolveFloatingIdleOpacityPercent(
				{ floatingIdleOpacityPercent: 30 },
				50,
			),
		).toBe(30);
	});
});
