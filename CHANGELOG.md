# Changelog

High-level overview of user-facing changes on this fork. Keep entries short — what users get, not implementation detail.

## 0.14.2

- Floating chat tabs show the same session status icons as Session Manager (ready, busy, permission, error, disconnected).

## 0.14.1

- Session mode selector: Plan mode shows a soft yellow pill, Ask mode a soft green pill (Agent unchanged). Colors apply to the toolbar control and the mode picker menu.

## 0.14.0

- Subagent / Agent / Task work shows in chat (title, status, output, nested tools) instead of disappearing.
- Commands: **Cycle session mode** and **Switch session mode** (command palette / hotkeys). Uses whatever modes the connected agent advertises (for Cursor ACP that is Agent / Plan / Ask). No-ops with a notice if the session has no modes.
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
