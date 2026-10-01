---
name: acp-registry
description: The official Agent Client Protocol (ACP) registry (github.com/agentclientprotocol/registry) and its CDN index — how to look up an agent's manifest, read its distribution (binary / npx / uvx) and platform targets, install a binary bridge, and how versions, the preview channel, and quarantine work. Use when wiring a new or existing ACP agent into a client, finding official download URLs (e.g. agy_acp_server), or adding/updating a registry entry.
---

# ACP Registry (official)

The **ACP Registry** is the canonical, curated list of agents that implement the [Agent Client Protocol](https://github.com/agentclientprotocol/agent-client-protocol). Repo: <https://github.com/agentclientprotocol/registry>. Rendered site: <https://agentclientprotocol.com/registry>.

It exists so ACP clients (Zed, JetBrains, an Obsidian plugin, etc.) can discover agents, get their official download URLs, and know they are launchable — without each client hardcoding vendors.

## Key facts

- Maintained by the ACP project; **every entry is verified by CI** to return valid `authMethods` in the ACP handshake (see `AUTHENTICATION.md`).
- Agent versions are **auto-updated hourly** by a cron job that watches npm / PyPI / GitHub releases and commits to `main`. You do not hand-edit versions.
- Entries are one directory per agent id, each containing an `agent.json` manifest.

## Where to fetch the data

Consume the published JSON, not the repo:

| Index | URL | Notes |
|---|---|---|
| Stable | `https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` | Use this normally |
| JetBrains | `https://cdn.agentclientprotocol.com/registry/v1/latest/registry-for-jetbrains.json` | Dedicated JetBrains index |
| JetBrains preview | `https://cdn.agentclientprotocol.com/registry/v1/latest/registry-for-jetbrains-preview.json` | Drop-in replacement; serves newest channel, unverified |

The top-level shape is `{ "version": "1.0.0", "agents": [...] }`.

## Repo layout (high level)

- `<agent-id>/agent.json` — the manifest for one agent (e.g. `antigravity-acp/agent.json`, `cursor/agent.json`, `claude-acp/agent.json`).
- `FORMAT.md` — manifest schema, distribution types, platform targets, preview channel.
- `CONTRIBUTING.md` — how to add an agent.
- `AUTHENTICATION.md` — the authMethods requirement.
- `agent.schema.json` / `registry.schema.json` — JSON Schemas (validate against these).
- `quarantine.json` — entries pulled from distribution.
- `.protocol-matrix/` — nightly protocol compatibility results.
- `AGENTS.md` — repo's own agent/contributor guide.

## Manifest shape (what a client reads)

```json
{
  "id": "entry-id",
  "name": "Entry Name",
  "version": "1.0.0",
  "description": "…",
  "repository": "https://github.com/…",
  "website": "https://…",
  "authors": ["Author Name"],
  "license": "MIT",
  "license_url": "https://…/LICENSE",
  "icon": "https://…/entry-id.svg",
  "distribution": {
    "binary": { "darwin-aarch64": { "archive": "https://…", "sha256": "…", "cmd": "./executable", "args": ["serve"], "env": {} } },
    "npx": { "package": "@scope/package", "args": ["--acp"] },
    "uvx": { "package": "package-name", "args": ["serve"] }
  }
}
```

Notes:
- `license_url` is **required** (must link the license/terms); only `dimcode` is exempt.
- `distribution` is one or more of `binary`, `npx`, `uvx` (a type is optional — pick what the platform provides).
- Optional `preview` block holds **only** `version` + `distribution` for an unstable channel; other metadata is shared (never duplicated).
- Icons: SVG, preferred 16x16.

## Distribution types

| Type | Meaning | Command |
|---|---|---|
| `binary` | Platform-specific executables | download, extract, run `cmd` |
| `npx` | npm package | `npx [args]` |
| `uvx` | PyPI package via uv | `uvx [args]` |

Binary archive formats supported: `.zip`, `.tar.gz`, `.tgz`, `.tar.bz2`, `.tbz2`, or a raw binary. Installer formats (`.dmg`, `.pkg`, `.deb`, `.rpm`, `.msi`, `.appimage`) are not.

Platform target ids: `darwin-aarch64`, `darwin-x86_64`, `linux-aarch64`, `linux-x86_64`, `windows-aarch64`, `windows-x86_64`. Match the host exactly — a client on another OS must ignore the other targets.

## Installing a binary agent (the common path)

1. Fetch `registry.json`, find the entry by `id`.
2. Pick `distribution.binary` for this host's platform id.
3. Download `archive` (verify `sha256` when present), extract, and run `cmd` (+ `args`) — relative to the extracted folder.
4. Pass `env` through to the process.

Example — Antigravity (`id: antigravity-acp`), a PyInstaller binary that ships `agy_acp_server` + a `localharness_external` companion:

```json
"windows-x86_64": {
  "archive": "https://dl.google.com/agy-extensions/releases/windows/agy-acp-server-1.2.1-windows-x86_64.zip",
  "cmd": "./agy_acp_server.exe"
}
```

Convention for the Antigravity bridge: install to `%LOCALAPPDATA%\agy-acp-server\` (Windows) or `~/Library/agy-acp-server/` (macOS), keep **both** binaries, and spawn the bridge directly (there is no `agy acp` subcommand).

## Versioning and the preview channel

- Stable `version` is always plain `X.Y.Z` (a prerelease there fails validation).
- Preview uses `X.Y.Z-preview.N` (1-based counter). Precedence is normal semver.
- "Highest of both channels wins": a stale preview block self-heals on the next hourly run — not an error.
- The `preview` key is **stripped** from `registry.json` and `registry-for-jetbrains.json`; in `registry-for-jetbrains-preview.json` the previewed agent appears as an ordinary entry with `version`/`distribution` substituted.
- Preview distributions are **not** launched, auth-checked, or probed, and do not appear in the nightly matrix.

## Adding or updating an agent

- Follow `CONTRIBUTING.md`; validate against `agent.schema.json`.
- Version bumps are automated hourly — usually you only add/repair the manifest, not the version.
- An entry that must be withdrawn goes in `quarantine.json`.

## Gotchas

- Prefer the CDN index over scraping the repo tree; the repo is the source, the CDN is the contract.
- Always match the host platform id; do not fall back to a foreign platform's `archive`.
- For `binary`, the `cmd`/`args` are relative to the extracted directory — extract next to the executable, not into a random temp dir you then clean up (some bridges resolve companions relative to the exe).
- A onefile PyInstaller bridge (e.g. Antigravity) re-unpacks on every spawn; that is a vendor packaging cost, not a registry problem — see the `antigravity-acp-cold-start` skill.
- Auth is only guaranteed to be *advertised* (`authMethods`) in the handshake; actually logging in is the client's job.
