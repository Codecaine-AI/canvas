# v3 trial — hierarchy / org tree

Canvas: eval-v3-org-tree · Sessions run: 4 (S4 includes one in-session corrective follow-up) · Date: 2026-07-22
Old baseline: `findings-org-tree.md` (7 sessions on the v2 propose_program-only system).

Note on evidence: the first `GET /api/agent/kernel/sessions/:cid/transcript` for S1's container
(52e0cf0d-…) returned a DIFFERENT container's transcript (311cc75e-…, the parallel swimlane
trial). A retry returned the correct one. Flagged under "new defects" as an infra quirk.

## Sessions

### S1 — build: CEO → 4 VPs → 11 teams, blue/gray semantics, 2 labels, 1 dashed "acting" line, margin sticky
- session/container: 16226b1a-7ae8-4f83-9ef3-45d06925a1c0 / 52e0cf0d-111e-5bb4-8e6a-362e057a7589
- outcome: committed — **0 syntax retries** (old S1: 11 consecutive parser rejections)
- tool sequence: fit_scope → apply_ops (full build, 33 ops) → render_draft → apply_ops (spacing/centering refinement) → render_draft → commit (6 turns, ~65s)
- op mix: Counter({addConnection: 16, addObject: 15, updateObject: 2})
- solver usage: **none** — the agent never called propose_program or solve_layout; it hand-computed all geometry through apply_ops. Structure quality survived anyway: 11 teams on one baseline (y=1120), even 64px cluster gaps, VPs centered over child midpoints — the agent reproduced by arithmetic what R6 fan used to guarantee.
- channels: ALL landed in one proposal — CEO+4 VPs blue, 11 teams gray, labels "interim scope: IT" (ceo-ops) and "shared with Ops" (marketing-events), dashed orange "acting" line marketing→growth, yellow sticky in the left margin. Lint clean.
- aesthetic: 4 — balanced fans, flat registers, all requested styling present; docked for CEO→VP-Eng and CEO→VP-Marketing entering VP boxes from the side, and the dashed acting line meandering across the Ops subtree before entering Growth from the right.
- process: render-first iteration worked as designed — the turn-3 apply_ops was a refinement made after looking at the first render, and a second render preceded commit.
- delta vs old S1: old = 11 syntax retries, colors silently dropped, aesthetic 3, single render / new = 0 retries, every channel honored, aesthetic 4, two renders. The two biggest old findings (DSL syntax fight, no color vocabulary) are simply gone.

### S2 — surgical probe: "shift the Product subtree ~20–30px right; change nothing else"
- session/container: e5351039-da4f-4516-905e-15116ba9a038 / f6c93367-29e9-52d3-bff5-6d95b2b89081
- outcome: committed
- tool sequence: fit_scope → inspect → apply_ops → render_draft → commit (5 turns, ~30s)
- op mix: Counter({updateObject: 4}) — vp-product + its 3 teams, each exactly x+32, y/width/height byte-identical, nothing else touched
- aesthetic: 5 for intent-fidelity — the grid snapped 20–30px to 32px and the commit summary said so honestly ("the nearest 16px grid step to the requested 20–30px").
- delta vs old S4: old = **abandoned** after four grammars failed (raw-coordinate refusal, gap=168 not a ladder rung, size normalization resizing boxes under a "change nothing" instruction) / new = a 4-op rigid translate with zero collateral. This is the single largest v3 win for this type. Context: v3's own S1 had already produced even 64px cluster gaps, so the old motivating defect (168/272/376px uneven gaps) never existed to fix.

### S3 — restyle probe: recolor the four CEO reporting lines (blue→green), touch nothing else
- session/container: 96a970f5-5271-4a19-a761-26a2e758e4b6 / 0cb0f7fb-a684-583a-89c9-bd1993efee87
- outcome: committed
- tool sequence: fit_scope → apply_ops → render_draft → commit (4 turns, ~18s)
- op mix: Counter({updateConnection: 4}) — patches `{color: "green"}` on existing ids ceo-eng / ceo-product / ceo-ops / ceo-marketing. **No duplicate addConnection edges; the ceo-ops label survived untouched** (patch was color-only).
- probe adaptation: the scripted probe was "color CEO lines blue," but v3's S1 agent had already chosen blue for them spontaneously; recoloring to green preserves the probe's discriminating power (updateConnection vs duplicate edges) — same op-class test.
- aesthetic: n/a (styling only; render confirmed correct)
- delta vs old S5 (connector-only pass): old = **abandoned** — no connector-only operation existed, and a no-op re-solve moved boxes ~334–353px / new = a true connector-only edit with zero geometry churn.

