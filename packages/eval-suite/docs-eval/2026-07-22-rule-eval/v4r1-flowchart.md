# v4 round 1 — branching flowchart

Canvas: eval-v4-flowchart · Sessions run: 3 (S1 build, S2 readability probe, S3 structural edit
with one in-session follow-up) · Date: 2026-07-22 · Harness: :4820 v4 (board/apply_ops/
apply_quickfix/render_draft, high thinking) · Baselines for delta: `findings-flowchart.md`
(pre-v3), `v3-trial-flowchart.md`.

Reference anchoring done first: gc-decomp-harness (bar ≈7–8) and intent-classification-2 (≈7)
rendered at 2800px and studied before any session. What the references do: every label chip
owns open air (chips never touch a line), corridors double as annotation lanes, section tints
carry the grouping, flows are color-coded by meaning, margin stickies sit adjacent to the flow
they annotate, and density varies deliberately (gc-decomp's packed score-gate column vs its
airy center). All scores below are side-by-side judgments against those two renders.

## Sessions

### S1 — build: full order-processing flow (2 decisions, retry loop, dashed-red failure, Yes/No labels, semantic colors, margin sticky, reference finish)
- session/container: 8c4d6a65-650b-40ac-b84e-5c4d21fdb1ba / 205950bb-ff5f-5824-be6d-7f121963f32b
- outcome: committed → accepted → materialized (PUT via :4000 OK); 0 tool errors, 0 retries
- tool sequence (16 turns): board → apply_ops(3: sections) → render → apply_ops(4) →
  apply_ops(14: nodes) → apply_ops(14: edges+fixes) → render → apply_ops(5) → render →
  apply_ops(4) → apply_ops(1) → render → apply_ops(2) → render(crop payment) → render(full) →
  commit. **5 full/crop renders**, batch placement, diagnostics read every turn.
