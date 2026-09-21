# v5 round 2 — branching flowchart

Canvas: eval-v5-flowchart · Sessions run: 3 (S1 build, S2 readability probe, S3 structural edit
with one in-session follow-up — same battery, same verbatim instructions as Round 1) ·
Date: 2026-07-22 · Harness: :4820 v5 (5 graph lints; full `<style_guide>` [9 topics] +
`<board_state>` injected at spawn; every apply_ops returns DELTA + LINTS delta + auto close-up
render) · Baselines: `v4r1-flowchart.md` (Round-1 board `eval-v4-flowchart` re-rendered this
round for the delta).

Reference anchoring done first: gc-decomp-harness (bar ≈7.5) and intent-classification-2 (≈7)
rendered at 2800px and studied before any session, plus the Round-1 committed board. All scores
below are side-by-side judgments against those renders. Crop evidence lives in the session
scratchpad (`v5r2-flowchart/` subdir); load-bearing geometry is quoted inline as SVG path
coordinates.

Verified at spawn: the S1 kernel context contains `<editor_state>`, the full `<style_guide>`
(all 9 topics: Spacing and corridors, Grid discipline, Section framing, Registers and rhythm,
Fan composition, Color semantics, Connectors and labels, Tree edge entry, Lanes and corridors;
~9.1KB) and `<board_state>` (digest + full lint report). Every apply_ops result carried the
APPLIED/DELTA/LINTS-delta block and an auto close-up image, and the agent visibly reacted to
them next turn.

## Sessions

### S1 — build: full order-processing flow (verbatim Round-1 instruction)
- session/container: 567e8463-2ccf-48ba-bab5-00e6bf9ee879 / a9a0e07f-672f-53be-b553-78b23ec5dff7
- outcome: committed → accepted → materialized (PUT via :4000 OK); 0 tool errors; ~4 min wall
  clock (v4 S1 needed the 15-min budget warning; v5 is much faster)
- tool sequence (16 turns): board → apply_ops(3 sections) → apply_ops(4) → apply_ops(7 nodes) →
  apply_ops(11 edges) → apply_ops(5) → apply_ops(4) → render → apply_ops(5) → render →
  apply_ops(2) → render ×2 → board → apply_ops(1) → render → commit. 5 explicit renders PLUS an
  auto close-up on every apply_ops (12 images total seen).
