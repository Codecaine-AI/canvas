# Rule scorecard — layout-agent eval, 2026-07-22

33 sessions across five diagram types (6 flowchart · 6 swimlane · 6 nested-arch · 8 state-machine · 7 org-tree),
run by five independent evaluation agents against the live harness. Cells are PROTECTED / BLOCKED / NEUTRAL
session-observation counts; the per-type detail with turn numbers and image ids is in the sibling
`findings-*.md` files. "—" = the rule never fired and nothing was at stake.

Outcome base rates: 14 committed (2 of those operator-rejected on review), 11 agent abandons,
4 harness deaths, ~140 failed `propose_program` calls total (median first-session syntax fight: 12–23 retries).
The wrecked-layout gate fired **zero** times in 33 sessions.

## Matrix (P/B/N per type, then totals)

| rule / mechanism | flowchart | swimlane | nested-arch | state-machine | org-tree | **Σ P/B/N** |
|---|---|---|---|---|---|---|
| R1 16px grid | 0/0/6 | 0/1/0 | 0/1/0 | 0/0/1 | 0/0/1 | **0/2/8** |
| R2 spacing ladder | 1/1/4 | 1/1/1 | 0/0/3 | 0/1/3 | 1/3/1 | **3/6/12** |
| R3 section trim | 0/0/6 | 0/1/0 | 1/0/0 | 0/0/1 | — | **1/1/7** |
| R4 grid | 0/0/6 | 0/0/1 | 0/0/2 | 1/0/0 | 0/1/0 | **1/1/9** |
| R5 align | 2/0/4 | 2/0/1 | — | 0/0/1 | 2/0/0 | **6/0/6** |
| R6 fan | 0/0/6 | — | —¹ | 0/0/1 | 3/2/0 | **3/2/7** |
| R7 hug | 0/0/6 | — | 1/0/0 | 0/0/1 | — | **1/0/7** |
| R8 size semantics | 1/1/4 | 1/2/0 | 2/0/1 | 0/2/0 | — | **4/5/5** |
| R9 feedback edges | 2/0/4 | 0/2/1 | 0/0/1 | 1/2/0 | 0/0/1 | **3/4/7** |
| R10 language-refusal | 0/3/3 | 0/2/0 | 0/2/0 | 0/2/0 | 0/1/0 | **0/10/3** |
| MECH: size normalization | 0/3/3 | 0/0/1 | 0/1/0 | 0/1/0 | 0/2/0 | **0/7/4** |
| MECH: wrecked-layout gate | 1/0/5 | — | 0/0/1² | 0/0/2² | — | **1/0/8** |
| MECH: lint thresholds | 0/0/6 | 1/0/2 | 1/0/0 | 0/0/2 | 0/0/2 | **2/0/12** |
| MECH: DSL expressiveness | 0/6/0 | 0/1/3 | 0/4/1 | 0/4/1 | 0/6/0 | **0/21/5** |
| MECH: single-render habit | 1/0/3 | 0/0/3 | 0/0/3 | 0/1/1 | 0/2/1 | **1/3/11** |
| MECH: solver collapse / nested-section | 0/1/5 | 0/0/1 | 0/2/0 | 0/0/1 | — | **0/3/7** |

¹ R6 never engaged on nested-arch despite a 5-edge hub — the detector only recognizes hub-*over*-children,
not the hub-*beside*-children shape of every left-to-right architecture diagram (findings-nested-arch, tally).
² Counted NEUTRAL because it never fired — including twice when it should have (see below).

## Strongest evidence per contested cell

**BLOCKED (the case against, ranked by total):**

