# Kiro Setup

Kiro is AWS's agentic coding tool. This page covers the **Kiro CLI** (`kiro-cli`) — distinct from the Kiro IDE — which communicates via ACP through the `kiro-cli acp` command (available since Kiro CLI 1.25.0).

## Install and Configure

Open a terminal (Terminal on macOS/Linux, PowerShell on Windows) and run the following commands.

1. Install the Kiro CLI:

::: code-group

```bash [macOS/Linux]
curl -fsSL https://cli.kiro.dev/install | bash
```

```powershell [Windows]
irm 'https://cli.kiro.dev/install.ps1' | iex
```

:::

::: warning Windows support
The Kiro CLI requires **Windows 11**, and the install command must run in Windows Terminal or PowerShell (not Command Prompt). Other installers (AppImage, zip, .deb) are listed in the [Kiro CLI docs](https://kiro.dev/docs/cli/installation/).
:::

2. Find the installation path:

::: code-group

```bash [macOS/Linux]
which kiro-cli
# Example output: /Users/username/.local/bin/kiro-cli
```

```cmd [Windows]
where.exe kiro-cli
```

:::

3. Open **Settings → Agent Client**. The default command (`kiro-cli`) works in many cases. If the agent is not found automatically, set the **Kiro path** to the path found above, or click **Auto-detect**.

## Authentication

Choose one of the following methods:

### Option A: Sign In (Interactive)

1. Run the login flow in your terminal:

```bash
kiro-cli login
```

2. Sign in with GitHub, Google, AWS Builder ID, or your organization's identity provider.

3. In **Settings → Agent Client**, leave the **API key field empty** — the `kiro-cli acp` process started by Agent Client reuses your session.

### Option B: Kiro API Key

API keys are available on Kiro Pro and higher tiers:

1. Generate a key at [app.kiro.dev](https://app.kiro.dev)
2. Enter it in **Settings → Agent Client → Preset agents → Kiro → API key** (stored in Obsidian's Keychain)

A signed-in session takes precedence over the API key, so setting a key never breaks an existing login.

::: tip Migrating from a custom agent
If you previously set up Kiro as a custom agent with the id `kiro-cli` (as these docs once described), your settings are migrated to the preset automatically — saved sessions keep working. If your custom agent carried `KIRO_API_KEY` in its environment variables, consider moving it to the **API key** field so it is stored in Obsidian's Keychain instead of plain text.
:::

## Verify Setup

1. Click the robot icon in the ribbon or use the command palette: **"Open chat view"**
2. Switch to Kiro from the agent dropdown in the chat header
3. Try sending a message to verify the connection

Having issues? See [Troubleshooting](/help/troubleshooting).
