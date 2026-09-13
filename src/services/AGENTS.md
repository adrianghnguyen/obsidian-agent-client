# Trace verbosity

Client display only. Does not change ACP `thought_level`.

**Full** — complete unfiltered trace. Every tool, thought, and body (diffs, commands, output).

**Compact** — hybrid. Consecutive similar items group to cut verbosity; expand a group and open folded details. Still shows the **final thought** on the timeline, expanded. Intermediate thoughts stay folded in groups.

**Hidden** — abstracts the intermediary trace. Top-level is **final output** only: assistant answer, plus plans and active permissions. All intermediary work (tools, intermediate thoughts, and the last thought) lives in **one folded callout** (de-emphasized). Do not peel an expanded final-thought row.

**Exceptions:** Cursor Create Plan and ACP `type: "plan"` stay top-level like active permissions — not inside the Hidden buffer or Compact kind groups. Create Plan (`kind: "think"`) must not steal Compact’s final-thought slot.
