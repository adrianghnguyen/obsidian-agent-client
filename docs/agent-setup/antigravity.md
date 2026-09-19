# Antigravity Setup

[Antigravity](https://antigravity.google/) is Google's AI coding agent (the `agy` CLI). It does **not** expose ACP through the CLI itself — there is no `agy acp` subcommand. Agent Client connects via Google's **ACP bridge** binary `agy_acp_server.par`.

::: tip Migrating from a custom agent
If you previously configured Antigravity as a custom agent with id `antigravity`, your settings migrate to this preset automatically — saved sessions keep working.
:::

## Install the ACP bridge

The bridge is distributed through the [ACP Registry](https://agentclientprotocol.com/) (for example **Zed → Agents → Antigravity**). Manual installs place the binary at:

| Platform | Default path |
|----------|--------------|
| macOS | `~/Library/agy-acp-server/agy_acp_server.par` |
| Linux | `~/.local/bin/agy_acp_server.par` or `~/.local/opt/agy-acp/current/agy_acp_server.par` |
| Windows | `%LOCALAPPDATA%\agy-acp-server\agy_acp_server.par` |

The official zip also includes **`localharness_external`**. Place it next to the `.par` (or set `ANTIGRAVITY_HARNESS_PATH` to that file). The bridge binary alone is not enough for `session/new`.

You can override the bridge location with the `AGY_ACP_BIN` environment variable.

::: warning Not the agy CLI alone
Pointing Agent Client at the `agy` binary will not work for ACP. The Path must be `agy_acp_server.par` (or your platform equivalent).
:::

## Configure Agent Client

1. Open **Settings → Agent Client → Antigravity**
2. Click **Auto-detect** on the Path row (or paste the absolute path to `agy_acp_server.par`)
3. Click **Run** under **Health check** — it verifies:
   - the bridge binary exists and is executable
   - the companion `localharness_external` binary (or `ANTIGRAVITY_HARNESS_PATH`)
   - Antigravity auth signals under `~/.gemini/` or `GEMINI_API_KEY`
   - which ACP endpoint Agent Client will spawn (the Path you configured — it does not silently fall back)

## Authentication

Antigravity auth lives under **`~/.gemini/`** (not `~/.antigravity/`). Choose one:

### Option A — Google account (recommended)

1. Install the `agy` CLI from [Antigravity docs](https://antigravity.google/docs/cli/install/)
2. Run `agy` in Terminal and complete browser sign-in
3. Credentials are stored in your OS keychain; Agent Client picks them up through the bridge

### Option B — Gemini API key (headless / CI)

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey)
2. Set `modelProvider` to `gemini` in `~/.gemini/antigravity-cli/settings.json`
3. Export `GEMINI_API_KEY` in your environment (Obsidian inherits shell env on macOS/Linux; on Windows set user env vars and restart Obsidian), or put `GEMINI_API_KEY=…` in **Environment variables**. The health check accepts the key even if `settings.json` is missing.

See [Antigravity CLI auth docs](https://antigravity.google/docs/cli/install/) for details.

## Empty MCP config (intentional)

Antigravity uses a standalone MCP profile at `~/.gemini/config/mcp_config.json`. An **empty** file (or `{"mcpServers":{}}`) is normal — it does not mean the agent is misconfigured. Antigravity manages MCP separately from legacy Gemini CLI inline MCP settings.

## Verify Setup

1. Run the **Health check** in Settings — all checks should be green or show only the keychain warning
2. Open chat (**robot icon** or command palette → **Open chat view**)
3. Select **Antigravity** from the agent menu and send a test message

### Chat error messages

If something fails, the chat banner names the failure mode and the **ACP endpoint** path Agent Client tried:

| Banner | Meaning | Next step |
|--------|---------|-----------|
| **Antigravity authentication failed** | Bridge could not authenticate | Run `agy` in Terminal or configure API key mode |
| **Antigravity ACP bridge not found** | `agy_acp_server.par` missing | Install bridge, Auto-detect, health check |
| **Antigravity ACP endpoint unreachable** | Binary exists but connection failed | Run bridge in Terminal, check quarantine (macOS) |
| **Antigravity connection timed out** | Slow first init | Wait and retry; first launch can take minutes |
| **Antigravity ACP server exited** | Bridge crashed | Read Terminal stderr, fix auth/install |

Having issues? See [Troubleshooting](/help/troubleshooting#antigravity).

## Gemini CLI deprecation

Antigravity is Google's successor to Gemini CLI account login. See [Gemini CLI discontinuation](/announcements/gemini-cli-deprecation) for migration context. The community `agy-acp` npm adapter remains available as a [custom agent](/agent-setup/custom-agents) if you need a different bridge.
