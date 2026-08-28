# Changelog

High-level overview of user-facing changes on this fork. Keep entries short — what users get, not implementation detail.

## 0.14.2

- Renamed the floating-chat mode cycle command to **Change agent mode** (`agent-client:change-agent-mode`).

## 0.14.1

- **Change agent mode** hotkey/command cycles Agent / Plan / Ask (or whatever the agent advertises) on the floating chat — same order as the toolbar picker, no modal. Removed the separate **Switch session mode** picker command.

## 0.14.0

- Subagent / Agent / Task work shows in chat (title, status, output, nested tools) instead of disappearing.
- Command: **Change agent mode** (assign a hotkey in Settings → Hotkeys). Uses whatever modes the connected agent advertises (for Cursor ACP that is Agent / Plan / Ask). No-ops with a notice if the session has no modes.
- Limitation: ACP still allows only one prompt in flight per session. A subagent can run inside that turn (and no longer freezes the chat UI), but you cannot send another message until the agent finishes.

## 0.13.4

- Floating chat entry modes: Off / Floating button / Status bar / Commands only (replaces the Enable floating chat toggle). Status-bar mode adds a click-to-toggle icon and hover Session Manager popover.
- Tabbed floating chat: new-tab (+) sits to the right of the last tab in the strip.

## 0.13.3

- Cursor Plan mode: show the full plan document in chat (not only the short todo checklist).

## 0.13.2

- Tabbed floating chat: move the new-tab (+) control beside the tab strip.

## 0.13.1

- Tabbed floating chat: More, new tab, minimize, and close session controls live in the tab bar; close session uses a light red outline.

## 0.13.0

- Optional **floating chat tabs**: multiple independent chats in one floating window (Settings → Floating chat → Enable floating chat tabs). Focus next/previous still cycles each chat.