### S4 — structural: add VP Research + 2 teams, rebalance to 5 subtrees, preserve all channels/order/baseline
- session/container: 61ef8539-3681-4c1c-b80d-b4cdbf075a9a / 939be805-65cd-5868-9fbb-6264cd89440e
- outcome: committed after one in-session corrective follow-up (proposal 0 rejected by operator judgment, proposal 1 accepted)
- tool sequence: fit_scope → apply_ops → render_draft → apply_ops → render_draft → commit ‖ follow-up → fit_scope → apply_ops → render_draft → commit (10 turns total)
- op mix (accepted proposal): Counter({updateObject: 16, addObject: 3, addConnection: 3})
- channel preservation: **perfect** — all 16 existing connections untouched (existing-object patches were geometry-only), so the green CEO lines, both labels, the dashed orange "acting" line, gray fans, and sticky all survived a full rebalance; new edges matched house style (ceo-research green, team lines gray). Subtree order preserved (Eng/Product/Ops/Mkt + Research appended right), all 13 teams on one baseline (y=1056). The old S3 failure mode (grid 2x2 scrambling order + splitting the baseline 52px) did not recur.
- the defect: proposal 0 placed clusters **touching** — Infra↔Design and Growth↔Finance at 0px gap, cluster gaps 0/0/208/104 — the bottom row read as one fused strip. Lint flagged only the 16px intra-cluster gaps (0 is a ladder rung) and the commit gate passed it (0px gap is not >25% overlap). The agent's commit summary did not mention the collisions. After the follow-up named the two 0px gaps, one apply_ops pass landed **equal 96px gaps between all five clusters** and committed.
- aesthetic: 4 (final) — clean five-fan chart, equal cluster gaps, everything in frame; docked for persistent side-entry CEO elbows, the acting line's detour across the Ops subtree, and VP-Ops sitting ~96px left of its two-team midpoint. Proposal 0 alone would have scored 2.
- delta vs old S2/S3: old S2 (add 4th VP) = committed at aesthetic 4 via solver fans; old S3 (rebalance) = scrambled order + split baseline + frame overflow, needed an operator follow-up. New = order/baseline/channels all survived; still needed one operator follow-up, but for a spacing miss rather than a structural scramble, and the fix converged in one pass instead of nine drafts.

## Summary table

| session | old outcome | new outcome | new op mix |
|---|---|---|---|
| S1 build | committed, 11 retries, colors dropped, aes 3 | committed, 0 retries, all channels, aes 4 | 16 addConnection / 15 addObject / 2 updateObject |
| S2 nudge | abandoned (old S4) | committed, exact +32px, 4 ops | 4 updateObject |
| S3 restyle | abandoned (old S5) | committed, no dupes, labels kept | 4 updateConnection |
| S4 add+rebalance | committed w/ scramble risk (old S2/S3) | committed after 1 follow-up, channels/order/baseline preserved, aes 4 | 16 updateObject / 3 addObject / 3 addConnection |

## What v3 fixed (vs old findings)

- **MECH: DSL expressiveness (6× BLOCKED, worst offender)** — dead. Color vocabulary (S1 blue/gray landed; old S1 silently dropped it), connector labels/dash/color (S1, S3), sticky creation (S1), rigid-unit translate (S2; old S4's exact abandon reason), connector-only operation (S3; old S5's exact abandon reason).
- **R10 language-refusal** — apply_ops accepts exact coordinates; the old `at=(64,685)` parser refusal class is gone (S2).
- **R2 spacing ladder as a blocker** — cluster-gap equalization, "unsayable" under uniform fan pitch, was achieved twice (64px even in S1, 96px even in S4 rev 1); the ladder is now advisory lint the agent can overrule.
- **MECH: size normalization** — S2 preserved every width/height/y byte-for-byte under "change nothing"; the old fit→expand resize drift never appeared.
- **MECH: single-render habit** — the render-first mandate held: every session rendered before commit; S1 and S4 each made a post-render refinement pass.
- **Channel survival through re-layout** — the no-arrows-block/geometry-only-patch behavior kept all 16 connection styles/labels through S4's full rebalance.
- **Syntax fights** — 0 retries across 4 sessions (old: 11+2+9-draft fights).

## What v3 did not fix (known router limits)

- **Side-entry elbows** — CEO→VP-Eng and CEO→VP-Marketing still enter VP boxes from the side in every render (S1, S4); no port syntax exists. Still the type's biggest residual aesthetic drag.
- **Detour routing** — the dashed marketing→growth "acting" line crosses the entire Ops subtree and enters Growth from the right (S1 and S4 renders); lane-crossing detours are a documented router limit.
- **Ladder-vs-agent spacing taste** — the agent freely chose 16px intra-cluster gaps in S4 and shipped over 8 lint warnings; harmless here, but lint noise persists.

## New defects v3 introduced

1. **Freehand collision risk (real, observed)** — S4 proposal 0 placed sibling clusters at 0px gap (Infra↔Design, Growth↔Finance) and both lint and the commit gate let it through: 0 is a ladder rung, and the overlap gate only blocks >25% sibling overlap. The old solver's fan could produce uneven gaps but never collisions. Because the v3 agent does *everything* through hand-computed apply_ops geometry, nothing structural guarantees separation. Evidence: S4 turn 1 ops + turn 2 render (image …47de-70eb….17.1), commit summary omitted the collisions.
2. **Solver bypass (behavioral, watch)** — across all 4 sessions the agent never once called propose_program or solve_layout; the old system's proven strengths (R6 fan hub-centering, R5 align registers) are now reproduced by per-session arithmetic instead of guaranteed. It worked here (flat baselines, centered hubs, minus VP-Ops off-center by 96px in S4), but defect 1 is the tax.
3. **Transcript endpoint cross-container response (infra)** — first transcript fetch for container 52e0cf0d-… returned container 311cc75e-…'s transcript (the parallel swimlane trial); correct on immediate retry. Evidence-only impact, but it can silently corrupt eval attribution under parallel sessions.
4. No duplicate edges, no channel loss, and no gate false-positives were observed.

## Verdict

**Ready to scale for org trees.** All four sessions committed (old run: 2 of 4 equivalent requests abandoned), zero syntax retries, every styling channel expressible and preserved through structural edits, and the type's two "impossible" requests (rigid subtree nudge, connector-only restyle) are now routine 4-op edits. Two watch items short of unqualified: (a) add a min-separation lint rung or nudge the agent toward solve_layout for multi-subtree placement so 0px cluster collisions can't ship silently (S4 proposal 0 would have gone out without operator review), and (b) fix the kernel transcript endpoint's cross-container race before running more parallel trials. The remaining aesthetic ceiling — side-entry elbows and dashed-line detours — is the router, unchanged from v2, and needs port syntax, not agent work.
