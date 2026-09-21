# v3 trial — state machine

Canvas: eval-v3-state-machine · Sessions run this battery: 3 (S3/S4/S5; S1 build pre-existing and accepted earlier today) · Date: 2026-07-22
Baseline being compared: `findings-state-machine.md` (old eval, canvas eval-state-machine, 8 sessions).

Committed state entering the battery: 6 colored states (Idle/Connecting/Connected/Degraded/Reconnecting/Disconnecting), 8 labeled transitions, dashed-red failure path (timeout / packet loss > 5% / grace expired), margin sticky. All sessions scoped `["page-frame"]` (server expands to all 9 objects).

## Sessions

### S3 — "Recolor shutdown path (close(), socket closed) teal; add violet Suspended from Connected (suspend()) and Degraded (quarantine), returning to Reconnecting (resume window), solid violet; keep everything else exactly as is"
- session/container: bd50af27-5110-462b-ad27-812cdb43064e / 8c56a2b1-c9d9-5c57-a918-bf762d85abb1
- outcome: committed → ACCEPTED and materialized (PUT OK; canvas now 9 objects / 11 connections)
- tool sequence: fit_scope → inspect → apply_ops (all 6 ops in ONE call) → render_draft → commit. 5 turns, **zero failed calls, zero grammar retries** (old S3 needed 5 failed propose_program calls; old S5 died on 4).
- op mix: `Counter({addConnection: 3, updateConnection: 2, addObject: 1})`
- **updateConnection-vs-duplicate verdict: PASS.** The teal recolors landed as `updateConnection {connectionId: edge-connected-disconnecting, patch:{color:"teal"}}` and the same for `edge-disconnecting-idle` — the exact existing edge ids, no addConnection duplicates, no leftover gray strokes in the render. The turn-0 fit_scope result contained the new connection inventory verbatim: "Connections (use updateConnection with these ids to relabel/restyle; never add a duplicate edge):" followed by all 8 edges with id/endpoints/label/style/color. The fix works as designed and the agent followed it first try.
- aesthetic: 4 — intent fully landed (in-place teal recolor, correctly wired violet Suspended cluster, everything else untouched); the only defect is the "quarantine" label chip overlapping the "session resumed" label chip (reads "sessi[quarantine]"), plus mild violet/gray edge crossings near Suspended.
- delta vs old: old S5 (styling-only) **abandoned** — "the scoped layout language exposes connector routing but not connector color or dash styling"; old S3 (add Suspended) committed at 2.5 with three floating label chips physically overlapping state boxes. New: both requests fused into one session, committed at 4 with real connector labels and channel ops, 5 turns, no compensation hacks.
- note: commit summary claimed "no remaining flaw" despite the chip-on-chip label overlap; `Lint: clean` — lint's new overlap findings don't see connection-label chips.

### S4 — "Add a heartbeat self-loop on Connected (Connected back to Connected, label heartbeat/30s)"
- session/container: e6d6f74b-8e0c-41c1-8d8b-e9f031354b4a / 791ed29b-ffb4-5a08-ae77-e3a8052943bf
- outcome: committed by agent → **REJECTED by me** (clear regression vs instruction scope)
- tool sequence: fit_scope → apply_ops (addConnection self-loop **skipped**: "endpoints unavailable after earlier ops" — false, there were no earlier ops) → propose_program (whole-scope re-solve, "Moved 8 objects") → render_draft → fit_scope → apply_ops (updateConnection label/style/color on the solver-created `draft-connection-1`) → render_draft (cropped zoom hunting for the loop) → render_draft (full) → commit. 9 turns.
- op mix: `Counter({updateObject: 8, addConnection: 1})` — 8 of 9 ops are unrequested geometry rewrites.
- **self-loop verdict: STILL BROKEN, in a new two-layer way.**
  1. `apply_ops` addConnection with `from == to == seed-connected` is refused with the misleading skip reason "endpoints unavailable after earlier ops" (turn 1). Reproduced identically in S5. The direct-ops path categorically cannot create a self-edge, and the error text misdiagnoses itself.
  2. The fallback `propose_program` arrows block DID create the self-edge (`draft-connection-1`), but the router renders it invisibly — no loop lobe, no label anywhere in the draft (agent turn-7 thinking: "Assessing hidden self-loop possibility"; commit summary admits "the self-loop label is present in the connection data but did not appear in the draft render"). Old S1b drew the self-loop as a degenerate line through the box; v3 draws nothing at all.
  3. Collateral: the whole-scope re-solve moved ~170–600px and resized ALL 8 existing objects — Degraded and Disconnecting shrunk to 132×69 (text wraps), the sticky ballooned 288×176 → 518×389, and the new geometry is off the 16px grid (x=1433, y=289, 248×130, 919/1271…), which the old solver never did (old R4 lattices were grid-exact).