1. **MECH: DSL expressiveness — 21 B, the runaway top blocker.** Three distinct components:
   - *Grammar-guessing tax:* first build sessions burned 11 (org-tree S1), 12 (swimlane S1), 21 (nested-arch S1),
     23 (flowchart S1) consecutive parse rejections before a first valid program — the `|`-weight form is only
     discoverable from fit_scope echoes of structures that already exist (findings-nested-arch S1, turns 1–21).
   - *Missing channels:* no arrow labels (state-machine S1b tried 4 syntaxes, turns 7–10, then shipped nine floating
     label rectangles; S2c then **deleted 5 connections and routed transitions through the label boxes** to fake it),
     no connector style/color (state-machine S5, swimlane S4 — the canvas schema itself supports `style: "dashed"` and
     colors), no display-label distinct from id (nested-arch S2's "notifications-service" mid-word wrap; unfixable
     in-language per S5's abandon "prohibited from editing object text"), no port/side syntax and no connector-only
     op (org-tree S5), no "keep everything else in place" (flowchart S6: a 3-pill size fix moved all 13 objects).
   - *Hazards:* omission-means-deletion near-miss (swimlane S6 Draft 1 silently dropped four Frontend stages —
     caught only by inspect); `type=text` crashes the expander with a raw JS error (state-machine S1b turn 16).
2. **R10 language-refusal — 10 B, 0 P.** All five 20px-nudge probes ended in agent self-abandons after inventing
   syntax the language doesn't have: `nudge 2 dx=16 dy=24` (flowchart S4 t3), `offset=(-20,-10)`…`translate=`
   (nested-arch S4 t1–8), `at=(64,685)` raw coordinates for 17 objects (org-tree S4 t2), `nudge=(-32,24)`
   (state-machine S4 t2), `h=308` (swimlane S5 t2). The sharpest single line of the eval: state-machine S4
   abandoned a 20px fix **for an overlap the system itself had created in S3** — "The layout program cannot express
   local pixel nudges … changing their structural anchors would also re-solve other objects."
3. **MECH: size normalization — 7 B, 0 P.** The fit→expand round trip is not idempotent, so *every* edit session
   pays: percentile reclassification shrank committed 160×112 decision diamonds to 115×81 below their text
   (flowchart S2/S3 deltas), silently demoted an L Event-Bus hub to M on an edit that never mentioned it
   (nested-arch S2 t0 echo), inflated 259×173 label chips to full state-box size erasing a fought-for distinction
   (state-machine S3), and resized 144×72→200×100 under an explicit "change nothing else" (org-tree S4 t7, S5).
4. **R2 spacing ladder — 6 B vs 3 P.** Blocks are all of one shape: a legitimate density/pitch value between rungs
   (`gap=16` for edge-hugging labels, state-machine S2c t3; `gap=168` for cluster equalization, org-tree S4 t3;
   "rows N px apart", flowchart S3). Twice the solver's *own output* failed its own ladder (117px, swimlane S3;
   115px, org-tree S3) — the ladder is enforced against the agent but not against the solver.
5. **R9 feedback edges — 4 B vs 3 P, sharply type-split.** Swimlane: sections are impenetrable to the router, so
   skip-lane handoffs — a core swimlane idiom — become perimeter mega-detours around a 2640px lane (S1/S3 images
   …69.1/…33.1, the dominant defect of all three committed renders). State-machine: a back-edge rendered exactly
   on top of its forward edge (reads as bidirectional) and a self-loop drawn straight through its own box
   (S1b SVG paths) — the genre's defining features are what the router handles worst.
6. **R6 fan — 2 B (org-tree).** Uniform hub pitch with unequal subtree widths mathematically forces unequal
   cluster gaps (168/272/376px); equalizing them — the most natural org-chart polish — died at three walls
   (R10, R2, size normalization) across two honest abandons (org-tree S4/S7).
