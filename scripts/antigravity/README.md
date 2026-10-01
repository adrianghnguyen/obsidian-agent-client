# Antigravity ACP bridge — cold-start fix (convert-onedir)

One-time, per-version conversion of Google's **`agy_acp_server`** PyInstaller onefile
into an on-dir layout, so the ACP bridge stops unpacking ~312 MB on every spawn.

## Why this exists (RCA)

`agy_acp_server.exe` is shipped as a **PyInstaller onefile**. On every launch the
bootloader unpacks the embedded runtime — `python310.dll` plus **8,283 binaries,
~312 MB** — into a fresh `%TEMP%\_MEI<random>\` directory, then imports
`google.api_core`. That unpack happens **before** the process can answer the ACP
`initialize` request, so it dominates session startup. Measured on this machine
(bridge 1.2.1, Windows x64):

| Phase | Cold (onefile) | Converted (onedir) |
|---|---|---|
| process spawn | ~10 ms | ~10 ms |
| ACP `initialize` | **~19.5 s** | **~4.2 s** |
| `session/new` | ~3.4 s | ~3.4 s |
| **total to ready session** | **~23–24 s** | **~7.6 s** |

Verified via the plugin's own `AcpClient.initialize()` → `newSession()` in the
`plugin-sandbox-Obsidian` vault: **7.7 s** total after conversion (was ~23–24 s).

The cost is **100% local** (unpack + import) and is **not** fixed by a newer
registry build — 1.2.1 is still onefile and measured ~19.5 s cold.

Upstream thread (root-cause analysis + measurements by `5454_564`):
<https://discuss.ai.google.com/t/acp-server-1-1-1-official-agy-acp-server-cold-starts-in-16s-on-every-windows-spawn/183427/3>

## How the conversion works

1. **Extract once**: read every *extractable* CArchive entry (`b`, `x`, `Z`, `n`,
   and `d` in merge mode) straight out of the archive appended to the exe, and
   write it to `_internal/` beside the exe (mirroring the archive-internal paths).
   This is the same content the bootloader would dump into `_MEI*` — just
   materialized on disk. The `PYZ.pyz`, bootstrap scripts (`s`), and loader
   modules (`m`) stay inside the exe and are **not** touched.
2. **Mark as on-disk**: rewrite those entries' TOC typecodes to `#`. The typecode
   is used only to decide whether to unpack, and `#` is not extractable, so the
   bootloader loads the files from `_internal/` instead of extracting them. The
   replacement is **same-width**, so the archive length, TOC length, and every
   data offset are unchanged — the file size is identical before/after.

The `pyi-contents-directory _internal` runtime option in the archive already
points the contents dir at `_internal`, so no exe-level switch is needed.

## Requirements

- Node.js (any recent LTS). The script uses only `node:fs`, `node:zlib`, `node:path`.
- The `_internal/` folder must sit **beside** the exe, and `python310.dll` must be
  in it (the bootloader needs it to start Python).

## Usage

```powershell
$exe = "$env:LOCALAPPDATA\agy-acp-server\agy_acp_server.exe"
$script = "scripts/antigravity/convert-onedir.mjs"

# 1. Dry run — parse the archive and print the plan. Makes no changes.
node $script --inspect --exe $exe

# 2. Convert — backup, extract _internal/, patch typecodes, atomic replace.
node $script --convert --exe $exe

# 3. Roll back — restore the .bak and delete _internal/.
node $script --restore --exe $exe
```

`--convert` refuses to run without an explicit `--exe` (no silent conversion of
an auto-detected install), refuses to overwrite an existing `.bak` unless
`--force` is passed, and **fails closed** if the cookie/TOC cannot be parsed or
unexpected typecodes are present.

## After converting

1. Close/kill any running `agy_acp_server` / `localharness_external` processes
   (Windows locks running executables), so the replacement can take effect.
2. Start a new Antigravity chat in the client (or reload the plugin).
3. Confirm: `_MEI*` is **not** recreated on spawn, and `initialize` is ~4 s
   instead of ~19 s. `--inspect` also reports `already-done: yes`.

## Caveats

- **Redo after every ACP bridge update**: each new registry zip is a fresh
  onefile. `--restore`, replace both binaries, then `--convert` again.
- **Modifies Google's binary** — this breaks its integrity/signature. Defender
  or SmartScreen may prompt; keep the `.bak`.
- Keep the untouched `.bak`; `--restore` depends on it.
- The companion `localharness_external.exe` is a separate helper and is **not**
  touched (it is not what causes the session-boot lag).
- The plugin spawns whatever `Path` resolves to, so the converted layout needs
  **no plugin change**.

## Related

- Registry manifest (`antigravity-acp`): <https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json>
- Skill: `.cursor/skills/acp-registry/SKILL.md`
