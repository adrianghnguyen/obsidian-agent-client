# Changelog

High-level overview of user-facing changes on this fork. Keep entries short — what users get, not implementation detail.

## [Unreleased]

### Added
- **Cursor API key setting** — Settings → Cursor exposes **API key (Secrets manager)** (`CURSOR_API_KEY`) with step-by-step copy, env-field guidance, and setup-check text for the Windows desktop vs Terminal login mismatch; session-open and **Check setup** use the resolved secret like other presets.

### Changed
- **Voice input** — While recording, the mic button turns red and the icon becomes live level bars. Hover it to reveal a stop square, then click to stop. Enter or the composer send button still sends the dictation.

## 0.23.0

### Added
- **Voice input advanced settings** — Settings → Voice input exposes custom vocabulary (keyword recognition), pause tolerance (silence before a segment ends), stop flush delay, and speech-detection tuning (prefix padding, start/end sensitivity). Values apply on the next dictation session.

### Fixed
- **Cursor Check setup on Windows** — Health probes no longer run through a Unix login shell; they use the same cmd spawn path as chat so `agent acp` and sign-in are detected when the CLI works in PowerShell.
- **Session open auth (all presets)** — Shared session-open coordinator runs ACP `authenticate` only when a harness `sessionAuthPolicy` reports credentials are not ready. Cursor skips `cursor_login` when `agent status` or `CURSOR_API_KEY` already shows a login (no browser login on every chat load). Claude, Codex, Antigravity, and future presets declare the same contract; registry tests loop every harness so unconditional pre-session auth cannot regress.

### Changed
- **Settings layout** — Settings opens as a short flat list: Agents, Composer, Appearance, Reply formatting, Behavior, Floating chat, Export, Voice input, and Advanced. The default agent sits at the top of Agents. Node path, speech detection, and debug mode are under Advanced. Hide unused agents, the export filename, and the frontmatter tag sit in their sections. Version, documentation, and releases share one line, and recent changes stay folded. Only Agents starts expanded. Section headers show the current value.

## 0.22.0

### Added
- **Composer send buffer** — Send/Enter while a harness is connecting, switching, or finishing a turn queues the message. Cancellable chips sit above the text box; the toolbar uses a queue icon (`list-plus`) instead of send until the session is ready and idle. Chip X cancels that payload so it never sends. The next item flushes then (Cursor and Antigravity).
- **Settings version banner** — Settings shows the installed plugin version, a short list of recent changelog items, and a link to GitHub Releases and tags.
- **Cursor / Antigravity Path** is per device. Enable the harness once; Auto-detect and typed absolute paths stay on this computer and are not written to synced `data.json`. Empty / `agent` / `agy_acp_server.par` probe this machine, so you do not need separate Windows vs Mac agents.
- **Cursor preset** — first-class ACP via `agent acp` (not a custom-agent JSON recipe), setup docs, settings **Check setup** health probe, and distinct connection-failure copy in chat when auth, PATH, endpoint, or process exit fails.
- **Antigravity preset** — first-class support for Google's Antigravity ACP bridge (`agy_acp_server.par` / `.exe` on Windows), with platform path auto-detect, settings health check (bridge, ACP auth, endpoint), and chat error banners that name failure modes and next steps.
- **Default agent scope** — Settings → Getting started: keep the default agent on **All devices (sync)** or **This device only** (local overlay, does not overwrite other computers via Sync).
- **Floating chat transparency lock** — when idle fade delay is greater than 0, an icon in the floating header (next to More / close) locks every floating window fully opaque or restores idle fade. Persists across restarts; delay 0 hides the button.

