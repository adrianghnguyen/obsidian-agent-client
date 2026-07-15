# OpenCode Setup

OpenCode is an open-source coding agent that works with many LLM providers. It communicates via ACP through the `opencode acp` command.

## Install and Configure

Open a terminal (Terminal on macOS/Linux, PowerShell on Windows) and run the following commands.

1. Install OpenCode:

::: code-group

```bash [macOS/Linux]
curl -fsSL https://opencode.ai/install | bash
```

```powershell [Windows]
npm install -g opencode-ai
```

:::

Other installers (Homebrew, Scoop, Chocolatey) are listed in the [OpenCode docs](https://opencode.ai/docs/).

2. Find the installation path:

::: code-group

```bash [macOS/Linux]
which opencode
# Example output: /Users/username/.opencode/bin/opencode
```

```cmd [Windows]
where.exe opencode
```

:::

3. Open **Settings → Agent Client**. The default command (`opencode`) works in many cases. If the agent is not found automatically, set the **OpenCode path** to the path found above, or click **Auto-detect**.

## Authentication

OpenCode manages provider credentials itself, so there is no API key field for it in Agent Client.

1. Run OpenCode in your terminal:

```bash
opencode
```

2. Run the `/connect` command in the TUI, select a provider, and paste its API key.

Credentials are stored in `~/.local/share/opencode/auth.json` and are picked up by the `opencode acp` process that Agent Client starts. You can also configure providers from the command line with `opencode auth login`.

::: tip Migrating from a custom agent
If you previously set up OpenCode as a custom agent with the id `opencode` (as these docs once described), your settings are migrated to the preset automatically — saved sessions keep working.
:::

## Verify Setup

1. Click the robot icon in the ribbon or use the command palette: **"Open chat view"**
2. Switch to OpenCode from the agent dropdown in the chat header
3. Try sending a message to verify the connection

Having issues? See [Troubleshooting](/help/troubleshooting).