- op mix (accepted): addObject 13, addConnection 11, updateObject 1 (25 ops — identical mix to
  Round 1's S1)
- lint story: frame-balance W ×2 early (t0 "87% dead on the right" on the 2-object seed board;
  t1 "45% dead on the bottom" mid-build — both true, both dissolved as content arrived).
  t4 (+5): **E1 covered-content chip-vs-edge — the Round-1 blind spot, now firing**
  ("label 'Authorization result' chip … lies on edge-retry-loop's path for 22px") + 4×
  unreadable-labels **at the new floor 128** ("112px gap is too tight … give it ≥128px") with
  chip-aware floors (≥216, ≥192). t5 (+4 −5): second E1 (190px on edge-payment-no's path) + two
  **16px-clearance warnings** ("'No' chip sits within 16px of authorize-payment", "'Validated'
  chip sits within 16px of edge-correction-loop's path"). All heeded manually within 1–2 turns —
  fixes included both corridor widening AND label shortening ("Authorization result"→"Result",
  "Retry (attempts < 3)"→"Retry (< 3)"), a legitimate new fix mode the floor incentivizes.
  LINTS · clean from t10; commit gate never had to block.
- aesthetic (anchored): **6.5** — side-by-side with gc-decomp: for the first time in four
  rounds there is NO chip touching any line at commit (both loop junctions verified in crops:
  `s1-crop-validation-junction.png`, `s1-crop-payment-junction.png`); corridors are
  reference-generous (128–208). What the reference still does that this doesn't: real decision
  DIAMONDS (see misses), deliberate density variation (both big sections commit with dead lower
  halves), and margin annotations adjacent to the flow (sticky parked bottom-right, ~400px from
  the retry flow it annotates).
- misses: (a) "actual decision-diamond shapes" is STILL unsatisfied — but it is now
  satisfiABLE: gc-decomp's diamonds use `style.shape: "diamond"` and render as true diamonds;
  the agent set only `type: "decision"` (rounded rect) because nothing in the style guide or
  tool docs mentions the shape vocabulary, then the commit summary claimed "yellow decision
  diamonds" anyway — same honesty defect as Round 1, now purely a documentation gap;
  (b) **hidden co-linear dashed-under-solid runs at both loop-backs**, invisible in the render
  because the solid paints over the dash: edge-correction-loop shares x=768 with
  edge-order-valid-no for ~60px, edge-retry-loop shares x=1560 with edge-payment-no for ~140px
  (draft-SVG paths: solid `L 1560 641 … L 1560 662` vs dashed `M 1560 662 L … L 1560 509.5`).
  The advertised broken-edges co-linear check (≥100px) never fired — see the table.
- delta vs v4r1 S1 (6): +0.5 — same instruction, same op count, but zero committed chip
  contacts (v4 shipped the No-chip-on-elbow occlusion under clean diagnostics) and the two E1s
  that fired are exactly the class v4's label-clearance was blind to.

### S2 — readability probe (verbatim Round-1 instruction: breathe / widen / rebalance)
- session/container: b59a3fbf-d0cd-4cc1-923d-4dce6490dc29 / fd88d8d5-8184-5c51-bace-073b014ff8e9
- outcome: committed → accepted → materialized; 0 tool errors; ~2 min
- tool sequence (6 turns): board → render → apply_ops(14) → render → board → commit. One batch,
  2 renders + 1 auto close-up.
- op mix: updateObject 14 — pure geometry, zero topology/style churn, exactly as instructed.
- lint story: **zero lints fired in the entire session** — and the agent still did the
  reference-chasing work unprompted. This is the round's core v5 datum: the craft arrived from
  the style guide, not from per-turn warnings.
- did it actually spread things out? Yes, and more intelligently than v4: all three sections
  hugged to content (validation/fulfillment 1120→848 tall; payment deepened to 1376 to actually
  contain the failure chain), retry chain given real vertical air (Retry payment → Order failed
  gap 152→352), sticky moved from the dead bottom band into the right margin lane aligned with
  the fulfillment column, corridors kept at 128. Board reads at a glance.
- aesthetic (anchored): **7** — the closest a flowchart session has come to the bar: corridors,
  hugged sections and one clean spine register across all three sections. Remaining side-by-side
  delta vs gc-decomp: density is still one uniform band (no packed-column contrast), the margin
  is used for exactly one sticky rather than as an annotation lane, and both hidden co-linear
  loop verticals survived (now 128px and 168px — same-topology inheritance from S1).
- delta vs v4r1 S2 (6.5): +0.5 — v4's readability pass left the chip-on-elbow blemish; v5 had
  no blemish to miss, and section hugging arrived without section-trim nagging (v4 needed
  section-trim + density fires to get there).

### S3 — structural: fraud branch (verbatim Round-1 instruction) + one operator follow-up
- session/container: c268b135-1124-469d-9820-5e0ccfdc8aab / fe93ecb5-0ef8-5ce7-9c37-6b8fed092831
- outcome: committed; operator follow-up ("the teal No edge runs through the violet Reviewed
  arrowhead — reroute, change nothing else") → second commit → accepted → materialized.
  18 turns total, 7 render images, 0 tool errors.
- op mix (accepted, consolidated): addObject 2 (Fraud review, Fraud suspected?), addConnection 4
  (Risky / Reviewed / Yes-red / No-teal rejoin), updateObject 1. Topology exactly as asked; all
  existing labels/colors/dashes/sticky survived verbatim; existing spacing NOT compressed (main
  register untouched — **no spine kink this round**, unlike v4's 48px register break).
- lint story: t2 (+2 W): 16px-clearance caught the new node crowding an existing chip ("'No'
  chip sits within 16px of fraud-review") → fixed next turn by resizing/moving fraud-review.
  t3 (+1 E): **E1 covered-content: "'Yes' chip on edge-payment-yes lies on edge-fraud-no-pack's
  path for 48px" — precisely Round 1's committed defect class, now caught as an error before
  commit** → cleared by t7 via two node nudges. t9: recolored the rejoin green→teal —
  unprompted protection of the semantic green channel (color-semantics adherence). Clean at
  both commits.
- first-commit defects (both silent in lints): (a) the teal No edge exited Fraud suspected?'s
  TOP at the same point the violet Reviewed arrow enters — teal line straight through the
  violet arrowhead (crop `s3-crop-reviewed.png`); (b) the solid red Yes edge merges into the
  dashed red retries-exhausted vertical at x=1196 for ~114px into Order failed — the dash
  pattern visibly truncates to solid mid-run (crop `s3-crop-orderfailed.png`). The commit
  summary honestly disclosed a third, minor one: the teal rejoin "sharing Pack & ship's bottom
  connector corridor briefly" (enters the bottom face 32px from where Shipped exits it,
  `s3-crop-packship.png`).
- the follow-up fix: **a single surgical op — `updateConnection edge-fraud-no-pack
  {from: {anchor: "right"}}`** — then 3 verification renders and an honest summary. Zero
  geometry cost (v4's equivalent fix bought a 48px spine kink). The agent reached for the
  anchor vocabulary the style guide teaches, on demand, first try (`s3b-crop-reviewed.png`
  shows the clean right-face exit through the inter-section corridor).
- aesthetic (anchored): **6.5** — denser board still holding one register and clear chips;
  side-by-side delta: gc-decomp keeps every arrowhead and every dash-channel unambiguous at 3×
  the edge count, while this needed an operator message for an arrowhead and ships a
  dash-that-becomes-solid into its failure terminal.
- delta vs v4r1 S3 (6.5): +0 on score, but the failure class moved up a level: v4 shipped a
  chip strike-through (now caught by E1 mid-session) and paid for its fix with a register
  break; v5's residual defects are arrowhead coverage and co-linear merges — things no lint
  owns yet — and its fix was free.

## Final board vs Round-1 board (both rendered this round)

eval-v5-flowchart final vs eval-v4-flowchart final, side by side: v5 has zero chip-line
contacts (v4's No-chip-on-elbow occlusion is still on its board), hugged sections vs v4's slack
validation frame, sticky in a margin lane vs v4's floating mid-board sticky, and an added
fraud branch at equal register discipline. Both share: no diamonds, a dead bottom band,
uniform density. Net: **v5 final ≈ 6.75 vs v4 final ≈ 6.5, still ~0.75 below the gc-decomp
bar** — the remaining gap is now composition craft (density variation, margin annotation,
shape vocabulary), not wreckage.

## Lint-efficacy table (5 lints, all three transcripts, 14 findings total)

apply_quickfix: available, used ZERO times again — every finding fixed via ordinary ops within
1–2 turns. No overrides all round, so no override notes to quote.

| lint | fired | heeded? | correct? | verdict |
|---|---|---|---|---|
| covered-content (chip-vs-edge E, chip/node/edge 16px-margin W) | 7 (S1: E×2 + W×2; S3: W×2 + E×1) | 7 heeded, 1–2 turns each | every fire real and actionable; the two S1 E-fires and the S3 E-fire are exactly Round 1's label-clearance blind spot, now caught pre-commit; zero false positives | **WORKING** — the headline v5 win. Gap: text/chips only — it does not own ARROWHEAD coverage (S3's teal-through-violet-arrowhead shipped clean) or same-face entry/exit collisions (Pack & ship bottom corridor) |
| containment (E) | 0 | — | nothing escaped a section or the frame; gate never engaged | WORKING-idle (2 rounds running) |
| broken-edges (through-box E; co-linear/border-hug/stranded-chip) | **0** | — | **four real co-linear dashed-under-solid runs ≥60px existed and three exceeded the advertised 100px threshold**: S1 retry loop 140px (x=1560), S2 validation 128px (x=864) + retry 168px (x=1704), S3 red Yes-over-retries-exhausted 114px (x=1196, visibly truncates the dash channel into Order failed). SVG path coords in session notes; none flagged | **BLIND** — the co-linear check misses opposite-direction runs that share a target anchor (the loop-back idiom, which is this genre's most common pattern). Border-hug and stranded-chip: no cases arose, untested |
| unreadable-labels (W, floor 128) | 5 (all S1) | 5 heeded (widen AND shorten-label) | all real; the raised floor produced reference-width corridors on the first build instead of S2 having to out-do the rule (Round 1's exact complaint) | **WORKING** — floor 96→128 did what Round 1 asked; chip-aware floors (chip+32) phrased clearly enough to act on |
| frame-balance (W) | 2 (S1 t0, t1) | dissolved by construction | both literally true; the t0 fire on a 2-object seed board is noise (nothing to balance yet); correctly silent at all three commits (final dead band ≈32% < threshold) | **WORKING**, minor miscalibration: suppress below ~4 objects or before first apply_ops |

## Style adherence (did behavior follow each topic UNPROMPTED?)

| topic | verdict | evidence |
|---|---|---|
| Spacing and corridors | **FOLLOWED** | 128–208px stage corridors from the very first placement batch (S1 t1–t3, before any lint could teach it); S2 rebalanced with zero lint pressure |
| Grid discipline | **FOLLOWED** | every coordinate in all 31 accepted geometry ops is a multiple of 16; zero snap corrections all round (v4 needed a grid-lint fire) |
| Section framing | **PARTIAL** | S2 hugged all three sections + reserved header bands unprompted — but S1 committed both big sections with <50% interior occupancy and only the S2 instruction fixed it; the guide's "interior <40% reads unfinished" is not self-enforced at commit |
| Registers and rhythm | **FOLLOWED** | one shared main-flow register across all three sections in every commit; the S3 fix cost zero register break (v4's cost 48px) |
| Fan composition | n/a | no ≥3 fan formed this genre |
| Color semantics | **FOLLOWED** | semantic red/green reserved; S3 t9 recolored the rejoin edge green→teal specifically to protect the completion channel — unprompted, mid-session; distinct tints, white-on-tint nodes |
| Connectors and labels | **PARTIAL** | the topic's headline ban held perfectly: ZERO relay/port/junction scaffolding in 31 accepted ops (v3-era relay-pill habit fully dead); chips ride their runs. But anchors are used only REACTIVELY (all 15 addConnection ops omit anchor; the router's face choices caused the arrowhead collision and the Pack & ship shared face), and the topic's explicit "never let two runs share a line (co-linear dashed-over-solid)" was violated 4× invisibly — the agent cannot see solid-over-dash in its own renders, and no lint mirrors that guide line |
| Tree edge entry | transfer only | no tree here, but its anchor vocabulary is what the S3 follow-up reached for (`from.anchor: "right"`, first try) |
| Lanes and corridors | n/a / transfer | no lanes; corridor-as-annotation-lane partially internalized (sticky → right margin lane in S2; S3 reroute used the inter-section corridor) |

Core v5 hypothesis check: S2 ran lint-silent and still produced house-style work, and S1's
craft (corridors, tints, semantic colors, direct labels) was present in the FIRST placement
batch — the style guide is doing the work the v4 per-turn warning wall did, without the
nagging. Per-turn perception also proved out: the auto close-ups + DELTA were visibly consumed
(S3 t3's fixes respond to t2's close-up and warnings next turn), and the DELTA channel exposed
one noise source — S3 t2 printed 14 lines of derived `parentId` churn that the agent never
asked about.

## Top 3 changes for Round 3

1. **Fix broken-edges' co-linear detection for the loop-back idiom** (opposite-direction runs
   sharing a vertical into a common anchor point). Grounded: 4 uncaught instances across 3
   sessions, one visibly harmful (S3's red Yes edge overpaints the dashed retries-exhausted
   run for 114px so the dash channel "becomes" solid before Order failed — crop
   `s3-crop-orderfailed.png`). Pair segments regardless of direction/color and flag shared runs
   ≥64px unless the two edges share both endpoints — or better, fix it in the router: offset a
   loop-back's exit 16px from any occupied entry point on the same face (a router fix would
   also stop the guide's own "never share a line" rule being violated invisibly, which the
   agent literally cannot see in a render).
2. **Extend covered-content (or broken-edges) to arrowheads and shared face-points**: flag an
   edge polyline passing within ~12px of a foreign edge's arrowhead, and two edges using the
   same node face within 24px of each other. Grounded: the round's only operator message was
   S3's teal-through-violet-arrowhead, and the agent's own summary flagged the Pack & ship
   shared bottom corridor it had no tool to reason about — both are the "covered content"
   concept applied to edge furniture instead of text.
3. **Put the diamond in the vocabulary**: one line in Connectors-and-labels or a new shape note
   ("decision nodes: set `style.shape: 'diamond'` — `type` alone renders a rounded rect"), or
   make `type: "decision"` default to the diamond glyph. Grounded: second round running the
   verbatim instruction asks for "actual decision-diamond shapes", the reference board renders
   true diamonds via `style.shape`, the agent ships rounded rects, and the commit summary
   falsely claims "yellow decision diamonds" — currently unfixable by the agent because the
   shape vocabulary appears nowhere in its context.

Honorable mentions: nudge the Connectors topic toward PROACTIVE anchors ("set anchors wherever
the correct face is knowable — loop-backs, rejoins, terminal entries"); suppress frame-balance
until the board has ≥4 objects; suppress derived-parentId lines from DELTA (S3 t2 spent 14
lines on adoption churn no one asked about).
