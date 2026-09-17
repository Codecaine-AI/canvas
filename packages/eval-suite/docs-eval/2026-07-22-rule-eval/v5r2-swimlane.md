# v5 round 2 — swimlane pipeline

Canvas: eval-v5-swimlane · Sessions: 3 (all committed + materialized) · Date: 2026-07-22
Baseline for delta: `v4r1-swimlane.md` (S1 6/10, S2 7/10, S3 6/10 anchored vs gc-decomp ≈7.5).
Harness: v5 at :4820 — 5 graph lints (covered-content, containment, broken-edges, unreadable-labels,
frame-balance), full `<style_guide>` injected into session context, apply results returning
DELTA + LINTS delta + auto close-up crop.

## Reference anchoring

Rendered and viewed both anchors AND the Round-1 board before any session (scratchpad
`v5r2-swimlane/ref-gc.svg.png`, `ref-intent.svg.png`, `r1-board.svg.png`). gc-decomp (≈7.5, the
bar): every chip owns clear air, tints group, flows color-coded per concern, margin stickies,
deliberate density variation. Round-1 board side-by-side notes: good rails and chip air, but the
`spans`/`poll` chips stranded in the far-left margin naming ~2300px dashed wrap-around runs, the
dashed status route riding the right edge, dead band below Workers — the routing debt the new
broken-edges checks were built from.

## Sessions

### S1 — build: 4 tinted lanes, ~14 stages, labeled handoffs, dashed async, margin sticky, "readability is the bar"
- session/container: 170bbc8d-ed57-46f2-bb96-9ac5914d7f14 / 62587c25-fe2b-5787-9ee7-6e39b6c4ffb7
- outcome: committed (~6.5 min wall clock, 25 turns). Net ops 35: 19 addObject, 15 addConnection, 1 updateObject. board ×2, apply_ops ×11, render_draft ×7.
- perception channel: every apply_ops result carried `LINTS · +N −M` plus a close-up crop of the touched region — the model visibly reacted to crops (e.g. T13 "Resolving connection overlaps by rerouting edges" directly after the +7 lint delta).
- lint story:
  - `W frame-balance: diagram inhabits only the left of the frame (88% dead on the right)` at spawn — correct (only seed-a existed), implicitly resolved by the build. The check's first correct firing in this genre.
  - T11 `LINTS · +7`: 3× covered-content E (read/result chips on each other and on paths) + 4× unreadable-labels W (64px gaps for dequeue/payload/status/accept chips) — ALL heeded within two turns (+1 −7, then −1). One more covered-content E at T18 (read chip covering worker-status), fixed next turn.
  - broken-edges, containment: silent — correctly; final board verified clean under a direct lint run.
- **Zero section-trim/density lines. Zero overrides. The commit summary is about the diagram** ("no known flaws shipped") instead of v4r1's trim-override boilerplate.
- aesthetic (anchored): **7/10 vs ref-gc ≈7.5** (v4r1 S1: 6/10, **+1**) — side-by-side, corridors/tints/per-flow color coding are at reference par and, unlike v4r1 S1, there is no co-linear dashed-over-solid run, no border-hugging route, no truncated label. What the reference still does better: richer margin annotation, deliberate density variation (S1 is uniformly airy), a modest trailing band below Data.

### S2 — readability probe: "give every labeled edge room to breathe, widen the corridors, rebalance … polish to reference quality"
- session/container: be52c343-0837-4292-80bc-edf48337db28 / 31709825-7697-565f-963e-e942ce8beedf
- outcome: committed (~2 min, 7 turns). Net 17 updateObject. 2 renders.
- the probe's answer this round: a **light, correct polish** — lanes compacted onto even 208px registers, inter-lane corridors evened at 128px, the accept gap widened. The heavy S2 restructuring of v4r1 (lane re-sequencing, edge re-adds) was unnecessary because v5's S1 shipped clean — the readability work moved from the probe into the build, which is the intended v5 outcome.
- lint story: lane compaction shrank the accept gap and `unreadable-labels` fired once (96px < 128 for the chip) — heeded next turn (`api-create 752,704 → 784,704`, `LINTS +0 −1`). Correct and precise. Nothing else fired; zero noise.
- aesthetic (anchored): **7.5/10 vs ref-gc** (v4r1 S2: 7/10, **+0.5**) — at reference par on rails, registers, chip air, flow colors; short of it on density variation and annotation richness only.

