# Trace verbosity

Client display only. Does not change ACP `thought_level`.

**Full** — complete unfiltered trace. Every tool, thought, and body (diffs, commands, output).

**Compact** — hybrid. Consecutive similar items group to cut verbosity; expand a group and open folded details. Still shows the **final thought** on the timeline, expanded. Intermediate thoughts stay folded in groups.

**Hidden** — abstracts the intermediary trace. Top-level is **final output** only: assistant answer, plus plans and active permissions. All intermediary work (tools, intermediate thoughts, and the last thought) lives in **one folded callout** (de-emphasized). Do not peel an expanded final-thought row.

**Exceptions:** Cursor Create Plan and ACP `type: "plan"` stay top-level like active permissions — not inside the Hidden buffer or Compact kind groups. Create Plan (`kind: "think"`) must not steal Compact’s final-thought slot.

## Same turn, three levels

Turn: thought → read 1 → search 2 → edit 2 → thought → answer. Optional plan / permission stay top-level.

**Full** — every card, bodies open:

- Thinking (open) · Read (open) · Search · Search · Edit (diff open) · Edit · Thinking (open) · answer

**Compact** — grouped rows; expand a group for cards. Final thought peeled + expanded:

- ▸ Thinking · ▸ Read · 1 · ▸ Search · 2 · ▸ Edited · 2
- ▼ Thinking (final, body open)
- Plan / permission (if any) · answer

**Hidden** — one folded background callout for the whole intermediary trace (including last thought):

- ▸ Read 1 file… Searched 2 times… Edited 2 files
- Plan / permission (if any) · answer
