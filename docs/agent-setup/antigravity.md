# Antigravity Setup

[Antigravity](https://antigravity.google/) is Google's AI coding agent (the `agy` CLI). It does **not** expose ACP through the CLI itself — there is no `agy acp` subcommand. Agent Client connects via Google's **ACP bridge** binary (`agy_acp_server.par` on macOS/Linux, `agy_acp_server.exe` on Windows).

::: tip Migrating from a custom agent
If you previously configured Antigravity as a custom agent with id `antigravity`, your settings migrate to this preset automatically — saved sessions keep working.
:::

## Install the ACP bridge

The bridge is distributed through the [ACP Registry](https://agentclientprotocol.com/) (for example **Zed → Agents → Antigravity**). Manual installs place the binary at:

| Platform | Default path |
|----------|--------------|
| macOS | `~/Library/agy-acp-server/agy_acp_server.par` |
| Linux | `~/.local/bin/agy_acp_server.par` or `~/.local/opt/agy-acp/current/agy_acp_server.par` |
| Windows | `%LOCALAPPDATA%\agy-acp-server\agy_acp_server.exe` |

You can override the location with the `AGY_ACP_BIN` environment variable.

::: warning Not the agy CLI alone
Pointing Agent Client at the `agy` binary will not work for ACP. The Path must be the ACP bridge (`agy_acp_server.par` or `agy_acp_server.exe` on Windows).
:::

## Configure Agent Client

1. Open **Settings → Agent Client → Antigravity**
2. Click **Auto-detect** on the Path row (or paste the absolute path to the bridge binary)
3. Click **Run** under **Health check** — it verifies:
   - the bridge binary exists and is executable
   - Antigravity ACP auth under `~/.gemini/antigravity-acp/`
   - which ACP endpoint Agent Client will spawn

## Authentication

Official ACP auth lives under **`~/.gemini/antigravity-acp/`** (`settings.json` and usually `acp_token.json`). That is what Agent Client and the health check use. `~/.gemini/antigravity-cli/` is the `agy` CLI store and is **not** required for chat.

Choose one:

### Option A — Google account (recommended)

1. Complete Google login through Antigravity / the ACP bridge (AI Pro and personal Google login use `oauth-personal`)
2. Confirm `%USERPROFILE%\.gemini\antigravity-acp\settings.json` (Windows) or `~/.gemini/antigravity-acp/settings.json` exists
3. Agent Client starts a session with that OAuth store — it does **not** call `authenticate("gemini-api-key")` when these files are present

Running `agy` login alone only fills `antigravity-cli/` and will not turn the health row green.

### Option B — Gemini API key (headless / CI)

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey)
2. Export `GEMINI_API_KEY` in your environment (Obsidian inherits shell env on macOS/Linux; on Windows set user env vars and restart Obsidian)
3. Optional: set `modelProvider` to `gemini` in `~/.gemini/antigravity-cli/settings.json`

See [Antigravity CLI auth docs](https://antigravity.google/docs/cli/install/) for details.

First chat can sit on **Starting ACP bridge…** for about 30 seconds while a cold `agy_acp_server` finishes `initialize`. That is not an auth failure.

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
| **Antigravity authentication failed** | Bridge could not authenticate | Confirm `antigravity-acp/settings.json` exists, or configure API key mode |
| **Antigravity ACP bridge not found** | Bridge binary missing | Install bridge, Auto-detect, health check |
| **Antigravity ACP endpoint unreachable** | Binary exists but connection failed | Run bridge in Terminal, check quarantine (macOS) |
| **Antigravity connection timed out** | Slow first init | Wait and retry; first launch can take minutes |
| **Antigravity ACP server exited** | Bridge crashed | Read Terminal stderr, fix auth/install |

Having issues? See [Troubleshooting](/help/troubleshooting#antigravity).

## Gemini CLI deprecation

Antigravity is Google's successor to Gemini CLI account login. See [Gemini CLI discontinuation](/announcements/gemini-cli-deprecation) for migration context. The community `agy-acp` npm adapter remains available as a [custom agent](/agent-setup/custom-agents) if you need a different bridge.
