# v3 trial — branching flowchart

Canvas: eval-v3-flowchart · Sessions run: 4 (+1 voided) · Date: 2026-07-22
Old baseline: `findings-flowchart.md` (6 sessions on eval-flowchart, pre-v3)

Provenance note: one extra session (8f8811d0 / container afcb6fbd) was created with the
org-tree trial's instruction due to a shared-scratchpad file race between parallel trial
agents (my request JSON was clobbered before POST). It was rejected untouched and is not
evidence about v3 either way. All later requests used a private subdirectory.

## Sessions

### S1 — build: full order-processing flow (2 decisions, retry loop, dashed-red failure path, Yes/No labels, semantic colors, margin sticky)
- session/container: ec8bcbd8-f828-47d6-bedb-e1162629d2ef / 3ee7f6e9-393b-5ef6-ac27-540dc30b4a20
- outcome: committed (propose_program retries: 0 — never used propose_program at all; 0 tool errors)
- tool sequence: fit_scope → inspect → apply_ops (22 ops, whole build) → render_draft → apply_ops (3 geometry fixes) → render_draft → commit (7 turns)
- proposal op mix: Counter({addConnection: 11, addObject: 9, updateObject: 2})
- aesthetic: 4 — clean left-to-right spine with branch drops, every requested channel present (Yes/No on all four decision exits, dashed red "Retries exhausted" → red Order failed pill, green Order complete, yellow decisions, retry-policy sticky in the top-right margin); only blemish is anti-parallel overlap where the two loop returns share the docked face of the forward edge (known router limit).
- honesty: lint reported 4 off-ladder gaps (advisory); commit summary disclosed them ("minor off-ladder gaps remain").
- delta vs old S1: old burned 23 consecutive DSL-syntax retries, silently dropped Yes/No labels and all colors, truncated three terminals, and committed a horizontal layout after one render. New: **zero retries, zero drops** — the agent skipped the DSL entirely, built the whole diagram with apply_ops, and ran a render→revise→render loop before committing. The single-render habit and the 23-retry grammar-guessing are both gone in one stroke.

### S2 — surgical probe: "move Order failed ~20px down-right; change nothing else"
- session/container: 0670ba02-ace3-4bac-ab7a-73111cb367f1 / 03f87445-03c7-5768-825d-f318b98634e8
- outcome: committed (retries: 0)
- tool sequence: fit_scope → inspect → apply_ops (1 op) → render_draft (region-cropped render around the target!) → commit (5 turns)
- proposal op mix: Counter({updateObject: 1}) — order-failed (1312,1088) → (1328,1104), i.e. +16/+16 grid-snapped
- aesthetic: 5 — exact intent-fidelity: one object moved the nearest lattice step to the ask, nothing else in the delta; summary even explains the snap ("16px down and right — the nearest grid-snapped move to 20px").
- delta vs old S4: old agent inspected the exact geometry, invented `nudge 2 dx=16 dy=24` syntax, got a ~207px wrong-direction move from the solver, and honorably abandoned. New: the identical ask lands as a single updateObject in 5 turns. This was the definitive R10/DSL-expressiveness kill-case and it is fixed.

### S3 — restyle probe: "make the happy-path edges green" (existing edges only)
- session/container: 089cc6d2-4866-410b-a5f7-4cc783005907 / 4aa0ffe1-be95-5538-844a-8dafa92d570d
- outcome: committed (retries: 0)
- tool sequence: fit_scope → apply_ops (4 ops) → render_draft → commit (4 turns; no inspect needed — the fit_scope connection inventory supplied the edge ids)
- proposal op mix: Counter({updateConnection: 4}) — edge-start-validate, edge-validate-valid, edge-authorize-decision, edge-pack-complete, each `{color: green}`; **no duplicate addConnection edges**; the two already-green Yes edges were correctly left alone, as were loop/failure edges.
- aesthetic: 5 — pure restyle, zero geometry churn, connected happy path reads as one green route end-to-end.
- delta vs old S5: old agent abandoned at turn 0 with "this editor cannot change object colors." New: the color channel exists, the ops target existing ids, and the whole session is 4 turns. The bread-and-butter "make the failure/success path visually distinct" request class is now serviceable.

