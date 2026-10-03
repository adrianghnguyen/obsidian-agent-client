# Note Mentions

Reference your Obsidian notes directly in conversations with AI agents.

## Auto-Mention Active Note

When enabled, the plugin automatically includes the currently active note in your message. This is useful when you want to discuss or work on the note you're viewing.

Enable this in **Settings → Agent Client → Composer → Mentions & context → Auto-mention active note**.

### How Auto-Mention Works

Unlike manual mentions, auto-mention only passes the **note's file path** to the agent—not its full content. The agent can then use its Read tool to examine the file if needed.

When auto-mention is active, a badge appears above the input field showing the current note name (e.g., `@My Note`).

### Temporary Disable

The active-note chip is always shown whenever a note is open, in every mode, and its **×** always drops the note (and any selected text) from the next message—even when a selection is live or the mode is "don't attach". When the note would not attach, the chip shows with a struck-through label and a **+** to attach it again. Either way the change only affects the next message; after you send, the chip returns to the current mode's default.

<p align="center">
  <img src="/images/temporary-disable.gif" alt="Temporarily disabling auto-mention" />
</p>

### Selection Context

If you select text in your note, the selected lines are passed as context to the agent. The badge will show the line range (e.g., `@My Note:5-10`), and the agent receives both the file path and the selected content.

A live selection attaches even when auto-mention or the floating attach control is turned off. It keeps attaching on every send until you collapse the selection, and it survives clicking into the chat composer. To drop a selection for one message, click the chip's **×** (the **+** brings it back).

<p align="center">
  <img src="/images/selection-context.gif" alt="Selection context feature" />
</p>

### Floating chat active note

The active-note `@` chip and the `@` chips for manually attached files render from one shared composer row in every chat variant, so the chip, its toggle, and the file chips look and behave the same in sidebar, floating, and embedded chat. Only the floating attach-mode glyph is floating-specific.

When floating chat will attach the active note, the composer shows one `@Note` chip. The mode glyph sits inside the chip on the **left**; click it to cycle:

1. **First message only** (file with +1) — attach the active note on the first message of that window.
2. **Keep active note** (file with ∞) — the chip follows whichever note is active, and that note is attached on every message.
3. **Don't attach** (×) — no note is attached; use `@` mentions yourself.

The `@Note` chip is always shown while a note is open. Click the `@Note` label or its **×** to drop that note for the next send; when the note would not attach, the chip shows struck-through with a **+** to attach it. The mode glyph shows on its own only when no note is open.

Set the default in **Settings → Agent Client → Composer → Mentions & context → Floating chat active note**. The composer button only changes the current floating session. This is independent of global **Auto-mention active note** (sidebar and embedded chat still follow that setting).

## Manual Mentions

Use the `@` syntax to reference specific notes:

```
@[[My Note]]
```

As you type `@`, a dropdown appears with matching notes from your vault. Select a note to insert the mention.

### How Manual Mentions Work

When you send a message with manual mentions:

1. The plugin reads the content of the mentioned notes
2. The note content is included in the message sent to the agent
3. The agent can then reference, analyze, or modify the note content

## Expand Wikilink Context

When you mention (or auto-mention) a note, any `[[wikilinks]]` inside its content are opaque to the agent—it can't tell which file each one points to. With **Expand wikilink context** on (the default), the plugin sends a compact `<obsidian_note_links>` block **alongside** the note (never mixed into the note body) that resolves each `[[link]]` to a file path and `file://` URI:

- `resolved="true"` — the file the link resolves to (with `path` / `uri`)
- `resolved="false"` — no match in the vault

Each link resolves to the single file Obsidian itself would open (same-folder priority), so the agent sees where the link actually points. Only pointers are sent—never the linked notes' content. The agent decides what to open with its Read tool. Links inside code blocks, `![[embeds]]`, and in-note `[[#anchors]]` are skipped, and each note is capped at 50 links.

Toggle it in **Settings → Agent Client → Composer → Mentions & context → Expand wikilink context**.

::: info Not the same as "Wikilink formatting"
This setting resolves `[[links]]` **inside your notes** into paths for the agent to read. The separate **Reply formatting → Wikilink formatting** setting instead asks the agent to **write** `[[Note Name]]` links in its replies. See [Prompt Injection](/usage/prompt-injection).
:::

## Length Limits

To prevent excessively large messages, the plugin limits the amount of content included:

| Setting | Default | Description |
|---------|---------|-------------|
| **Max note length** | 10,000 characters | Maximum characters per mentioned note |
| **Max selection length** | 10,000 characters | Maximum characters for text selection in auto-mention |

Configure these in **Settings → Agent Client → Composer → Mentions & context**.

::: tip
Content exceeding the limit is truncated with a note indicating the original length.
:::

## Tips

- Use manual mentions to include specific notes as context
- Mention multiple notes to give the agent a broader understanding
- For large notes, consider selecting the relevant portion and using auto-mention instead
