# v3 trial — swimlane pipeline

Canvas: eval-v3-swimlane · Sessions run: 4 (S4 includes one in-session follow-up revision) · Date: 2026-07-22
Old baseline: `findings-swimlane.md` (6 sessions, 3 committed / 3 abandoned).

## Sessions

### S1 — build: 4 tinted lanes, 14 stages, labeled cross-lane handoffs, dashed async, green 200 OK, semantic colors, margin sticky
- session/container: 4f0db100-7538-4ede-9407-c5dec968a267 / 311cc75e-ccc2-5cf1-a05a-fb4d5c8ecf1d
- outcome: committed (propose_program calls: 0; syntax retries: 0)
- tool sequence: fit_scope → apply_ops (full build) → apply_ops (register pass) → render_draft → apply_ops (fix off-ladder 80px gap lint) → apply_ops → render_draft → commit (8 turns)
- op mix: `Counter({addObject: 17, addConnection: 16, updateObject: 2})`
- aesthetic: 4 — lanes, registers, and every requested channel landed (6 edge labels, 2 dashed async edges, green-recolored 200 OK, blue entry/exit + yellow storage semantics, sticky in the bottom margin); the residual defects are the two skip-lane detours (enqueue API→Data, read Data→API) squeezed down the right-margin corridor, the "enqueue" label pill hidden behind the "read" pill in that corridor, and the poll edge's final approach overlapping pick-up-job→process-data (double-arrowhead illusion).
- delta vs old S1: old committed after 13 propose_program retries (12 consecutive `Invalid sketch DSL` rejections) with giant perimeter mega-detours; new built the whole board via apply_ops with ZERO syntax rejections, and the connector channels old S4 abandoned outright (dashed + labels + edge color) all landed in the build session. Old rendered once and committed over acknowledged "giant paths"; new rendered twice and fixed a lint finding between renders. The commit summary honestly flagged its one flaw (sticky inside the frame's bottom margin — the page frame is locked, "outside" wasn't reachable).

### S2 — surgical probe: "Workers lane ~20px taller, nudge Process Data right to clear the poll label, change nothing else"
- session/container: 41d22996-7066-4dba-9d75-41c6156ba195 / e9331859-106d-5e32-961d-5369257fa15c
- outcome: committed
- tool sequence: fit_scope → inspect → apply_ops → render_draft → render_draft → commit (6 turns)
- op mix: `Counter({updateObject: 2})` — lane-workers height 304→320, process-data x 864→880. Nothing else touched.
- aesthetic: 4 — intent-faithful at grid resolution (both deltas snapped to +16px, correctly explained in the summary as "the grid-snapped equivalent of ~20px"); the only cost is that the taller lane consumed its 16px gutter, so Workers now abuts the Data lane (lint said nothing about the 0px lane gap).
- delta vs old S5: old ABANDONED ("can't make the requested isolated ~20px height and horizontal nudges"), and its only solvable workaround reflowed 18 objects for the nudge. New: exactly 2 ops, zero collateral movement, committed.

### S3 — restyle probe: "recolor all Data-lane handoff edges violet"
- session/container: a0fda979-2107-4cce-a716-0a9fbafeb85f / 5d7b1927-9ad1-5c7a-849c-7a6e5a2677a9
- outcome: committed
- tool sequence: fit_scope → apply_ops → render_draft → commit (4 turns)
- op mix: `Counter({updateConnection: 4})` — x-enqueue, x-poll, x-write, x-read, each `{color: violet}` only. No addConnection, no duplicates; dashed/solid styles and all labels untouched (verified in the committed doc).
- aesthetic: 4 — geometry unchanged, all four violet edges render correctly against the violet Data lane tint.
- delta vs old S4 (the styling-only session): old abandoned after 7 syntax probes for a connector-style attribute ("the DSL does not accept connector-style attributes"); new one-shots it — the fit_scope CONNECTION INVENTORY (ids + current label/style/color, with the explicit "never add a duplicate edge" instruction) removed both the discovery problem and the duplicate-edge risk.