### S4 — structural: add fraud-review branch off the payment decision, rejoin before fulfillment, keep all labels/styles
- session/container: 788b164c-fdec-416b-b9b7-741bcc917a78 / ba1fe3b1-b4f9-5f13-aad0-2313dae109b7
- outcome: committed after 1 operator revision message (propose_program retries: 1 — "missing `arrows` block", fixed next turn)
- tool sequence: fit_scope → propose_program (rejected: missing arrows block) → propose_program (solved) → inspect+render_draft → fit_scope → apply_ops (7 channel repairs) → render_draft → commit; then follow-up message → fit_scope → inspect → apply_ops (respace 2 pairs) → render_draft → commit (13 turns total)
- proposal op mix (final): Counter({updateObject: 11, addConnection: 4, addObject: 2})
- aesthetic: 4 (first draft 3) — correct topology (Risky → Fraud review → Fraud suspected? with Yes→Order failed in red, No→Pack & ship in green), all eleven pre-existing edge labels/colors/dashes and the sticky survived the re-solve verbatim; residual blemishes: the "Retry available" label is partially occluded behind the Payment authorized node, and the right side has a crossing cluster (green No / red Yes / dashed red) — known router-class limits.
- channel survival detail: WITH the arrows block, the re-solve **kept every existing connection id + label + style + color**. The two NEW solver-created nodes came back with slug-ish text and no colors — but the v3 agent repaired them itself in the same run via apply_ops (updateObject text/color, updateConnection label/style/color on draft-connection-1..4) before its first commit. Old-S2's shipped-slug-labels failure mode is now compensated by workflow rather than fixed in the DSL.
- first-draft defect (why the revision was needed): the re-solve packed authorize-payment 8px above payment-authorized and seed-end 8px under pack-ship; both connecting edges collapsed to **zero-length invisible paths** (draft SVG: `M 1399 712 L 1399 712`, `M 2177 748 L 2177 748`). Lint flagged three unrelated off-ladder gaps but not these; the commit gate passed. One plain-language follow-up ("the connecting edges collapsed to zero length — give those pairs proper spacing") produced a surgical apply_ops fix and a clean commit.
- size normalization: still active on re-solve — seed terminals and two processes were reclassified S and shrunk 192×96→132×69, order-failed 208×96→200×64. No truncation this time (labels are short), but the mechanism that damaged old S2/S3 is unchanged in the solver path.
- delta vs old S2: old fraud-branch session was rejected outright (slug labels shipped, decisions truncated to "Paym…", 900px board-spanning sweeps). New: committed, labels intact, no truncation, and the one real defect was fixable with a single follow-up message inside the same session.

## Retry counts, old vs new

| session class | old retries / outcome | new retries / outcome |
|---|---|---|
| build | 23 syntax, committed with silent label/color drops | 0, committed with every channel present |
| surgical nudge | 4 (2 invalid + 2 wrong-by-10x solves), abandoned | 0, committed (+16/+16, 1 op) |
| restyle | abandoned at turn 0 (no color channel) | 0, committed (4 updateConnection) |
| structural add | 2, rejected by operator | 1 (loud, self-corrected), committed after 1 revision |

## What v3 fixed (vs old findings)

