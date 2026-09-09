# Changelog

High-level overview of user-facing changes on this fork. Keep entries short — what users get, not implementation detail.

## [Unreleased]

### Fixed
- Floating chat default window size now honors Settings width/height (CSS minimums no longer override smaller configured defaults).

### Changed
- Smaller default floating chat window size (340×400).
- Floating chat last window size and position are stored per device (not synced via Obsidian Sync).

## 0.20.1

### Removed
- **Harness warmup on Obsidian load** — Antigravity ACP init takes tens of minutes, so background warm did not help first chat; feature reverted.

## 0.20.0

### Added
- **Session History lists every local chat across harnesses** (Cursor, Antigravity, and others), not only the current vault or live agent. Restore/Play switches to the saved harness and reloads the local transcript when ACP load cannot.
- **Clear session history** at the top of the history modal: clear any sessions **older than** 15 minutes, 1 hour, 7 days, or all time, with a confirm that it wipes all agent harnesses.
- **Filter history by harness** dropdown in Session History (All harnesses, or a specific agent).
- Command palette: **Open session history** (opens the history modal on the focused chat).

## 0.19.0

### Changed
- Voice input: mic moves inline with the chat textarea (circular control). While recording, a capsule shows stop, timer, live audio level bars, and a circular send that stops dictation and submits like Enter.
- Floating chat: active voice recording keeps the window opaque via a composable presence engagement latch (treated as focused for idle transparency).

## 0.18.0

### Added
- **Session History recalls agent harness.** History lists sessions from all agents (for the current vault filter), shows which agent each session used, and switches to that agent before restore so cross-agent restore succeeds.
- **Floating chat idle transparency.** Optionally fade the floating window after you leave it (pointer out, no focus inside), after a configurable delay. Hover, scroll, focus inside, or drag/resize keeps it opaque. **Idle opacity (%)** controls how visible the faded window stays (slider + number; lower = more transparent). Set fade delay to 0 to disable.

### Fixed
- **Session History harness chip.** Each row shows the agent in a muted chip; turn-end history writes always stamp the harness id, and agent-list rows without local data fall back to the current agent for display.

## 0.17.0

- Settings: reorganized into expandable sections (Getting started, Agents, Chat & input, Floating chat, Behavior, Export, Voice input, Developer) so common options are easier to find; agents sit near the top.
- Settings → Agents: enabled agents appear first; disabled agents stay at the bottom of their list and move up when you turn them on.
- Settings → Agents: optional Hide unused agents toggle to hide disabled agents from the preset/custom lists.
- Floating chat remembers its last window size and position across Obsidian restarts (including when you quit soon after dragging or resizing).
- Settings → Floating chat: configure default floating window width and height (used when no last size is saved). Position is always restored from the last drag.

## 0.16.2

- Voice input: fix dictated text duplicating or cutting off mid-sentence — transcript accumulation now happens in one place (the input field) instead of twice in the pipeline.
- Voice input: transcription mode and language codes from Settings are now sent to the Gemini Live API; server-side pause tolerance (2 s silence window) reduces lost speech after natural pauses.

## 0.16.1

- Tool calls from agents that send `rawInput` as a JSON string (e.g. anti-gravity) no longer crash the chat with `Cannot use 'in' operator`; tool names and subagent detection now parse correctly.
- Restoring a session after the agent process exits no longer fails with the cryptic "ACP connection closed" — you now get an actionable error (agent exited / not connected) instead.

## 0.16.0

- Floating chat close button now minimizes by default (quick click); long-press (~0.8s) turns red to close all sessions. Applies to both tabbed and standalone floating windows.

## 0.15.2

- Voice input: flat mic button in the chat toolbar (matches the send button, no background), and while recording the icon switches to audio-lines in yellow with a soft pulse. Removed the duplicate status-bar mic — the toolbar button is now the single indicator.
- Voice input: dictated speech now appends to the prompt (and to earlier dictated segments) instead of overwriting it, with a space inserted between segments; stopping or an error keeps everything finalized so far and clears only the live preview.
- Voice input: consecutive spoken chunks are now joined with a space in the input box, so words from separate chunks are no longer glued together.

## 0.15.1

- Voice input: fix "Live API setup timed out" — setup messages from the Gemini Live server can arrive as a Blob, which was being dropped, so the handshake never completed.

## 0.15.0

- Voice input: transcribe your voice into the chat input via the Gemini Live API. Add your Gemini API key under Settings → Voice Input, then use the mic button in the chat input toolbar. Note: this version had a setup handshake bug (fixed in 0.15.1).

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