### S4 — structural: "add a fifth Observability lane below Data, 2 stages wired from Workers and API; board growth allowed; keep all labels/styles"
- session/container: 6580e529-37c5-4554-8921-34a5047f9abe / 06b0c3cd-ba17-507a-8ea4-6d825a77d1cc
- outcome: committed after one operator follow-up message (proposal 1 → critique → revised proposal 1' → accepted)
- tool sequence: fit_scope → propose_program (full program WITH an authoritative 18-edge arrows block; draft 1 solved) → render_draft → fit_scope → apply_ops (pink lane/stage colors + labels on the 2 new edges via updateConnection) → render_draft → commit; after follow-up: revised propose_program → render → commit.
- op mix (accepted proposal): `Counter({updateObject: 20, addObject: 3, addConnection: 2})`
- channel survival: all 16 pre-existing connections kept their ids, labels, dashed/solid styles, and violet/green colors through the whole-scope re-solve — only the 2 genuinely new edges appeared as draft-connection-1/2. No duplicates, no deletions despite the arrows block being authoritative.
- aesthetic: 4 after revision (2.5 for draft 1) — draft 1 added the lane correctly but its `group` packing collapsed the even stage pitch (Validate Input + Show Progress crammed adjacent after a huge dead run; same in API) and shrank Object Store to size S, all under "Lint: clean"; the follow-up message ("spread stages evenly, keep registers, restore Object Store size") was fully honored in one revision. Remaining defects are the four skip-lane feeds sharing the right-margin corridor (known router limit) and slightly right-clustered Workers/Data stages.
- delta vs old S2/S3: old S2 abandoned against the fixed frame (3 solved drafts, zero renders); old S3 committed at aesthetic 2 with overlapping wrapped connectors and had to fix label loss it introduced. New: growth was authorized and used (frame 1536→2352 tall), the lane landed styled and wired on the first draft, every existing channel survived, and the operator feedback loop measurably improved the final board.

## What v3 fixed (vs old findings)

- Syntax-discovery tax: eliminated. Old S1 paid 12 consecutive DSL rejections and later sessions re-paid it; across the entire v3 battery there were ZERO invalid-program or invalid-op rejections (op cheat-sheet + fit_scope exemplar + connection inventory).
- Connector styling gap (old S4, `MECH: DSL expressiveness` / R10 BLOCKED): closed. Dashed + labeled + recolored edges landed in the build session, and the styling-only session was a clean 4×updateConnection, exactly the shape the trial demanded.
- The 20px-nudge refusal (old S5, R10/R1 BLOCKED): closed. apply_ops moves geometry at grid resolution with zero collateral; the agent even narrated the ±16px snap as intent-equivalence.
- Single-render habit (old `MECH` finding in S1/S2): gone. Every session rendered at least once before committing; S1 and S2 rendered twice; render-first iteration plus honest commit summaries ("only flaw: the sticky sits …", "remaining flaw: crowded right-edge routing corridor") held in all four sessions.
- Channel loss / omission-means-deletion through re-solve (old S6 near-miss): the S4 re-solve with an authoritative arrows block preserved every existing connection id/label/style/color. The loud-deletion contract was never triggered falsely.
- Fifth-lane fit (old S2 BLOCKED on R3 trim minimums): with growth authorized in the instruction, the frame extension was one updateObject and the lane landed with normal spacing.

## What v3 did not fix (known limits, documented, not fought)

- Skip-lane routing (R9): connectors that skip a lane (enqueue API→Data, read Data→API, both Observability feeds) still cannot thread through lanes and detour via the right-margin corridor. Notably better than old (tight gutter hugs instead of 2640px perimeter loops), but the corridor congests as skip-lane edge count grows — by S4 four edges and four label pills share it.
- Anti-parallel overlap: the poll edge's final approach into Pick Up Job overlaps the pick-up-job→process-data edge, reading as a double-headed arrow (present in every render, S1 turn 3 onward).
- Corridor label collisions: "enqueue" rendered hidden behind "read" in S1–S3 (S1 zoom evidence); the S4 revision separated them incidentally, not by any lint/gate signal — there is still no label-overlap finding.

## New defects v3 introduced

- Re-solve normalization silently reverts prior committed surgical geometry: S4's propose_program reset the Workers lane height 320→288, undoing S2's accepted +16px, and the delta narrated it only as a generic resize among 20 moves. Label/style channels survive re-solve; ad-hoc geometry does not, and nothing warns that a previously accepted edit is being washed out. (S4 turn 1 delta: "Workers … resized 2672×320 → 2640×288".)
- Rhythm-blind lint: S4 draft 1's collapsed stage pitch (adjacent crammed stages + huge dead run, Object Store demoted to S) came back "Lint: clean" — the gate catches overlap/escape/overflow but has no spacing-rhythm or register finding, so the ugliest structural regression of the battery was invisible to the machinery and caught only by operator review.
- Gutter consumption without warning: S2's lane growth produced a 0px lane gap (Workers abuts Data); advisory lint flagged an 80px off-ladder gap inside a lane in S1 but said nothing about lane-to-lane contact.

## Verdict

Ready to scale for swimlanes. The battery went 4/4 committed (old: 3/6), with zero language fights, and every request class the old eval scored as BLOCKED — connector styling, the surgical nudge, the fifth lane — landed cleanly. The follow-up-message loop is genuinely usable: one critique produced a targeted, correct revision. Two watch-items, neither blocking: (1) right-margin corridor congestion grows with skip-lane edge count — this is the router work already declared out of scope; (2) whole-scope propose_program treats prior surgical geometry as noise to normalize — until re-solve respects (or at least loudly reports) previously accepted ad-hoc geometry, operators should prefer solve_layout/apply_ops for edits on boards that carry accepted surgical tweaks, and expect to spend one review pass on rhythm defects that lint cannot see.
