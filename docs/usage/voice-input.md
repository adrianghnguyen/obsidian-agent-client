# Voice Input

Dictate messages to your agent with live transcription powered by the Gemini Live API. Voice is optional and off by default.

::: info API key required
Voice input uses Google's Gemini Live API, so it needs a Google AI Studio API key and a network connection. It is separate from the agent you chat with.
:::

## Enable voice input

1. Open **Settings → Agent Client → Voice input**
2. Turn on **Enable voice input**
3. Paste your Google AI Studio API key into **Gemini API key**

A microphone button then appears on the chat input for every chat variant (sidebar, floating, and embedded). While listening, the button shows a live level wave; click **Stop** to finish dictation.

## Choosing a microphone

**Settings → Voice input → Microphone** lists your audio inputs. Pick the one you want to dictate with, or leave **System default** to follow the operating system.

- **This device only** — device names are specific to the computer that recorded them, so your choice is saved locally and is never synced through your vault. Set it again on each machine.
- **Device names** — browsers return a generic label until microphone access has been granted. The first time you open the Voice input settings section, the plugin asks for microphone permission so the names become readable. If names stay generic, grant microphone access for Obsidian in your OS privacy settings and reopen the section.
- **Unavailable on this device** — shown when the saved microphone is not currently connected, so the dropdown does not silently switch to another input.

## Testing a microphone

Click the **mic** icon beside the Microphone dropdown to test the selection. The icon turns into a stop button and a level bar fills as you speak. Use it to confirm the chosen input is the one picking up your voice before starting a real dictation.

## Transcription settings

| Setting | What it does |
|---------|--------------|
| **Model** | Gemini Live model name (for example `gemini-3.5-transcribe-live`). |
| **Transcription mode** | **Smart** cleans up the transcript; **Verbatim** keeps every word exactly as spoken. |
| **Language codes** | Comma-separated BCP-47 codes (for example `en-US, fr-CA`). Leave empty to auto-detect. |
| **Custom vocabulary** | Names and jargon Gemini should recognize. Applies on the next voice session. |
| **Pause tolerance** | How long a silence must last before a phrase ends. Longer values keep mid-sentence thinking pauses together. |
| **Stop flush delay (ms)** | How long to wait after you press Stop so the last words are not cut off. `0` skips the wait. |

## Speech detection

Under **Settings → Advanced → Speech detection**:

- **Prefix padding** — audio included before detected speech starts, so the first syllable is not clipped.
- **Start-of-speech sensitivity** — **High** reacts quickly when you begin speaking; **Low** waits for clearer speech.
- **End-of-speech sensitivity** — how eagerly the model decides you have stopped talking.

## Commands

- **Toggle voice input** (command palette) starts or stops dictation for the focused chat.

## Troubleshooting

- **No device names, only "Microphone 1", "Microphone 2"** — microphone access has not been granted yet. Open the Voice input section (or test the mic) and allow access. On macOS, also enable Obsidian under **System Settings → Privacy & Security → Microphone**.
- **"Could not access the microphone" when testing** — another application may hold the device exclusively, or permission was denied. Close the other app or re-grant access.
- **The level bar stays flat** — the wrong input may be selected, the device may be muted, or you may be speaking into a different microphone. Re-test with the mic icon.
- **Wrong microphone used at dictation time** — confirm the pick under **Settings → Voice input → Microphone**; the checklist is per device, so it may differ on another computer.
