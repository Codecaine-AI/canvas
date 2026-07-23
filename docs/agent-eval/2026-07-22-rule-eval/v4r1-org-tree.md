# v4 Round 1 — hierarchy / org tree

Canvas: eval-v4-org-tree · Sessions run: 4 (all committed + materialized) · Date: 2026-07-22
Baselines: `findings-org-tree.md` (v2), `v3-trial-org-tree.md` (v3).
Evidence workspace: `/private/tmp/claude-501/-Users-Ford-Github-Repos-Codecaine-canvas/5092b6a2-863f-4fc5-a4c0-c6a7ee4236d6/scratchpad/v4r1-org-tree/` (reference + per-session final renders as PNG).

## Reference anchoring (done first, as mandated)

Viewed `gc-decomp-harness` (anchor ≈ 7.5) and `intent-classification-2` (anchor ≈ 7) at 2800px
before any session. What they do that mattered for judging this genre: every label chip owns
clear air in an open corridor; tinted sections do the grouping work (the intent board is
literally two tinted tree panels); flows are color/style-coded; margin stickies annotate;
density varies deliberately (tight fans, open corridors). Every score below is a side-by-side
against those two renders, viewed in the same phase.

## Sessions

### S1 — build: CEO → 4 named VPs → 12 teams, blue/gray, dashed "acting" line, margin sticky, even cluster gaps
- session/container: 6ebea360-2cfb-4951-a8f9-df38a753ce37 / 7d79b296-2da9-57f2-9483-b15e1920315d
- outcome: committed (~2.5 min, 9 turns, zero retries of any kind)
- tool sequence: board → apply_ops (18 objects) → render_draft → apply_ops (17 connections) → render_draft → inspect → render_draft (full board @4096px) → board → commit. **3 renders.**
- channels: ALL landed — leadership blue, teams gray, dashed orange "acting" with label, yellow margin sticky. (v2 dropped colors silently; v4 keeps v3's fix.)
- measured structure: 12 teams on one baseline y=1152; every VP centered over its true children's midpoint to the pixel; CEO centered over the VP row; **cluster gaps even at 128px** — the v2 signature flaw (168/272/376) does not exist in v4. The model owns pitch and nailed it by arithmetic, unprompted by any diagnostic.
- diagnostics story: 0 errors, 2 warnings, both overridden with verbatim commit-summary reasons: "retained W1 because Growth is Marketing's exception—not its primary fan—and W2 because 32px intra-cluster vs 128px inter-cluster spacing is deliberate."
  - W1 hub-balance "vp-marketing sits 384px right of its 4 neighbors' midpoint" — **false positive**: the rule counted the dashed acting edge as a fan child. The agent's override reason is exactly the correct diagnosis of the rule's own bug.
  - W2 rhythm "team-infra→team-security→team-design gaps 32/128px uneven (spread 96px)" — **false positive**: the run straddles a cluster boundary; 32-intra vs 128-inter is the grouping device itself.
- aesthetic (anchored): **5** vs ref-gc 7.5 / ref-intent 7 — side-by-side delta: the reference gives every labeled edge an open corridor and uses tint to group; S1 groups by whitespace alone, parks the "acting" label ambiguously against the Ops fan verticals, side-enters 3 of 4 VP boxes on the CEO fan, and leaves a 512px hollow band between the VP and team registers (level steps 224 vs 512 — uneven rhythm the diagnostics never mention).
- crop evidence: kernel image `…9885c17aaf1.33.1` (container 7d79b296…); local `s1-final-render.png`.

### S2 — the round's core probe: "give every labeled edge room to breathe, widen the corridors, rebalance to reference quality"
- session/container: 6d3a88b8-bda7-4b01-bdd0-69b71f91b804 / ec07ced1-835c-53cb-a860-98db0f2f1e9c
- outcome: committed (~4.5 min, 14 turns)
- tool sequence: board → render → apply_ops(17 moves) → render → apply_ops → render → apply_ops → render → apply_ops(13) → apply_ops(12) → render → commit. **6 renders, 5 refinement passes** — a genuine look-adjust-look loop, the exact behavior v2 lacked.
- what it did: this was NOT uniform inflation. It redesigned: Growth moved off the leaf register into its own dual-report lane between Product and Marketing (y=944 vs register 1344), so the dashed "acting" line became a short clean hook whose label owns open air; level bands rebalanced to 448/512 (from 224/512); corridors widened. The agent spread things out *and* restructured for the label — Ford's "too close to read" critique was answered with actual layout thinking.
- diagnostics story: **DIAGNOSTICS · clean at commit — and that's the problem.** Two real, measurable defects shipped silently: (a) cluster gutters 192/288/288 — the Engineering→Product corridor is visibly narrower than the other two, and rhythm (which false-fired on S1's deliberate 32/128) said nothing; (b) vp-marketing sits 128px left of its rendered solid fan's midpoint (2000 vs 2128) — hub-balance counts the dashed edge as a child, so it stayed silent. The labeled-edge breathing check never fired all session, before or after the fix it was probing.
- aesthetic (anchored): **6** — delta: acting lane now reads like the reference's labeled edges (chip in clear air); still untinted, gutters uneven 192 vs 288, and CEO→Eng / CEO→Ops still arrive as long side-entry runs.
- crop evidence: kernel image `…5f1ff684e5d3.57.1` (container ec07ced1…); local `s2-final-render.png`.