### S3 — genre edit probe: "add an Observability lane below Data with Trace Requests + Collect Metrics wired from Workers and API; growth welcome; keep every chip beside its own flow"
- session/container: 18caa81e-756b-4f21-b6d8-edcf37ecfa60 / 8d3b8d9a-2e75-517f-87a4-3bfcb121b0aa
- outcome: committed (~5.5 min, 24 turns). Net 8 ops (3 addObject incl. the lane, 2 addConnection, 3 updateObject incl. page-frame growth 1744→1968). 8 renders — the agent stared at this one hard.
- lint story:
  - `E covered-content: "status" chip on edge-worker-status lies on edge-collect-metrics's path` — fired the moment the metrics wire crossed the Workers lane (turns 3–8), gate-blocking, HEEDED via reroute + node moves. The direct heir of v4r1 S3's best moment, again correct.
  - `W covered-content: "payload" chip within 16px of edge-trace-spans's path (can read as the wrong edge's label)` — the new CHIP_CLEARANCE proximity tier, fired T15, heeded T16. Correct, and a class v4 could not see.
  - **broken-edges: silent all session — and this time that's a miss.** The committed board has the spans wire drawing a dashed second frame around the ENTIRE Data lane (top, left, and bottom borders) and the metrics wire running ~1000px down the board's right edge (crops `s3-crop-spans.png`, `s3-crop-metrics.png`). Both runs sit at exactly **20px** from the section borders — the elbow router's own clearance — and BORDER_DISTANCE is 12px, so **router-generated border-parallel runs can structurally never fire the check** (measured from the draft SVG: spans vertical leg x=108 vs Data border x=128; metrics leg x=2868 vs lane border x=2848).
  - commit etiquette high point: the agent **self-declared** its one register break in the summary — "minor shipped flaw: Process Task sits 32px below the Workers register to prevent the spans wire from tracing the payload flow." That's a deliberate, stated trade against a co-linear run; the v5 loop is producing exactly the override-with-reasons culture the trim noise was drowning in v4.
