# v3 trial protocol — shared reference for the parallel trial agents

You are trialing the NEW v3 board-editor (implemented 2026-07-22, same day) against one diagram
type. The old eval findings live in `findings-<type>.md` in this directory — read yours first;
your job is to measure what changed. `PROTOCOL.md` (the old eval protocol) still applies for
endpoints, scratch-canvas discipline, poll timeouts, and evidence endpoints, EXCEPT as amended
here.

## What's new in v3 (what you are testing)

- `apply_ops`: direct document ops (move/resize via updateObject, setText, recolor, connector
  label/style/color via updateConnection, add/remove objects, connections, stickies). Geometry
  snaps to the 16px grid exactly like hand edits.
- `solve_layout`: selection-scoped solver (Mode A: echo program for a selection; Mode B: apply a
  program's geometry to the selection only — never deletes).
- `propose_program` still exists (whole-scope re-solve); a program with NO arrows block now
  leaves connections untouched; WITH an arrows block the edge list is authoritative (omitted
  in-scope edges are deleted — loud in the delta).
- fit_scope now returns: the program + legend + boundary + a CONNECTION INVENTORY (ids +
  channels) + an exemplar render of the house style on first call.
- Lint gained overlap findings (advisory during edits); the commit gate hard-blocks >25%
  sibling overlap, child-escapes-section, and >16px locked-frame overflow.
- The agent prompt now mandates render-first iteration and honest commit summaries.

## Session battery (4 sessions, in order; accept unless a session's result is a clear regression)

- S1 build: one rich instruction for your diagram type (reuse the shape of your type's old S1),
  and EXPLICITLY exercise the new channels: edge labels, at least one dashed and one recolored
  edge/flow, semantic node colors, one margin sticky.
- S2 surgical probe: a 20px-nudge-class request ("move X ~20px …, change nothing else"). Note:
  grid snap means ±20px lands on 16/32 — judge intent-fidelity, not pixel-exactness, and check
  nothing else moved.
- S3 restyle probe: a styling-only request on EXISTING edges (relabel/recolor/dash) — must land
  as updateConnection ops, NOT duplicate addConnection edges. Check the proposal ops explicitly.
- S4 structural edit: an add-plus-rebalance request of your type's old S2/S3 class (e.g. "add a
  branch/lane/subtree and rebalance"). Watch whether the agent uses solve_layout/propose_program
  vs apply_ops, and whether channel state (labels/styles/colors) survives the re-solve.

## Materialization

`accept` returns ops without persisting. After each accept, apply the ops to
`canvases/<id>.canvas.json` yourself and PUT via `http://127.0.0.1:4000/api/canvases/<id>`
(body `{id, canvas}`), so later sessions build on committed state. Only touch YOUR canvas.

## Report file: `v3-trial-<type>.md` in this directory

Per session: instruction, outcome, tool sequence (from the kernel transcript), proposal op mix
(Counter by type), aesthetic 1–5 with one sentence, and a delta line versus the old eval's
equivalent session ("old: abandoned / new: committed with labels", etc.). End with:
- what v3 fixed for this type (cite old finding),
- what v3 did not fix (router limits are known: lane-crossing detours, self-loops,
  anti-parallel overlap),
- any NEW defect v3 introduced (duplicate edges, channel loss through re-solve, gate
  false-positives/negatives), with session/turn evidence,
- verdict: ready to scale for this type, or blockers.

Budget: ≤5 sessions. Commit nothing to git. Codex CLI is NOT used for any of this — you drive
HTTP + judge renders yourself (download PNGs from the transcript/blob endpoints or rasterize
draft.svg via `qlmanage -t -s 2400 -o . <file>.svg`).