- op mix (accepted): addObject 13, addConnection 11, updateObject 1 (25 ops)
- diagnostics story: 11 warnings across the build, ALL heeded by manual ops (apply_quickfix
  never invoked), DIAGNOSTICS · clean at commit. Highlights: **the new labeled-edge breathing
  check fired twice** (t5: "labeled edge retry-payment↔order-failed: 96px gap is too tight for
  its 'Retries exhausted' chip (give it ≥192px)"; same for "Shipped" ≥112px) and the agent
  widened both corridors next turn; color-contrast caught blue-on-blue nodes in the blue
  section (t3) → recolored white; grid caught x=1512 off-lattice (t4) → snapped; section-trim/
  density drove section hugging. No overrides, so no override notes to quote.
- every requested channel present: yellow decisions, Yes/No on all four decision exits, dashed
  red "Retries exhausted" → red Order failed pill, green completion, three tinted sections
  (blue/violet/teal), retry-policy sticky.
- aesthetic (anchored): **6** — side-by-side with gc-decomp: the reference never lets a chip
  touch a line and its margin annotations hug the flow, while my S1 leaves the "No" chip
  sitting ON the Corrected-loop elbow (occluded; image ...6275-734b....65.1), parks the sticky
  in the far bottom-left away from the payment flow it annotates, and leaves a dead lower half
  in the validation section.
- misses: (a) instruction asked for "actual decision-diamond shapes" — `type: "decision"` was
  used but BOTH the draft renderer and the :4000 preview render it as a rounded rectangle;
  the diamond does not exist in the current glyph set, so the ask is unsatisfiable; (b) commit
  summary claimed "no known flaws remain" while the No-chip occlusion was visible in the
  render it had just looked at — but diagnostics gave it no machine signal (see label-clearance
  verdict).
- delta vs v3 S1 (aesthetic 4): tints, labeled+colored flows and section grouping now arrive
  unprompted at reference-furniture level; 2 renders → 5 renders with diagnostics-driven
  revision between each. Delta vs old S1 (23 syntax retries, all channels dropped): different
  sport.

### S2 — readability iteration probe: "give every labeled edge room to breathe, widen the corridors, rebalance — polish to reference quality"
- session/container: 9932de37-1f50-4b9d-a11f-e9753cabfca1 / 15c96d5f-1e2f-5f5b-83af-e81378055523
- outcome: committed → accepted → materialized; 0 tool errors
- tool sequence (13 turns): board → render → apply_ops(14) → render → apply_ops(14) → render →
  apply_ops(2) → render(crop) → apply_ops(3) → render(crop) → apply_ops(3) → render(full 3600px)
  → commit. 6 renders.
- op mix (accepted): updateObject 14 — pure geometry/balance, zero topology/style churn, exactly
  as instructed.
- did it actually spread things out? **Yes, measurably**: spine corridors widened (labeled gaps
  moved up the ladder), the main flow was re-aligned on one shared register, the fulfillment
  section was hugged to content (section-trim W + density W fired at t2 and were fixed), and
  the sticky was moved up next to the flow. The labeled-edge warning itself did NOT fire in S2
  — S1 had already cleared every chip past its floor — so the spreading was instruction-driven,
  not diagnostic-driven. The check's floor (max(96, chip+32)) is below the house bar; the agent
  had to out-do the rule to chase the reference.
- aesthetic (anchored): **6.5** — the corridors and hugged sections now genuinely approach the
  reference's air, but the board still reads as one uniform density band (no deliberate
  dense/sparse contrast like gc-decomp's score-gate column), and the No-chip-on-elbow blemish
  SURVIVED a pass explicitly aimed at label breathing — the agent (and the rules) treat "room
  to breathe" as gap width, not chip-vs-line contact.

### S3 — structural: fraud-review branch off the payment decision, rejoining before fulfillment; don't compress existing spacing
- session/container: c1ab61fd-3f03-43e1-8161-75c3f69f0bba / 00cf4300-6b90-5210-9eed-78c39eb00e1a
- outcome: committed; one operator follow-up message ("the orange No edge passes through the
  Check chip — reroute, change nothing else") → second commit → accepted → materialized.
  21 turns total, 7 renders, 0 tool errors.
- op mix (accepted): addObject 2 (Fraud review, Fraud suspected?), addConnection 4 (Risky /
  Assess / Yes-red / No-green rejoin), updateObject 8.
- topology correct: Payment authorized? gains a violet "Risky" exit → Fraud review → "Assess" →
  Fraud suspected? (yellow decision); Yes → red edge into the existing Order failed; No → green
  edge rejoining into Pack & ship. All eleven pre-existing labels/colors/dashes and the sticky
  survived verbatim; existing spacing was NOT compressed — the payment section was widened
  instead (updateObject on sections), exactly honoring the instruction.
- diagnostics story: labeled-edge check fired again (t5: "'Assess' chip ... give it ≥104px") and
  was heeded next turn; spacing ladder fired 4× (all heeded); section-trim right-padding fired
  once (heeded). Clean at both commits. No overrides.
- first-commit defect: the orange No edge ran STRAIGHT THROUGH the "Check" label chip
  (strike-through; crop evidence image ...dadd-75a9....65.1 at ~(1000,198)) — diagnostics
  clean. The plain-language follow-up produced a 1-op surgical fix (raise authorize-payment)
  and an honest summary ("Raised Authorize payment slightly so its Check label sits clear of
  the orange No route; changed nothing else"). Cost of the fix: authorize-payment now sits
  ~48px above the main-flow register — a visible spine kink no rule flags (registers only
  detects near-misses ≤8px, not deliberate breaks).
- aesthetic (anchored): **6.5** — a denser board holding its readability; side-by-side delta:
  the reference keeps every chip in open air even at 3× this edge count, while mine needed an
  operator message to clear one chip and paid for it with a bumped register on the spine.

## Rule-efficacy table

Fires counted across all three transcripts (every DIAGNOSTICS block, 22 findings total).
apply_quickfix was available on 10+ findings and used ZERO times — the agent always fixed
manually via apply_ops (the ops path is cheap enough that quickfix may be redundant).

| rule | fired | heeded / quickfixed / overridden | correct? | verdict |
|---|---|---|---|---|
| spacing (ladder) | 9 | 9 heeded (manual ops), 0 quickfix, 0 overridden | all real off-ladder gaps; no false positives | **WORKING** |
| spacing — labeled-edge breathing (new) | 3 (S1×2 "Retries exhausted" ≥192 / "Shipped" ≥112; S3 "Assess" ≥104) | 3 heeded next turn | every fire real and actionable; directly produced the widened failure/shipping corridors | **WORKING** — but the floor max(96, chip+32) is below the house bar; the reference's corridors are ~2× it. Consider floor 128 so short chips ("Yes"/"No") can't legally sit in 96px slots |
| grid | 2 (S1 x=1512) | 2 heeded (snapped) | correct, no sub-pixel noise | **WORKING** |
| section-trim | 4 | 4 heeded (hug/padding fixes) | all real slack; drove S2's fulfillment hug | **WORKING** |
| registers | 0 | — | no near-miss cases existed (correct silence), but it is blind to the S3 repair that broke the spine: authorize-payment left 48px off the register shared by 5+ flow nodes, committed clean | **BLIND** to deliberate register breaks — add a "spine register" variant: ≥4 nodes on a shared axis, flag an outlier >16px off |
| hub-balance | 0 | — | no ≥3-same-side hub ever formed; silence correct | NEUTRAL (untested this genre round) |
| rhythm | 0 | — | no 3+ uneven sibling run; silence correct | NEUTRAL (untested) |
| density | 2 (S1 validation 80% empty bottom; S2 fulfillment 50% top) | 2 heeded | both real | **WORKING** per-section; note it never looks at the page-frame: the committed board's bottom ~40% is an empty band and nothing fires |
| label-clearance | **0** | — | **two visible chip occlusions it should own**: S1 "No" chip ON the Corrected-loop elbow (committed, still on the board), S3 "Check" chip struck through by the No edge (fixed only by operator message) | **BLIND** — it intersects estimated chip rects with node rects/other chips only, never with routed edge polylines, and estimates chip anchors at segment midpoints while the renderer parks chips at elbows |
| overlap | 0 | — | no node overlaps existed; silence correct | NEUTRAL-correct |
| containment | 0 (error tier) | — | nothing escaped a section or the frame; the commit gate never engaged all day | WORKING-idle |
| edge-clarity | 0 | — | no through-box, degenerate, or >6-crossing case; v3's anti-parallel-shared-face defect did not recur. The chip-vs-edge occlusion falls in the seam between edge-clarity and label-clearance and neither owns it | NEUTRAL — assign the chip-vs-edge check to one of them explicitly |
| color-contrast | 2 (S1 blue-on-blue nodes in blue section) | 2 heeded (recolored white) | correct; stayed silent on the deliberate yellow decisions | **WORKING** |

Gate: zero error-tier findings in any session; commit gate never blocked. Overrides: none —
every warning was resolved to clean before every commit, so there are no verbatim override
notes to quote this round.

## Delta vs v3 / old baselines

- v3's three new defects: **none reproduced.** (1) accept-consolidation patch-key drop — gone:
  `type: "decision"`, colors, dashes and sticky all materialized identically to the approved
  draft (committed preview verified against the final render each session); (2) zero-length
  invisible edges — not observed; (3) solver off-lattice drift — moot: propose_program /
  solve_layout (demoted) were never called in 50 turns.
- Build aesthetic 4 → 6; every session 0 tool errors, 0 retries; single-render habit fully
  dead (5–7 renders per session, crops for close-up verification).
- The v3 flowchart caveat "keep the solver away from long decision labels" is obsolete — the
  agent simply doesn't use the solver.

## Top 3 changes for Round 2

1. **Make label-clearance intersect chip rects with the routed edge polylines** (the router's
   geometry exists at diagnostic time), using the renderer's real chip anchors (elbow points,
   not naive segment midpoints). Grounded: S1 committed a board with the "No" chip occluded by
   the Corrected elbow under DIAGNOSTICS · clean, and S3's "Check" strike-through survived to
   a commit and needed an operator message — the only two visible defects of the round were
   the same blind spot, and it is exactly Ford's "can't actually read it" class.
2. **Give `type: "decision"` a real diamond glyph** (or rename the concept in guidance) — both
   renderers draw it as a rounded rectangle, so "decision-diamond" instructions are currently
   unsatisfiable; the agent did everything right (semantic type, yellow tint) and the genre's
   signature shape still cannot appear. Grounded: S1 instruction asked for actual diamonds;
   crop of Order valid? shows a rounded rect.
3. **Add the spine-register outlier check** (≥4 flow nodes sharing a center axis → flag any
   member >16px off) and raise the labeled-edge floor toward the house bar (96 → 128).
   Grounded: the S3 chip fix silently bought a 48px kink in an otherwise ruler-straight spine,
   and S2 showed the agent must out-perform the current labeled-edge floor to reach reference
   corridor widths — the rules should be pulling toward the bar, not trailing it.

Honorable mention (prompt loop, not a rule): the readability pass never varied density or used
the margin as an annotation lane the way both references do; one guidance line — "density
variation is deliberate; stickies sit adjacent to the flow they annotate" — would likely have
moved S2 from 6.5 toward 7.