- aesthetic (anchored): **6/10 vs ref-gc** (v4r1 S3: 6/10, **flat**) — the lane lands wired with every chip mid-run beside its own flow (better than v4r1's margin-stacked poll/spans chips), but the wrap-around weave imposes the same tracing burden the reference never does; the Observability lane's gray tint is also visibly weaker than the four colored lanes.

## Broken-edges new checks — did they catch what shipped invisibly in v4r1 S1/S3?

Verified three ways: (a) in-session firing, (b) v5 lints run directly against the Round-1 board
document (`eval-v4-swimlane`), (c) synthetic documents reproducing the exact v4r1 defect
geometry (`synthetic2.json`/`synthetic3.json` in scratchpad).

| check | v4r1 defect it targets | verdict |
|---|---|---|
| co-linear shared run | S1's dashed x-enqueue painted on the solid Auth→Enqueue arrow (~500px, 0px apart) | **CATCHES IT** — synthetic reproduction fires (`e-solid and e-dash run co-linear for 600px (0px apart)`); no false positives in 3 sessions |
| border-hugging | S1's x-status tracing the API lane outline | **CATCHES the waypointed case** (synthetic 8px hug fires at 1600px) **but BLIND to router-routed runs** — the router's 20px clearance clears the 12px threshold, so v5 S3 shipped a three-border wrap of the Data lane + a 1000px right-edge run with zero findings. Threshold sits below the only distance the router ever produces. |
| stranded chip | S3's poll/spans chips at x≈190 naming ~2300px runs | **DOES NOT CATCH THE ROUND-1 CLASS** — it measures chip-to-own-wire distance, and those chips sat ON their wires (the wires wandered into the margin). Confirmed: the v4 final board, which contains that defect twice, lints **clean** under v5 broken-edges. The check does fire correctly on its literal definition (diagonal-waypoint mislocation, synthetic: `chip hangs 198px from its own wire`). |

Bonus finding: v5 lints on the v4 final board surface **2 covered-content errors** (status chip on
data-1's path, metrics chip on x-status's path) that v4's rule set shipped silently — the merged
covered-content lint is strictly sharper than v4's label-clearance. The v5 final board lints clean.

## Noise verification (the round's second mandate)

- v4r1: ~31 warning-lines across 3 sessions, 22 of them section-trim/density noise, all overridden, every commit summary burned on overrides.
- v5r2: **12 findings total** across 56 agent turns (S1: 9, S2: 1, S3: 2). Every one actionable, every one heeded — **zero overrides, zero re-fire nagging** (S3's E1 persisted turns 3–8 only while actively being fixed). Commit summaries describe the diagram.
- And the lanes stayed clean anyway: equal-width full-span lanes with idiomatic side slack shipped in all 3 sessions with no trim complaints and no degradation — the `lanes-and-corridors` style topic carries that craft now (S2's compaction onto even registers happened unprompted by any lint).

## Lint efficacy table

Fired counts are distinct findings across all 3 sessions (56 agent turns).

| lint | fired | heeded/overridden | correct? | verdict |
|------|-------|-------------------|----------|---------|
| covered-content | 6 (S1: 4E; S3: 1E + 1W proximity) | all heeded, ≤2 turns each | yes — every finding visible in the close-up crops; the 16px proximity tier caught a "chip reads as wrong edge's label" case v4 couldn't | **WORKING** — best lint of the round |
| containment | 0 | — | no misses (S1 placed all nodes in-lane, unlike v4r1 S1's E1); fires correctly on synthetic | **WORKING (silent)** |
| broken-edges | 0 in-session | — | no false positives, but two SEEN misses in S3 (three-border wrap + right-edge run, both at 20px router clearance); stranded-chip cannot express the Round-1 margin-wire class | **MISCALIBRATED** (border-hug threshold) + **partially BLIND** (stranded-chip definition) — fixes in top-3 |
| unreadable-labels | 5 (S1 ×4, S2 ×1) | all heeded (manual ops; quickfix offered, unused) | yes — 64/96px gaps genuinely too tight for their chips | **WORKING** — unchanged from v4, still earning its keep |
| frame-balance | 1 (S1 spawn, 88% right-dead) | heeded (build spread across frame) | yes | **WORKING** — the "rebalance had nothing to push against" gap from state-machine R1 now has a check, and its one firing was correct |

## Style adherence (all topics injected via `<style_guide>`)

| topic | adherence | evidence |
|---|---|---|
| lanes-and-corridors | **partial** | equal-width stacked lanes, staggered columns, adjacent-lane handoffs as short rails, chips mid-run — all followed; but S3 violated the topic's own core sentence ("flows that skip lanes get a dedicated gutter … never trace a lane border or wrap the whole board") by wrapping the Data lane |
| spacing-and-corridors | good | 128px corridors held; chip-breathing floor respected after lint nudges; "don't equalize every gap" only partly followed (board is uniformly airy) |
| color-semantics | good | violet UI flow / blue sync / orange async / teal persistence, consistent node-tint legibility; weak spot: Observability lane tinted gray, visibly flatter than the other four |
| registers-and-rhythm | good | S2 evened all registers unprompted; S3's single register break was deliberate and self-declared in the commit summary |
| grid-discipline | full | every committed coordinate on the 16px grid across all 35+17+8 ops |
| section-framing / fan / tree-edge-entry | n/a this genre | no violations, no exercise |

## Ford's standing critique, tested

"Too close together if you're actually trying to read it" — not reproduced anywhere in the v5
battery; the one cramped moment (S2's 96px accept gap) was machine-caught and fixed in one turn.
The residual debt is unchanged in KIND from Round 1 — wrap-around routing topology — but improved
in DEGREE: chips now stay beside their flows, and the offender count fell from a margin weave of
stacked runs to two identifiable wires.

## Anchored score summary

| session | v4r1 | v5r2 | delta |
|---|---|---|---|
| S1 build | 6/10 | 7/10 | +1 (routing-debt classes absent at build time) |
| S2 readability | 7/10 | 7.5/10 | +0.5 (and 15 turns → 7; heavy restructure no longer needed) |
| S3 lane insert | 6/10 | 6/10 | flat — same wrap-around class, now provably invisible to the checks at router clearance |
| final board | — | — | v5 final lints clean; v4 final carries 2 covered-content errors under the same lints; v5 has no margin-stranded chips |

## Top 3 changes for Round 3

1. **Raise BORDER_DISTANCE above the elbow router's clearance, and add a wrap detection.**
   The router emits border-parallel runs at exactly 20px; the check fires at ≤12px, so the only
   border-hugs the lint can see are hand-waypointed ones — the common case is structurally
   invisible. Grounded: S3's spans wire boxed the Data lane on three borders and metrics ran
   ~1000px down the right edge, both at 20px, zero findings (crops `s3-crop-spans.png`,
   `s3-crop-metrics.png`; measured x=108 vs border x=128, x=2868 vs 2848). Fix: BORDER_DISTANCE
   ≥ 24 (or `routerClearance + 4`), and fire a dedicated "wrap" warning when one edge hugs ≥2
   borders of the same section — a dashed rectangle around a lane is a section frame to every
   reader.
2. **Replace/augment stranded-chip with a detour-ratio check.** Chip-to-own-wire distance cannot
   express the actual Round-1 defect (chip ON a wire that wanders the margin): the v4 final
   board contains it twice and lints clean under v5. Warn when a labeled edge's routed length
   exceeds ~2.5× the direct from→to distance, or when >40% of its route lies outside the union
   of the sections it connects. That one check would have flagged v4r1 S3's poll/spans weave AND
   v5r2 S3's spans wrap — the two boards' shared worst defect across both rounds.
3. **Surface the gutter idiom at the moment it's needed.** The agent demonstrably absorbed the
   style guide (mid-run chips, self-declared register break, unprompted register evening) yet
   still wrapped the board in S3 rather than reserving a gutter column — the advice sat in
   ~9KB of spawn context, three sessions deep. When an apply_ops adds a section between two
   sections that already exchange edges, append one line to the result: "new lane breaks
   Workers↔Data adjacency — reserve a gutter column for lane-skipping flows or expect
   wrap-arounds." Round 1 proved per-turn nagging is toxic for style, but this is a one-shot,
   event-triggered nudge at the exact turn the topology decision is being made (S3 T1).

Watch-item (not top-3): the auto close-up crop only ships when geometry changes (S1 T14, S3 T7
apply results had no image); after a pure updateConnection reroute the model is flying on the
digest until it pays for a render — consider including the crop for connection-only patches too.

## Mechanics notes

- Session JSON needs lenient parsing (control character in state payloads — parse with
  `strict=False`; the known session-store NUL-byte issue).
- :4000 canvas PUT now requires body `{ canvas: doc }` (bare doc 400s); :4000 briefly dropped
  mid-run once (~60s, parallel-agent restart) — retry, don't diagnose.
- Materialization: accept → 35/17/8 ops applied → PUT 200 each. S3 grew page-frame; canvas
  `size` still does not auto-grow — extended manually in the PUT (1808→2032 high).
- draft.svg width/height attrs still lie relative to viewBox; qlmanage crops even after
  rewriting them — use headless Chrome at viewBox size for full-board judging.
- Direct lint runs: `bun run lint-check.ts <doc.json>` from `packages/canvas-agent` (script in
  scratchpad) — buildBoardModel + runDiagnostics on any canvas document; used for the v4-board
  regression check and the synthetic defect reproductions.
- Evidence in scratchpad `v5r2-swimlane/`: ref-gc.svg.png, ref-intent.svg.png, r1-board.svg.png,
  s1-draft-chrome.png, s2-draft-chrome.png, s3-draft-chrome.png, s3-crop-{spans,metrics}.png,
  final-committed.png, s{1,2,3}-transcript.json, s{1,2,3}-accept.json, synthetic{,2,3}.json.
