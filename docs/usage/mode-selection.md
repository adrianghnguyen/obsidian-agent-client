# Mode Selection

Some agents support different operational modes that change how the agent behaves.

## What are Modes?

Modes are predefined configurations that alter the agent's behavior for specific tasks. For example:

- **Default Mode**: General-purpose assistance
- **Plan Mode**: Focus on planning and architecture before implementation

## Changing Modes

1. Open the chat panel
2. Look for the **mode dropdown** below the input field
3. Select the desired mode from the available options

You can also use commands (assign a hotkey in **Settings → Hotkeys**):

- **Cycle session mode** — advance to the next advertised mode
- **Switch session mode** — open a fuzzy picker

These commands are **focus-gated**: a bound hotkey only fires while a chat view has keyboard focus, so it will not run while you are typing in a note. They still appear in the command palette.

<p align="center">
  <img src="/images/mode-selection.webp" alt="Mode selection dropdown" width="400" />
</p>

::: tip
Available modes depend on the active agent. Not all agents support multiple modes.
:::

## Mode Persistence

The selected mode persists for the current session. Your preference is remembered across sessions.
