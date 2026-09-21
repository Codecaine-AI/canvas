# v4 round 1 — swimlane pipeline

Canvas: eval-v4-swimlane · Sessions: 3 (all committed + materialized) · Date: 2026-07-22
Baselines: `findings-swimlane.md` (v1: 3/6 committed, best aesthetic 3/5), `v3-trial-swimlane.md` (4/4 committed, aesthetic ~4/5 un-anchored).
Harness: v4 diagnostic-layout at :4820 (SOL high thinking; board/apply_ops/render_draft/commit).

## Reference anchoring

Rendered and viewed both anchors before any session (scratchpad `v4r1-swimlane/ref-gc.svg.png`,
`ref-intent.svg.png`). What gc-decomp-harness (≈7–8, the bar) does that my outputs are judged
against: every labeled edge owns a clear corridor (label chips never touch nodes, borders, or
each other), section tints carry the grouping so edges stay thin and color-coded per flow,
margin stickies annotate without entering the diagram, and density varies deliberately — tight
clusters inside sections, wide air between them. intent-classification-2 (≈7): symmetry +
semantic shape/color coding, huge corridors, minimal labels.

## Sessions

### S1 — build: 4 tinted lanes, 14 stages, labeled handoffs, dashed async, margin sticky, "readability is the bar"
- session/container: cf20bf11-9480-4715-9a1b-3aa223c05930 / 2b9b1904-d613-5540-b0dd-4ff09ee145aa
- outcome: committed (11 turns, 0 syntax rejections). Op mix: 18 addObject, 17 addConnection, 1 updateObject.
- tool sequence: board → apply_ops ×4 (lanes+nodes → fix containment → widen lanes → connections) → render_draft(4096) → apply_ops (sticky) → render_draft → apply_ops (sticky text de-clip) → render_draft(crop of sticky) → commit. 3 renders (2 full + 1 crop).
- diagnostics story:
  - `E1 containment: seed-a extends 48px outside its section lane-frontend` (turn 1) — HEEDED, fixed next op. Correct.
  - `W2 density: section lane-frontend: 95% of its width is empty on the right` (turn 1) — HEEDED (lane/stage rebalance). Correct.
  - section-trim `right slack 432px (>160 — not hugging)` on lane-workers/lane-data — fired every turn 3→9, OVERRIDDEN. Verbatim commit note: "W1/W2 intentionally retain right-side routing slack in the three-stage Workers/Data lanes for label clearance."
  - NOT fired, visible in render: the dashed `x-enqueue` run painted co-linearly over the solid Auth Check→Enqueue Job arrow for ~500px, and the `x-status` run hugging the API lane border so it reads as a dashed lane outline (crops `s1-crop-auth.png`, `s1-crop-right.png`). Also "Auth Check" truncated to "Auth…". Zero edge-clarity findings.
- aesthetic (anchored): **6/10 vs ref-gc ≈7–8** — side-by-side, corridors, tints, legend sticky and per-flow color coding are at reference par, but the reference never lets two edge runs share a line or a border, and S1 shipped both plus a truncated node label.
- deltas: vs v1 S1 (13 propose_program retries, perimeter mega-detours, committed at 3/5): no retries, no perimeter loops, all channels landed in-build. vs v3 S1 (aesthetic 4/5, hidden label pill in right corridor): v4's corridors are wider and label pills all readable; the residual defect class shifted from label collisions to co-linear edge runs.

### S2 — readability iteration probe (the round's core): "give every labeled edge room to breathe, widen the corridors, rebalance … polish to reference quality"
- session/container: b03d7c27-7eb3-430c-a274-a3b572953c2b / f3df3794-38b5-5c10-bba1-2c06095b20a7
- outcome: committed (15 turns). Op mix: 18 updateObject, 7 updateConnection (arrow). 6 renders.
- tool sequence: board → render → apply_ops (widen corridors) → render → apply_ops (remove/re-add edges to reset routes) → render → apply_ops (**reorder lanes** to Frontend/API/Data/Workers for handoff adjacency) → render → apply_ops (stagger columns) → render → apply_ops (widen Auth Check) → apply_ops (fix spacing) → apply_ops (even rhythm) → render → commit.
- the probe's answer: the agent genuinely restructured, not just nudged — it re-sequenced the lanes so `enqueue`, `read`, `serve`, `submit` drop as straight vertical rails with chips in open corridors, moved the lone long `status` return into a dedicated right gutter, killed S1's co-linear overlap and border-hug, and un-truncated Auth Check. That is exactly the "actually spreads things out" behavior Ford's critique demanded.
- diagnostics story:
  - `W1/W2 spacing: gap api-parse↔api-auth 112px off the ladder … nearest rungs 96 / 128 [quickfix]` (turn 10) — HEEDED via manual op next turn. Correct.
  - `W5 rhythm: run api-parse→api-auth→api-enqueue gaps 128/96px uneven (spread 32px)` (turn 11) — HEEDED (evened turn 12). Correct.
  - section-trim ×4 + `density: lane-data 48–49% of its width is empty on the left` — fired every apply_ops turn, OVERRIDDEN. Verbatim: "intentionally retained shared timeline whitespace across swimlanes (W1–W5)." The lane-data left slack IS the design (stages sit under their source columns).
  - the new labeled-edge breathing check: silent all session — correctly (every chip has air), but note the big win came from the model's render loop, not from any diagnostic.
