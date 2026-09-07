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
| **Edit title** | Rename the session from the history modal |
| **Restore** | Resume the session on the harness that created it |
| **Fork** | Create a new branch from that point in the conversation |
| **Delete** | Remove one session from local history |
| **Clear session history** | Delete many local sessions by time range (dropdown: last 15 minutes, last hour, last 7 days, all time). Confirms first; wipes **all harnesses**. |

::: tip
Fork still depends on the live agent's capabilities. Restore uses the saved harness and local transcripts when ACP load is unavailable.
:::

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

Forking creates a new session branching from a previous point:

1. A new session is created with a copy of the conversation up to that point
2. The original session remains unchanged
3. New messages go to the forked session

Use fork when you want to **explore a different direction** without affecting the original conversation.

## Deleting Sessions

To delete one session:

1. Click the **Delete** button (trash icon) on the session
2. Confirm the deletion in the dialog

To clear many sessions:

1. At the **top** of the history modal, choose a time range from the dropdown
2. Click **Clear** and confirm. This removes local history for that range across **all agent harnesses**.

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