### S3 — edit probe: add 5th VP (Research, two teams), rebalance; keep register flat, gaps even, hubs centered
- session/container: e571777d-c398-433d-9297-30c3fcee54eb / ef9118f0-9f69-50de-8aa5-55309e59ba8b
- outcome: committed (~1.5 min, 5 turns)
- tool sequence: board → apply_ops(17 moves + 3 adds) → apply_ops(+3 connections) → render_draft → commit. **1 render** — the single-render habit resurfaces on "easy" edits.
- measured result (from committed geometry): register flat again (all 14 teams y=1344, Growth returned from its S2 lane); **cluster gutters exactly 128/128/128/128**; eng/product/research/ops hubs centered to the pixel; CEO at the VP-row midpoint (1792.0 = 1792.0); new VP matched house style; all S1/S2 channels (acting line, labels, sticky, colors) survived the full rebalance untouched. The v3-era risks (order scramble, split baseline, 0px collisions) did not appear. The acting line reroutes to a clean top-entry into Growth with its label in open corridor — best routing of the round.
- diagnostics story: 0 errors, 2 warnings — W1/W2 rhythm, *the identical intra-32/inter-128 boundary false positive as S1*, fired twice (infra→security→design; events→community→applied-ml). Verbatim override: "W1/W2 are intentional rhythm overrides for 32px intra-cluster spacing versus 128px inter-cluster gaps." Meanwhile vp-marketing again sits 144px off its solid-children midpoint (1840 vs 1984, dashed edge in the child set) — silent, and shipped unremarked after one render.
- aesthetic (anchored): **6.5** — delta: register/gutter/centering discipline now matches ref-intent's tree panels; what's missing is the reference's tint grouping and top-entry edges on the outer VPs (CEO fan side-enters Eng right, Research left, Ops left).
- crop evidence: kernel image `…ab4d25b92dc2.21.1` (container ef9118f0…); local `s3-final-render.png`.

### S4 — retest: reference-board finish ("wrap each VP subtree in a tinted labeled section; keep geometry")
Run because S1 never produced the reference boards' tinted grouping despite the exemplar nudge, leaving section-trim/containment/density untested for this genre.
- session/container: 2103f26b-f2d9-44d8-90ae-ac4a94313904 / 8ba5d248-b362-59bf-8d7a-178eaf24e76d
- outcome: committed (~1 min, 6 turns, 6 ops)
- tool sequence: board → apply_ops (5 tinted labeled sections) → render → apply_ops (sticky nudged 96px up — the agent *saw* the sticky/section-header collision in its render and fixed it proactively) → render → commit. **2 renders.**
- diagnostics story: 0 errors, 3 warnings — W1–W3 color-contrast: "N of M nodes in section-X are gray — the color channel is monotone." All three are **false positives for this genre**: gray teams under blue leadership is the requested semantic. Verbatim override: "shipped W1–W3 (monotone gray team nodes) because the existing box palette was intentionally preserved."
- aesthetic (anchored, final board): **7** — delta vs ref-intent (≈7): with five tinted labeled sections the board now does the same grouping work as the reference's panels and reads at a glance; the residual gap to ref-gc (7.5) is the side-entry elbows on the three outer VPs and the tall empty tint above each leaf row where the reference varies density deliberately.
- crop evidence: kernel image `…56070e5f202e.25.1` (container 8ba5d248…); local `s4-final-render.png`, `final-canvas.svg.png` (post-materialization state at :4000).

Score arc: 5 → 6 → 6.5 → 7 against anchors 7/7.5. v3's best committed state was a 4 (its own scale); v4's final board is the first org-tree output of any round that stands next to the reference without embarrassment.

## Rule-efficacy table