- aesthetic (anchored): **7/10 vs ref-gc ≈7–8** — side-by-side this now reads at a glance like the reference (rails, chip air, flow colors); what the reference still does better is deliberate density variation and annotation richness — S2 is uniformly airy with ~500px of trailing dead frame below Workers, and status/write cross once near Results DB.
- delta vs v3's equivalent (S4 follow-up revision, needed an operator critique to fix collapsed pitch): v4 self-served the whole readability pass in one session with no operator message.

### S3 — genre edit probe: "add an Observability lane below Data with two stages wired from Workers and API; board growth welcome; keep every corridor readable"
- session/container: f331cef6-2f04-4013-93d8-7fd567134590 / 62a74bcd-3db8-5ee1-b97a-04bb15a77cc8
- outcome: committed (10 turns). Op mix: 3 addObject, 2 addConnection, 5 updateObject (incl. page-frame growth 1744→2128 tall). 3 renders + 1 inspect.
- diagnostics story:
  - `E1 label-clearance: label "status" chip on x-status covers data-queue (route x-status around data-queue or move the label with a waypoint)` — fired turns 3–5 (the lane insertion pushed the status chip onto Job Queue), HEEDED by turn 6 rerouting/repositioning. Correct, would have been gate-blocking. **The new check's best moment of the round.**
  - section-trim ×5 (now incl. the new lane) + density on lane-data — OVERRIDDEN again. Verbatim: "retained intentional full-width swimlane slack to match the existing layout (overrode W1–W6)."
  - NOT fired, visible in render: `poll` (Job Queue→Pick Up Job) now mega-detours around the entire new lane via the left margin because Data/Workers adjacency was broken, and the `poll`/`spans` chips sit in the far-left margin at x≈190 while their runs span ~2300px — you must trace the dash to know which is which (`s3-draft-chrome.png`).
- aesthetic (anchored): **6/10 vs ref-gc** — the lane lands styled/tinted/wired with every chip in clear air, but the reference keeps labels mid-run beside their flows and has no wrap-around runs; the left-margin dashed weave (spans + poll stacked) is the kind of tracing burden the reference never imposes.
- delta vs v1 S2/S3 (abandoned against frame; committed at 2/5 with overlapping wrapped connectors) and v3 S4 (needed follow-up to fix pitch collapse): v4 one-shots the lane with growth, zero channel loss, and its one real defect is routing topology, not styling or pitch.

## Rule-efficacy table

Fired counts are distinct findings × turns-alive across all 3 sessions (36 agent turns total).

| rule | fired | heeded/quickfixed/overridden | correct? | verdict |
|------|-------|------------------------------|----------|---------|
| spacing (ladder) | 2 findings, 1 turn (S2 t10) | heeded (manual op; quickfix offered, not used) | yes — 112px between rungs after a node widen | **WORKING** |
| spacing: labeled-edge breathing | 0 | — | no false positives; nothing it should have caught (chip corridors were generous in all renders) | **WORKING (silent)** — unexercised this round; keep |
| grid | 0 | — | agent stayed on-grid throughout; no misses visible | **WORKING (silent)** |
| section-trim | ~22 warning-turns (every apply_ops turn, all 3 sessions) | overridden every time, with notes | **false positive on full-width lanes** — hugging a lane to content would break equal-width swimlane geometry; every commit summary burned its space on trim overrides | **MISCALIBRATED** — exempt sections whose stacked siblings share the same span (lane pattern), or stop re-firing once overridden in-session |
| registers | 0 | — | the S2 vertical rails were model-built; no register defect visible for it to miss | NEUTRAL (unexercised) |
| hub-balance | 0 | — | no hubs in this genre | NEUTRAL (n/a) |
| rhythm | 1 (S2 t11) | heeded | yes — 128/96 uneven run, evened next op | **WORKING** — this is the check whose absence let v3's S4 pitch collapse ship "Lint: clean" |
| density | 3 (S1 t1 95%-empty; S2/S3 lane-data 48–49% left-empty) | S1 heeded; S2/S3 overridden | S1 correct; S2/S3 false positive — the empty left half is the staircase that makes handoffs drop vertically | **MISCALIBRATED on lanes** — discount slack under/over cross-lane content columns |
| label-clearance | 1 finding, 3 turns (S3 E1, error tier) | heeded | yes — chip genuinely covered Job Queue | **WORKING** — round's best new-check evidence |
| overlap | 0 | — | no >25% overlaps existed | WORKING (silent) |
| containment | 1 (S1 E1) | heeded | yes — seed node 48px outside lane | **WORKING** |
| edge-clarity | 0 in 36 turns | — | **misses you can see**: S1's 500px co-linear dashed-over-solid run, S1's border-hugging status route, S3's stacked parallel dashed runs in the left margin — all shipped with zero findings; the model fixed the S1 pair only by staring at S2 renders | **BLIND** |
| color-contrast | 0 | — | no violation attempted — guidance visibly steered choices (S1/S3 thinking: "Refining node and lane color scheme", "Deciding contrasting node colors"); 5 distinct tints, every node legible on its tint, no same-color-on-same-tint | **WORKING as guidance**, unexercised as check |

