# Floating Chat

A persistent, draggable chat window that floats over your workspace. Perfect for quick conversations without leaving your current view.

<p align="center">
  <img src="/images/floating-chat-view.webp" alt="Floating chat window open over the editor" />
</p>

## Overview

The Floating Chat provides a lightweight alternative to the sidebar chat view:

- **Draggable window** — move it anywhere on screen
- **Resizable** — drag the edges to adjust size
- **Collapsible** — hide the window without losing your session
- **Multi-window or tabs** — open parallel chats as separate windows, or as tabs in one window
- **Independent sessions** — each window or tab runs its own agent session

::: tip
Choose an entry mode under **Settings → Agent Client → Floating chat**.
:::

## Entry modes

| Mode | Floating windows + commands | Floating button | Status bar |
|------|-----------------------------|-----------------|------------|
| **Off** | No | No | No |
| **Floating button** | Yes | Yes | No |
| **Status bar** | Yes | No | Yes |
| **Commands only** | Yes | No | No |

Default: **Off**.

### Floating button

1. Set **Floating chat** to **Floating button**
2. A floating button appears in the bottom-right corner
3. Click the button to open a chat window
4. Start chatting — the window works just like the sidebar chat

<p align="center">
  <img src="/images/floating-chat-button.webp" alt="Floating button in the bottom-right corner" width="200" />
</p>

### Status bar

1. Set **Floating chat** to **Status bar**
2. A bot icon appears in Obsidian’s status bar
3. **Click** the icon to toggle floating chat (same one-key open/minimize behavior as the Toggle command)
4. **Hover** the icon to open a Session Manager popover listing active sessions — click a row to focus that session

### Commands only

Floating chat works through the command palette / hotkeys only — no floating button and no status-bar icon.

## Moving and Resizing

- **Drag** the header bar (or the tab bar in tabs mode) to move the window
- **Resize** by dragging the bottom-right corner of the window
- Position and size are saved automatically

## Multiple Windows

Open more than one floating chat window to run parallel conversations (default when **Enable floating chat tabs** is off).

### Opening Additional Windows

- Click **"Open new floating chat"** from the **⋮** (More) menu in the floating window header
- Or use the command **"Open new floating chat view"** from the command palette

### Switching Between Windows

When multiple windows exist and the entry mode is **Floating button**, clicking the floating button shows an instance menu:

<p align="center">
  <img src="/images/floating-chat-instance-menu.webp" alt="Instance menu with multiple sessions listed" width="300" />
</p>

- Click a session name to expand that window
- Click **×** to close a session

With **Status bar**, hover the status-bar icon and pick a session from the popover.

::: tip
The focused floating window is always displayed in front of other floating windows.
:::

## Tabbed Floating Chat

Enable **Enable floating chat tabs** under **Settings → Agent Client → Floating chat** to keep multiple independent chats in **one** floating window.

- **"Open new floating chat view"** and the header **⋮** menu add a **tab** to the existing window (or create the window if none exists)
- Use the tab strip to switch chats; **+** (left of the tabs) opens a new tab; **×** on a tab closes that chat
- Header close closes the **active** tab; closing the last tab closes the window
- Minimize hides the whole window while preserving every tab’s session

### Focus cycling (same hotkeys)

**Focus next chat view** / **Focus previous chat view** still cycle each floating chat — whether it is a separate window or a tab inside the shared shell. Sidebar and embedded chats stay in the same cycle. No new hotkeys are required.

## Commands

| Command | Description |
|---------|-------------|
| **Toggle floating chat view** | With **One-key toggle** on (default): open/expand if hidden, minimize if shown. With the setting off: open/expand only |
| **Open new floating chat view** | Create a new floating window, or a new tab when tabs mode is on |
| **Minimize floating chat view** | Hide the focused floating window (session is preserved). Use with a separate hotkey when One-key toggle is off |
| **Close floating chat view** | Close the focused floating chat (window or tab) and end that session |
| **Focus next chat view** | Move focus to the next chat view (including floating tabs) |
| **Focus previous chat view** | Move focus to the previous chat view (including floating tabs) |

::: tip
Assign keyboard shortcuts to these commands in **Settings → Hotkeys** for quick access. With One-key toggle on, bind a single hotkey to **Toggle floating chat view**.
:::

## Configuration

Customize the floating chat in **Settings → Agent Client → Floating chat**:

| Setting | Default | Description |
|---------|---------|-------------|
| **Floating chat** | Off | Entry mode: Off / Floating button / Status bar / Commands only |
| **Enable floating chat tabs** | Off | Group multiple floating chats as tabs in one window |
| **One-key toggle** | On | Same hotkey opens or minimizes the floating chat. Turn off to use separate Open and Minimize hotkeys |
| **Floating button image** | Default icon | URL or vault path to a custom button image (only when entry mode is Floating button) |
