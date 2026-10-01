---
name: antigravity-cold-start
description: >-
  Fix and diagnose the slow Antigravity ACP bridge cold start. Google's
  agy_acp_server is a PyInstaller onefile that unpacks ~312 MB to %TEMP%\_MEI*
  on every spawn, so a new session takes ~20-25 s before the first prompt. Use
  when an Antigravity chat sits on "Starting ACP bridge…", when redoing the
  onedir conversion after updating the ACP bridge/registry zip, or when checking
  the Debug Mode initialize timing/hints.
---

# Antigravity ACP bridge — cold-start fix + diagnosis

`agy_acp_server` (`agy_acp_server.exe` on Windows, `.par` on macOS/Linux) is
shipped as a **PyInstaller onefile**. Every spawn it unpacks `python310.dll` and
~8,283 binaries (~312 MB) into a fresh `%TEMP%\_MEI<random>\` directory before it
can answer the ACP `initialize` request, then imports `google.api_core`. On
Windows the measured cost is:

| Phase | Onefile (stock) | Converted (onedir) |
|---|---|---|
| spawn | ~10 ms | ~10 ms |
| ACP `initialize` | ~19.5 s | ~4.2 s |
| `session/new` | ~3.4 s | ~3.4 s |
| **to ready session** | **~23–24 s** | **~7.6 s** |

The binder upgrade (1.1.1 → 1.2.1) did **not** remove this: 1.1.1 measured ~30 s,
1.2.1 ~23 s — both still onefile. The unpack is 100% local and is the target.

RCA, measurements, and the upstream thread:
<https://discuss.ai.google.dev/t/acp-server-1-1-1-official-agy-acp-server-cold-starts-in-16s-on-every-windows-spawn/183427/3>

## When to use this skill

- An Antigravity chat sits on **"Starting ACP bridge…"** for ~15–25 s.
- You **updated the ACP bridge** (registry zip / new version) and need to redo
  the one-time onedir conversion.
- You want to confirm where the time goes via Debug Mode traces.

## Step 1 — diagnose (Debug Mode)

1. Settings → Agent Client → Advanced → **Debug mode** ON.
2. Open DevTools (Ctrl+Shift+I) and start an Antigravity chat.
3. Look for (all gated on Debug Mode):
   - `[AcpClient] Antigravity (antigravity) initialize completed in ~19000 ms`
   - if >= 15 s: a hint block naming the onefile cold start, the optional fix,
     and the RCA/thread links.
4. The chat empty state also escalates from the normal connecting copy to the
   slow-boot note (with a "Why this is slow" link) after ~15 s.

Confirm the unpack directly if needed: spawn the bridge and watch `%TEMP%` for a
new `_MEI*` dir growing to ~8,283 files / ~312 MB.

## Step 2 — one-time fix (onedir conversion)

Script: `scripts/antigravity/convert-onedir.mjs` (Node, zero deps).
Procedure + caveats: `scripts/antigravity/README.md`.

```powershell
$exe = "$env:LOCALAPPDATA\agy-acp-server\agy_acp_server.exe"   # Windows
# macOS: "$HOME/Library/agy-acp-server/agy_acp_server.par"
$script = "scripts/antigravity/convert-onedir.mjs"

node $script --inspect --exe $exe    # dry run: parse archive, show plan
node $script --convert --exe $exe    # backup + extract _internal/ + patch TOC
```

What it does: extracts the extractable CArchive entries (`b`, `x`, `Z`, `n`, `d`)
into `_internal/` beside the exe, then rewrites their TOC typecodes to `#`
(same width — offsets and file size unchanged) so the bootloader loads them from
disk instead of unpacking. The PYZ and bootstrap scripts stay inside the exe.

## Step 3 — after updating the bridge (the repeatable workflow)

Each new registry zip is a fresh onefile, so re-run the conversion:

1. `node scripts/antigravity/convert-onedir.mjs --restore --exe <exe>` (restores
   the `.bak`, removes `_internal/`).
2. Replace **both** binaries in the install dir (`agy_acp_server.*` **and**
   `localharness_external.*`) with the new zip's contents.
3. Kill any running `agy_acp_server` / `localharness_external` processes (Windows
   locks running executables).
4. `node scripts/antigravity/convert-onedir.mjs --inspect --exe <exe>` then
   `--convert --exe <exe>`.
5. Start a new chat; confirm `_MEI*` is not recreated and `initialize` is ~4 s.

Windows install dir: `%LOCALAPPDATA%\agy-acp-server\`.
macOS install dir: `~/Library/agy-acp-server/`.

## Related

- Registry manifest (`antigravity-acp`): <https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json>
- Registry lookup skill: `.cursor/skills/acp-registry/SKILL.md`
- Script + RCA: `scripts/antigravity/README.md`