- channel-survival check (silver lining, observed in the rejected draft): the re-solve preserved every label, the dashed-red styling, the teal recolors, and the violet edges — the old eval's "channel loss through re-solve" failure mode did not reproduce.
- aesthetic (draft, pre-reject): 1.5 — non-uniformly shrunken states, wrapped text, inflated sticky, and the one thing asked for is invisible.
- process note: genuinely good render-first behavior (3 renders including a targeted crop zoom to look for the loop) and an honest commit summary declaring the flaw — the prompt mandates work; the tooling under them doesn't, for this case.
- delta vs old: old S1b self-loop = degenerate line through the box, committed silently among 14 failed DSL calls. New: zero failed calls, honest flaw declaration — but the loop is now invisible instead of degenerate, and the attempt cost an unrequested whole-board re-layout.

### S5 — retest: "Add the heartbeat self-loop using direct document ops only — do NOT re-solve or move/resize anything; abandon and explain if impossible"
- session/container: 4a629a30-7808-4518-b545-547b1958883a / ab701071-2a93-565b-b3af-071882291101
- outcome: abandoned (agent's own, turn 3, <90s; board untouched — verified post-session, file == API, geometry intact)
- tool sequence: fit_scope → apply_ops (self-loop skipped, identical bogus reason) → inspect → abandon. 4 turns, 0 ops proposed.
- abandon reason (verbatim): "Could not add the requested self-loop with direct document ops: addConnection rejected the same Connected object as both endpoints ('endpoints unavailable'). No objects were moved or resized, and the board remains unchanged."
- reading: the S4 wreck is not agent recklessness — it is the only path the tooling leaves open. Constrained to direct ops, the agent correctly diagnoses the refusal and refuses honestly (R10-style behavior surviving into v3, now with an accurate self-diagnosis of an inaccurate error message). Self-loops are a hard tooling gap, not a steering gap.

## What v3 fixed for this type (vs old findings)

- **Connector styling/labels are now first-class and surgical.** Old MECH: DSL expressiveness (S5 abandon: no color/dash vocabulary; S1b: 4 label syntaxes rejected → floating chips → fake intermediate nodes) is gone: S3 did recolor + 3 labeled colored edges + 1 node in one apply_ops call, zero retries.
- **The duplicate-edge defect is fixed at the source.** fit_scope's connection inventory names every edge id and says "never add a duplicate edge"; the agent used updateConnection on existing ids first try.
- **The grammar-guessing tax is gone.** Old: 30+ failed propose_program calls across 8 sessions. New: 0 failed calls in 3 sessions (the one "skipped" op was a semantic refusal, not syntax).
- **Channel state survives re-solve.** S4's whole-board re-solve preserved labels, dash, and all colors (old system erased size/label distinctions through re-solve).
- **Render-first + honest summaries are real.** S4 rendered 3× including a crop-zoom, and its commit summary declared the invisible-loop flaw instead of hiding it (old S1b saw its flaw in one render and committed silently).

## What v3 did not fix

- **Self-loops — the type's defining reflexive edge is still unexpressible** (known router limit, but now worse-shaped): apply_ops refuses self-edges outright with a false error message; propose_program creates them but renders no lobe and no label. Old rendered a degenerate line through the box; new renders nothing.
- **Lint still misses label-chip overlaps** (S3: "quarantine" chip sits on "session resumed" chip, `Lint: clean`) — same blind spot class as old S3's chip-on-box misses; the new overlap findings apparently only cover objects.

## New defects v3 introduced

1. **apply_ops self-edge refusal with misleading diagnostics** — "skipped (endpoints unavailable after earlier ops)" when there were no earlier ops and both endpoints exist (S4 turn 1, S5 turn 1). Should either work or say "self-referential connections unsupported".
2. **Destructive fallback amplification** — because the direct path refuses, an innocent "add one edge" instruction escalates to a whole-scope propose_program that moved/resized all 8 objects (S4 turn 2, "Moved 8 objects"), i.e. the surgical-edit promise of v3 inverts precisely on self-loops.
3. **Off-grid solver geometry** — the S4 re-solve emitted sizes/positions like 132×69 @ (1822,518) and 518×389, violating the 16px grid that both hand edits and apply_ops honor (old solver output was grid-exact). Caught only because I diffed the ops; lint said clean.
4. (Minor) **"No remaining flaw" overclaim in S3's summary** while a label-chip overlap was visible — the honesty mandate is only as good as what lint/render inspection surfaces.

## Verdict: ready to scale for this type — with one carve-out

For everything state machines need EXCEPT reflexive edges, v3 is a step-change: restyle and structural-add requests that previously abandoned or committed at 2–2.5 now land surgically at 4/5 in ~5 turns with zero failed calls, and the duplicate-edge risk the connection inventory targets is demonstrably closed. Blocker: any instruction containing a self-loop is unsafe — the tooling either refuses (best case, constrained) or wrecks the board via whole-scope re-solve while still not drawing the loop. Fix the apply_ops self-edge validation + give the router a self-loop lobe (and put a grid-snap/lint check on solver output geometry) before letting self-loop-bearing instructions through unsupervised.