- **MECH: DSL expressiveness, the #1 old blocker (6/6 BLOCKED)** — apply_ops removes the grammar-guessing entirely: S1's 23-retry syntax fight became 0 retries; edge labels, dash styles, edge colors, node colors, and stickies all landed on the first try. The old "arrow labels impossible" and "cannot change object colors" refusals (old S1 t20–24, old S5 t0) are gone.
- **R10 language-refusal / the 20px nudge (old S4 abandon)** — expressible now; grid snap turned ~20px into exactly 16/16 and nothing else moved.
- **MECH: single-render habit (old S2/S3 committed visibly bad drafts)** — the render-first mandate held in all four sessions: every commit was preceded by at least one render, and S1/S4 both did render→revise→render loops unprompted.
- **Whole-board churn on local edits (old S6: 13 objects moved for a 3-pill fix)** — S2 and S3 touched exactly the asked-for objects/edges and nothing else.
- **Honest summaries** — every commit summary disclosed residual lint (off-ladder gaps) instead of claiming perfection; S2's summary explained the 16px-vs-20px snap.
- **fit_scope connection inventory** — directly enabled S3's 4-turn restyle (ids available without inspect) and S4's label-preserving arrows block.

## What v3 did not fix

- **Router limits (known/expected)**: anti-parallel overlap on loop returns (S1: both feedback edges share the forward edge's docked face); crossing clusters where three edge families converge (S4 right side); label occlusion — "Retry available" sits under the Payment authorized node after the S4 re-solve, and no lint finding covers label-under-node.
- **MECH: size normalization on the propose_program path** — re-solve still percentile-reclassifies and shrinks committed nodes (S4: 192×96→132×69). Harmless here only because the labels are short; the old S2/S3 diamond-truncation risk is intact whenever the solver is used.
- **Solver-created nodes still lack a text-vs-id channel** — new nodes come back needing text/color repair via apply_ops (S4 turn 5). The workflow compensates; the DSL does not.

## New defects v3 introduced

1. **Accept-time consolidation drops some updateObject patch keys.** S1 turn-2 apply_ops set `type: "pill"` on seed-start/seed-end and the approved draft rendered pill terminals; the `/accept` operations carried only geometry+color, so the materialized canvas has rectangle terminals. Channel loss between draft and commit — the agent's approved render and the persisted state disagree. (Evidence: S1 container 3ee7f6e9 turn 2 params vs accept payload; committed preview.svg.)
2. **Zero-length invisible edges after re-solve, invisible to lint and the gate.** S4 first draft packed two connected pairs to 8px gaps and their edges collapsed to `M x y L x y` no-op paths — two happy-path arrows silently vanished from the render. Lint reported unrelated off-ladder gaps; the commit gate (overlap/escape/overflow) has no finding class for degenerate edges. Caught only by operator inspection of the SVG. (Evidence: fc-s4-draft.svg paths at 1399,712 and 2177,748; fixed in turns 8–12 after follow-up.)
3. **Solver output is off-lattice.** S4's propose_program geometry (x=1054, y=1153, h=69, …) is not 16px-aligned, while apply_ops edits snap. Mixed-provenance boards therefore drift off the grid the moment the solver touches them (R1 was NEUTRAL in the old eval; v3 makes it inconsistent between the two edit paths).

## Verdict

**Ready to scale for branching flowcharts.** All four sessions produced committed, keepable results — the old eval produced one accepted edit in six sessions, and the three requests that defined the old failure mode (labels/colors at build time, the 20px nudge, the pure restyle) are now routine 4–7-turn sessions with zero retries and zero silent drops. The one revision cycle needed (S4) was caused by a real solver spacing defect, was correctly diagnosable from the render, and was fixable with one plain-language message — that loop working is itself a v3 win. Blockers to fix, none of which gate scaling for this type: (1) the accept/consolidation patch-key drop (defect 1 — it makes approved drafts and committed state diverge, which will eventually burn a session that changes shapes); (2) add a lint/gate finding for degenerate (near-zero-length) edges; (3) snap or re-snap solver output to the 16px lattice. Flowchart-specific caveat: keep the solver away from boards with long decision labels until size normalization is tamed — apply_ops-only editing avoids it entirely, and the v3 agent already prefers apply_ops for everything except genuine structural rebalances.