7. **MECH: solver collapse / nested-section — 3 B.** Weighted splits stretch child sections to band height
   (nested-arch S1's 592×1616 "empty towers"); under re-solve pressure a child section escaped its parent VPC by
   132px across all 7 drafts and was committed that way (nested-arch S6, image ….81.1); frame-filling solves make
   "tighten" unexpressible (flowchart S3 came back *looser*).

**PROTECTED (the case for, ranked):**

1. **R5 align — 6 P, 0 B. The only undefeated rule.** fit_scope-emitted `align y` registers survived every
   re-solve, keeping rows flat across subtrees and section boundaries (flowchart S2 t0; org-tree S2's
   `align y: 2 8 12 15` holding 4 VPs + 12 leaves; swimlane S6's requested under-alignment solved cleanly).
2. **R6 fan — 3 P (org-tree).** Every committed tree had each hub centered exactly over its children's midpoint
   and all leaves on one register — "the hard part of a tree, for free" (org-tree S1/S2/S7).
3. **R3 section trim + R7 hug — the nested-arch rescue.** Hug+trim converted the wrecked first build
   (1616px-tall empty towers) into the eval's best committed state (Edge 592×1616 → 320×544 with header band,
   nested-arch S3 image ….61.1), single-handedly.
4. **R2 spacing ladder — first-solve rhythm.** Blind first solves came out evenly pitched with zero crowding
   (flowchart S1: 14 objects placed blind, publishable structure; swimlane S1: immaculate lane rhythm).
5. **R9 feedback edges — multi-hop detours.** Loops route around content without crossing boxes when the path is
   multi-hop (flowchart S1/S6; state-machine S3's Suspended/cycle edges).
6. **MECH: lint thresholds — 2 P.** Swimlane S1's overflow lint drove a genuinely better staggered redesign.
   But 12 N: "Lint: clean" on slug-label tangles and 900px sweeps (flowchart S2), flags a 1px overflow while
   missing chip-on-box overlaps (state-machine S3), cried wolf measuring overflow against the scope bbox
   (org-tree S1 — which *trained the agent to ignore overflow lint* before the overflow was real), and cannot
   distinguish sanctioned board growth from error (swimlane S3).
7. **R4 grid — 1 P / 1 B.** Lattices are the tidiest geometry where repetition is real (state-machine S1b),
   and destructive where it isn't (org-tree S3: `grid 2x2` scrambled sibling order and split the leaf baseline —
   row-major flatten discards exactly what an org chart needs).
8. **R8 size semantics — 4 P / 5 B, genuinely split.** As a *vocabulary* it protected: `size=L` expressed terminal
   and hub emphasis in one token (swimlane S6, nested-arch S6, flowchart S6). As a *closed 3-class system* it
   blocked: no XS (state-machine S2c, swimlane S2), unsizable sections, and it is the vocabulary through which
   size normalization does its damage.

**Safety net that never caught anything:**

- **MECH: wrecked-layout gate — 0 fires in 33 sessions.** Its one P is indirect (flowchart S4: overflow warnings
  informed the agent's own refusal). It stayed silent when a child section was committed 132px outside its parent
  (nested-arch S6 — the exact geometry class the gate's containment check exists for) and when a commit overflowed
  a locked page-frame by ~460px (state-machine S1b). As tuned, it is neither protecting nor blocking.
- **MECH: single-render habit — the clearest process finding.** 1 P / 3 B / 11 N undersells it; read as process
  evidence across all types: every session that rendered ≥2× with an adjustment between produced the best or the
  only-accepted result of its type (flowchart S6, org-tree S2, nested-arch S3, state-machine S2c, swimlane S6);
  single-render sessions repeatedly committed defects *visible in the render they looked at* (flowchart S2/S3,
  swimlane S1 — "giant paths" acknowledged in thinking, committed anyway; state-machine S1b — "Planning label box
  size reduction", committed anyway; org-tree S7 — clipped node visible, committed). Swimlane S2 abandoned three
  solved drafts *sight-unseen*.

## Cross-cutting observations

- **The aesthetic rules are not the problem; the language around them is.** Corpus rules score net-positive or
  neutral everywhere except where a closed vocabulary refuses a legitimate value (R2 rungs, R8 classes). The
  three top blockers (DSL expressiveness, R10, size normalization) are all language/mechanism, not aesthetics.
- **Refusals were honest; commits were not.** 11 of 11 agent abandons had accurate self-diagnoses. Meanwhile
  every operator-rejected or low-scoring commit shipped a defect the agent had already seen or been told about.
  The system fails safe on "can't" and fails silent on "shouldn't".
- **Detection exists where enforcement doesn't, and vice versa.** Lint detects overflow it can't enforce
  (nested-arch S6 commit over 3 flags); the gate could enforce but doesn't detect (never fired); nothing at all
  detects overlaps or label truncation, the two most common visible defects.
- **Harness reliability cost 4 of 33 sessions:** one kernel container collision serving another session's
  transcript (state-machine S1a), two upstream-websocket deaths (state-machine S2b, org-tree S6), and the :3999
  studio proxy died mid-eval (both agents finished via :4820 direct). Separately, `POST …/accept` returns patch
  ops but does not persist them server-side — every eval agent had to apply ops via PUT itself.
