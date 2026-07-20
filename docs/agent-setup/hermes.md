# Hermes Agent Setup

Hermes Agent is the self-improving agent built by Nous Research. It works with many LLM providers and communicates via ACP through the `hermes acp` command (available since v0.2.0).

## Install and Configure

Open a terminal (Terminal on macOS/Linux, PowerShell on Windows) and run the following commands.

1. Install Hermes Agent:

::: code-group

```bash [macOS/Linux]
curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash
```

```powershell [Windows]
iex (irm https://hermes-agent.nousresearch.com/install.ps1)
```

:::

The desktop installer and other options are listed in the [Hermes Agent docs](https://hermes-agent.nousresearch.com/docs/getting-started/installation). Note that the `hermes-agent` package on npm is not an official distribution.

2. Find the installation path:

::: code-group

```bash [macOS/Linux]
which hermes
# Example output: /Users/username/.local/bin/hermes
```

```cmd [Windows]
where.exe hermes
```

:::

3. Open **Settings → Agent Client**. The default command (`hermes`) works in many cases. If the agent is not found automatically, set the **Hermes Agent path** to the path found above, or click **Auto-detect**.

## Authentication

Hermes Agent manages provider credentials itself, so there is no API key field for it in Agent Client.

1. Run the interactive provider selector in your terminal:

```bash
hermes model
```

Follow the prompts to pick a provider and paste an API key or complete an OAuth sign-in. Alternatively, `hermes setup --portal` signs in to Nous Portal with OAuth in one step.

2. Verify that a normal chat works in the terminal:

```bash
hermes
```

Credentials are stored under `~/.hermes/` and are picked up by the `hermes acp` process that Agent Client starts.

::: tip Migrating from a custom agent
If you previously ran Hermes Agent as a custom agent, its settings are not migrated automatically. A custom agent with the id `hermes-agent` is renamed to `hermes-agent-2` to make room for the preset — copy any custom path or environment variables into the preset settings, then delete the leftover custom entry.
:::

## Verify Setup

1. Click the robot icon in the ribbon or use the command palette: **"Open chat view"**
2. Switch to Hermes Agent from the agent dropdown in the chat header
3. Try sending a message to verify the connection

Having issues? See [Troubleshooting](/help/troubleshooting).