| rule | fired | heeded/quickfixed/overridden | correct? | verdict |
|---|---|---|---|---|
| spacing (incl. NEW labeled-edge breathing) | 0 | — | **Miss you can see**: S1's "acting" chip parked against the Ops fan verticals (image …aaf1.33.1) — precisely the case the new check exists for, and it never fired, including during the S2 probe designed to trigger it | **BLIND** |
| grid | 0 | — | Every committed coordinate in all 4 sessions is a 16px multiple (agent arithmetic; spot-verified across 40+ geometries) | WORKING (as guidance; nothing to catch) |
| section-trim | 0 | — | S4's five sections carry sane 48–96px content padding; no noise | WORKING / untested-by-violation |
| registers | 0 | — | Flat registers held in S1/S3/S4 by agent arithmetic; S2 moved Growth 400px off-register *deliberately* and the rule stayed silent — acceptable outcome, but the rule has never once spoken, so quiet-working vs blind is unproven | UNTESTED (no noise; no evidence it exists in practice) |
| hub-balance | 1 (S1 W1, quickfix offered) | overridden, reason verbatim above | **Wrong child set**: counts dashed/exception cross-links in the fan midpoint → false-fired on S1 (384px, the acting edge), then went silent in S2/S3 while the *solid* marketing fan was visibly 128–144px off-center (measured 2000 vs 2128; 1840 vs 1984) | **MISCALIBRATED** — compute the midpoint over solid same-style tree edges only; keep the quickfix |
| rhythm | 3 (S1 W2; S3 W1, W2) | all overridden, same sentence each time | All three are the identical false positive: a gap-run straddling a cluster boundary (32 intra vs 128 inter — the grouping device itself). And it **missed the round's one real spacing regression**: S2's 192/288/288 gutters shipped under "DIAGNOSTICS · clean" | **MISCALIBRATED** — make it gap-class aware: compare gutters with gutters, intra-runs with intra-runs; a 96px spread *within* a class is a real fire (S2), across classes it's noise (S1/S3) |
| density | 0 | — | S1's 512px hollow band between registers (vs 224px above) is a visible dead-space miss; no false noise either | BLIND for dead bands (consider info-tier note at >2× level-gap asymmetry) |
| label-clearance | 0 | — | Same S1 acting-label evidence as the spacing row; no other labels existed to test | BLIND (shares the labeled-edge fix) |
| overlap | 0 | — | Nothing overlapping was ever proposed; v3's 0px cluster-collision class did not recur (min gap all round: 128px) | WORKING silently / untested |
| containment | 0 | — | S4 sections cleanly contain their subtrees; the one near-violation (sticky vs section header) was caught by the agent *from the render*, not by a diagnostic | WORKING (render loop covered it) |
| edge-clarity | 0 | — | **The genre's signature defect fired zero warnings in four sessions**: 3 of 4 (S1) then 3 of 5 (S3/S4) CEO→VP edges side-enter their boxes in every committed render, unchanged since v2. The schema supports `from/to.anchor` ("bottom"/"top" — both reference boards use them); apply_ops accepts them; the agent emitted zero anchors in 40 connection ops because nothing tells it to | **BLIND** — and cheaply fixable (see change 3) |
| color-contrast | 3 (S4 W1–W3) | overridden, reason verbatim above | All three false positives for org-tree semantics: monotone gray teams was the explicit instruction; the rule pushes against the genre's color grammar | **NOISY** for this genre — suppress when the monotone matches a user-stated palette |

Mechanics: commit gate never blocked (0 error-tier all round — correct; nothing gate-worthy was proposed). No harness deaths, no syntax retries, no cross-container transcript mixups. Sessions ran 1–4.5 min, far under the 15-min budget. Infra notes: the session-status JSON contains a control character that breaks strict JSON parsers (parse with `strict=False`/NUL-strip); `draft.svg` crops to a stale viewport — judge from kernel render images instead.

## Ford's standing critique, tested

"Too close together if you're actually trying to read it" — not this genre's v4 failure mode. Intra-cluster 32px is tight but is doing deliberate grouping work, gutters were 128–288px, and the S2 probe produced real spreading plus restructuring (Growth lane) rather than token nudges. The org-tree readability risk in v4 is the opposite pole: **dead vertical bands** (S1's 512px hollow) and **silent asymmetries** (S2's uneven gutters, marketing's off-center solid fan) that the diagnostics are miscalibrated to catch.

## Top 3 changes for Round 2

1. **hub-balance: exclude exception edges from the fan child set.** Compute the hub midpoint over solid, unlabeled (or style-majority) child edges; dashed/labeled cross-links are exceptions, not fan members. Grounded: S1 W1 false-fired at 384px purely because of the acting edge (the agent's override said so verbatim), and the same inclusion then *silenced* true 128px and 144px solid-fan offsets in S2/S3 that are visible in both final renders. One change fixes a false positive and two misses.
2. **rhythm: gap-class awareness.** Cluster the gaps in a run (two-means or a 2× ratio split) and only flag spread within a class. Grounded: three of the round's five warnings were the identical 32-vs-128 boundary false positive (S1 W2, S3 W1/W2 — overridden with the same sentence every time, training the agent to ignore the rule), while the only real spacing regression of the round (S2's 192/288/288 gutters, visibly narrower Engineering corridor) shipped under "DIAGNOSTICS · clean."
3. **Tree edge-entry: prompt guidance + an edge-clarity warning for side-entry hierarchy edges, teaching `anchor`.** The connection schema already supports `from/to.anchor` and both reference boards use bottom→top anchoring; the agent never emitted one in 40 addConnection/updateConnection ops. Add one line of guidance ("in hierarchies, exit parents bottom, enter children top — set anchors") plus a warning when a parent→child edge's entry side isn't `top`. Grounded: side-entry CEO elbows are the largest remaining anchored-score gap in every committed render of this round (S1 …33.1, S3 …21.1, S4 …25.1) and have survived v2 → v3 → v4 untouched.

Runner-up: suppress color-contrast's monotone-roster warning when the monotone follows an explicitly requested palette (S4 W1–W3); it currently argues with the genre's own semantics.
