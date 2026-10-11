# Session History

Resume previous conversations or branch off from past sessions.

## Agent Support

Session history features are agent-specific. Not all agents support all features.

## Opening Session History

Click the **History** button (clock icon) in the chat header to open the session history modal. The list shows **all locally saved sessions across every agent harness**, including chats from other working directories.

At the top of the modal you can **Clear session history** (time-range dropdown) and **Filter history by harness** (All harnesses, or a specific agent). Use **Show current vault only** if you want to narrow by working directory.

Each row shows which agent (harness) that conversation used. **Restore** / Play switches to that harness and reloads the local transcript.

## Available Actions

Depending on the agent's capabilities, you can perform the following actions:

| Action | Description |
|--------|-------------|
| **Pin / Unpin** | Keep a thread so it reopens on the next harness start even if you closed the tab. You can pin as many sessions as you want. Pinned rows stay at the top of the list |
| **Edit title** | Rename the session from the history modal |
| **Restore** | Resume the session on the harness that created it |
| **Fork** | Create a new branch from that point in the conversation |
| **Delete** | Remove one session from local history |
| **Clear session history** | Delete **unpinned** local sessions **older than** a chosen age (dropdown: older than 15 minutes, 1 hour, 7 days, or all time). Confirms first; wipes across **all harnesses**. Pinned sessions are kept |

::: tip
Fork still depends on the live agent's capabilities. Restore uses the saved harness and local transcripts when ACP load is unavailable.
:::

## Pinned sessions

Pin any conversation from Session History (pin icon), the chat **⋮** menu, or the Session Manager. Closing the tab does **not** unpin it. The next time that harness starts (plugin reload, Obsidian restart, or opening chat when those threads are not already open), every pinned session comes back as its own tab.

**New chat**, **+**, and **Open new view** still start a blank session.

Pinned tabs in floating chat cannot be closed with a tap on × or a middle-click. Hold the tab until it arms (~800ms), then release to close. Unpin is a separate action.

## Session Storage

Sessions are saved automatically when you send messages. The plugin stores:

- **Session metadata**: Title (derived from your first message), timestamps, and working directory
- **Message history**: Full conversation including agent responses, tool calls, and plans

### Where Sessions Are Stored

Sessions are saved in two places:

- **Plugin side**: Stored locally in Obsidian's data folder
- **Agent side**: Managed by the agent

## Restore vs Fork

### Restore

Restoring a session continues the existing conversation:

1. The agent reconnects to the previous session
2. Your conversation history is displayed
3. New messages continue the same session

Use restore when you want to **continue where you left off**.

### Fork

There are two ways to branch a conversation:

**From a message** — Hover any bubble and click the branch icon (**Fork into a new chat from here**). A new sibling chat opens with the transcript through that message. The original chat stays open. The new agent session starts fresh; your first prompt in the fork includes that history as context so you can take a different direction from that point.

**From Session history** — The git-branch button on a history row uses the agent's native session fork when the live agent supports it. That replaces the current chat with the new branch (the original remains in history). It copies the **whole** saved transcript, not a single message.

Use either when you want to **explore a different direction** without affecting the original conversation.

## Deleting Sessions

To delete one session:

1. Click the **Delete** button (trash icon) on the session
2. Confirm the deletion in the dialog

To clear older sessions:

1. At the **top** of the history modal, choose an age cutoff from the dropdown (e.g. Older than 7 days)
2. Click **Clear** and confirm. This removes local history older than that cutoff across **all agent harnesses**.

::: warning
Deletion removes the session from the plugin's local storage only. The session still exists on the agent side.
:::

## Troubleshooting

### "This agent does not support session restoration"

The current agent doesn't provide session restore/fork capabilities. You can still view and delete locally saved sessions.

### "Preparing agent..."

The agent is still initializing. Wait a moment for the agent to become ready.

### "No previous sessions"

No local sessions are saved yet. Start a conversation; it will appear here for every harness.