## Ford's standing critique, tested

"Too close together if you're actually trying to read it" — not reproduced in v4 swimlane
output: no 64px label-chip cramming anywhere in the battery; S2's probe produced real
restructuring (lane re-sequencing), not token nudges. The residual readability debt is
routing-shaped (co-linear runs, wrap-around detours, margin-stranded labels), which the
diagnostics currently cannot see (edge-clarity BLIND) and the render loop only sometimes
catches.

## Top 3 changes for Round 2

1. **Swimlane-exempt (or once-only) section-trim.** 22 of ~31 warning-lines this round were
   trim findings on deliberately full-width lanes, re-fired on every apply_ops turn even after
   an explicit override; all three commit summaries spent their text overriding them (S1
   "intentionally retain right-side routing slack…", S2 "intentionally retained shared timeline
   whitespace…", S3 "overrode W1–W6"). Suppress trim for sections whose same-axis stacked
   siblings share the span, or at minimum stop re-firing a finding the agent has already
   overridden in-session — the noise risks training the model to override reflexively (by S3 it
   was batch-overriding "W1–W6" in one clause).
2. **Give edge-clarity a co-linearity + border-hug check.** Flag (a) two edge runs sharing an
   axis-aligned segment within ~8px for >100px, (b) an edge run tracking a section border
   within ~12px for >200px. Grounded: S1 committed with the dashed x-enqueue painted exactly on
   the solid Auth→Enqueue arrow and x-status tracing the API lane outline (crops
   `s1-crop-auth.png`, `s1-crop-right.png`) — 0 findings; the fix arrived a full session later
   and only because S2's prompt sent the model back to the renders.
3. **Label-position finding: chip far from its run's midpoint.** Warn when a labeled edge's
   chip center is beyond ~35% from the run midpoint AND sits outside every lane the edge
   connects (margin-stranded). Grounded: S3's "poll" and "spans" chips landed at x≈190 in the
   left margin naming dashed runs ~2300px long that wrap the new lane — each chip has clear
   air (so the breathing check is rightly silent) yet the board is harder to read than any
   spacing number captures, which is exactly the gap between "label owns air" and "label tells
   you which edge this is".

Watch-item (not top-3): density's lane false positive (S2/S3) pairs with #1 — both are the
diagnostics not knowing the lane idiom; if a `lane` heuristic is added for trim, reuse it for
density.

## Mechanics notes

- Zero invalid ops / syntax rejections in 36 turns; commit gate never blocked a commit; one
  error-tier finding per S1/S3, both resolved before commit (gate behaved as designed).
- draft.svg ships `width="1400" height="875"`-style attributes with a larger viewBox —
  qlmanage crops it; rewrite width/height to the viewBox size and rasterize with headless
  Chrome for full-board judging.
- Materialization: accept → 36/25/10 ops applied to the doc → PUT :4000 (200 each). S3 grew
  page-frame; the canvas `size` field does not auto-grow — I extended it manually in the PUT
  to keep preview.svg from clipping.
- Evidence in scratchpad `v4r1-swimlane/`: ref-gc.svg.png, ref-intent.svg.png,
  s1-draft-chrome.png, s1-crop-{auth,right,read}.png, s2-draft-chrome.png,
  s3-draft-chrome.png, final-committed.png, s{1,2,3}-transcript.json.
