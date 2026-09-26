# Cursor Setup

Cursor ships a native [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) server through the Cursor CLI. Agent Client starts it with `agent acp` — no custom-agent JSON recipe required.

## Install and Configure

Open a terminal (Terminal on macOS/Linux, PowerShell on Windows) and run:

::: code-group

```bash [macOS/Linux]
curl https://cursor.com/install -fsS | bash
```

```powershell [Windows]
irm 'https://cursor.com/install?win32=true' | iex
```

:::

1. Find the CLI path:

::: code-group

```bash [macOS/Linux]
which agent
# Example: /Users/you/.local/bin/agent
```

```cmd [Windows]
where.exe agent
```

:::

2. Open **Settings → Agent Client → Cursor**. Leave **Path** as `agent` (resolved on this computer via your login shell). **Auto-detect** saves an absolute path on **this device only** — it is not synced, so Windows, another Mac, and this Mac can each have a different `agent` binary. You do not need separate “Cursor Windows” / “Cursor Mac” agents.

3. Click **Check setup** in the Cursor preset section. It verifies PATH, `agent acp`, and sign-in status.

## Authentication

Use **one** of these methods:

### API key (recommended on Windows)

On Windows, Obsidian often launches from the desktop shortcut. The Cursor CLI inside Agent Client then does **not** see a Terminal `agent login` session, so chat may run the interactive `cursor_login` flow on every new session unless you use an API key.

1. Create a key at [Cursor → Dashboard → Integrations](https://cursor.com/dashboard?tab=integrations).
2. Open **Settings → Agent Client → Cursor → API key**, click **Link…**, and store the key in Obsidian's secret storage (not in synced `data.json`).

**Check setup** should report authentication via `CURSOR_API_KEY`. Agent Client skips `cursor_login` when the linked key is present.

### CLI login (macOS/Linux, or Windows Terminal-only workflows)

1. Sign in from a terminal:

```bash
agent login
```

2. Confirm status:

```bash
agent status
```

When `agent status` reports a login (from the same environment Agent Client uses), Agent Client skips `cursor_login` on session open. You can also set `CURSOR_API_KEY` in **Environment variables** instead of the API key field.

When you are already signed in (`agent status` OK) or use `CURSOR_API_KEY`, Agent Client skips the interactive `cursor_login` step when opening chat so the browser login page does not open on every load.

::: tip Migrating from a custom agent
If you previously configured Cursor as a custom agent with id `cursor`, your path, args, and saved sessions migrate to this preset automatically.
:::

## Custom API endpoint

By default the CLI talks to `https://api2.cursor.sh`. Override with:

- An **Arguments** line such as `-e https://your-endpoint.example` (before `acp`), or
- `CURSOR_API_URL` in **Environment variables**

If the endpoint is wrong or unreachable, chat and **Check setup** show which URL was used.

## Verify Setup

1. Click the robot icon or run **Open chat view** from the command palette
2. Switch to **Cursor** in the chat header
3. Send a short message — Agent, Plan, and Ask modes come from the connected Cursor session

If connection fails, read the red card in the chat transcript (not a generic “agent error”) and follow the suggested next step.

Having issues? See [Troubleshooting](/help/troubleshooting).