### Changed
- **README and in-repo docs** — badges, install links, and setup guides point at this fork (`adrianghnguyen/obsidian-agent-client`) and `docs/` in the repository instead of upstream GitHub Pages.
- **Built-in presets trimmed** — Gemini CLI, Mistral Vibe, OpenCode, Kiro, and Hermes Agent are no longer first-class harnesses. Add them as [custom agents](/agent-setup/custom-agents) if you still use those CLIs.
- **Verbosity menu** uses a short header summary with per-option descriptions (Hidden, Compact, Full) in the chat toolbar dropdown.
- **Compact verbosity** groups tools across the whole assistant turn (not per bubble), including singles (`Read · 1`), in-progress tools, edits, and `other` tools (TODOs). The final thought is peeled onto the timeline and expanded; other bodies stay folded until you expand a card.
- **Hidden verbosity** shows one folded turn-level working buffer (tools, intermediate thoughts, and the last thought). Expanding the buffer reveals Compact-style groups, not full tool cards.
- **Hidden and Compact** keep ACP plans and Cursor Create Plan outside the working buffer/groups (same as permission prompts).

### Fixed
- **Settings load** drops orphan `presetAgents` keys from removed harnesses and rewrites `data.json` on the next save; invalid or missing default agent resolves to **Cursor** instead of the first preset in registry order.
- **Cloud E2E vault fixture** — `scripts/cloud-e2e/apply-vault-fixtures.sh` overlays synced defaults (Cursor default, four presets, Whisper on OpenAI) after materialize.
- **Cursor Check setup** treats `agent status` "Not logged in" (exit 0) as missing auth unless `CURSOR_API_KEY` is set, so a green card no longer appears before `agent login`.
- **Antigravity health** now requires `localharness_external` or `ANTIGRAVITY_HARNESS_PATH`, accepts `GEMINI_API_KEY` without a `settings.json`, and probes this computer when Path is empty or a foreign-machine path is missing.
- **Antigravity** health check treats `~/.gemini/antigravity-acp/` (Google OAuth / `acp_token.json`) as the primary auth store. The CLI folder is optional and no longer the only green path.
- **Antigravity** no longer calls `authenticate("gemini-api-key")` when ACP OAuth is already on disk (AI Pro / Google login). API-key mode still authenticates when that is the selected method or `GEMINI_API_KEY` is set without ACP creds.
- **Antigravity** Auto-detect probes `agy_acp_server.exe` on Windows (`.par` remains the macOS/Linux basename).
- **Antigravity** empty chat shows “Starting ACP bridge…” so a ~30s cold `initialize` does not look like a hang.
- **Copy assistant replies** from the copy control at the bottom of the agent message (same hover action as user-sent commands). Copies visible reply text only, not Hidden/Compact tool buffers or thoughts.
- **Floating chat** places the caret in the composer when a window is opened, expanded from minimized, or focused via hotkey/API. Already-visible windows are not refocused on vault clicks, dragging, or header/transparency controls.
- **Voice input** Enter during live dictation sends the current composer/transcript buffer (same as the send control), then clears the speech-to-text turn. Shift+Enter still inserts a newline; the Stop button still stops without sending.
- **Voice input** clears the speech-to-text buffer on send, Enter, stop generation, and voice-clip send, so the previous transcript does not appear on the next turn.
- **Hidden verbosity** no longer renders one summary row per tool message; intermediate thoughts, reads, searches, edits, and TODOs collapse into a single buffer per turn. Permission prompts stay visible outside the buffer.

## 0.21.0

### Added
- **Verbosity level** in the chat toolbar (next to mode / thought level) and Settings → Display: Hidden, Compact (default), or Full. Hides or folds thinking traces and noisy tool details without changing ACP thought_level.

### Fixed
- Floating chat default window size now honors Settings width/height (CSS minimums no longer override smaller configured defaults).

### Changed
- Compact/Hidden verbosity collapse consecutive noisy tools (reads, searches, commands, etc.) into one expandable row.
- Voice input mic button sits to the left of the chat textarea.
- Floating chat tabs can be closed with middle mouse click.
- Smaller default floating chat window size (340×400).
- Floating chat last window size and position are stored per device (not synced via Obsidian Sync).
- **Cycle session mode** / **Switch session mode** are focus-gated: the hotkey only runs while a chat view has keyboard focus (command palette still works).

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