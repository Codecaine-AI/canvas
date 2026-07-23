# S1 — Linear flow: release pipeline

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s1-linear-flow`
- canvas: `eval-suite-s1-linear-flow` (created fresh every run; delete any existing first)
- genre: linear flow
- complexity: 1
- board: 2400×1600 locked `page-frame`
- session budget: 1 build session + 2 edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> Set me up a release-pipeline board, reference quality — this is going in the onboarding
> docs, so it has to read at arm's length. Six stages on one clean directed line, in this
> order: Commit, CI Build, Unit Tests, Staging Deploy, Smoke Tests, Production. Every arrow
> gets a label: Commit to CI Build is "push", CI Build to Unit Tests is "artifact ready",
> Unit Tests to Staging Deploy is "all green", Staging Deploy to Smoke Tests is "deployed",
> Smoke Tests to Production is "verified". Keep the stages neutral gray except Production —
> that's the terminal, make it green so the destination pops. No sections, no lanes — one
> line, generous even spacing, and every label chip owns clear air; don't let a chip sit on
> a line or an elbow. Add one margin sticky next to the flow with the pipeline promise:
> "every commit that survives the gates ships itself — no manual promotion."

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | Commit | process pill | gray/neutral | flow start |
| n2 | CI Build | process pill | gray/neutral | |
| n3 | Unit Tests | process pill | gray/neutral | |
| n4 | Staging Deploy | process pill | gray/neutral | |
| n5 | Smoke Tests | process pill | gray/neutral | |
| n6 | Production | terminal pill | green | the one distinct-color node |
| n7 | Security Scan | process pill | gray/neutral | exists only after E1 |

<!-- ref is a stable handle for this file (n1, n2…) — the agent chooses its own ids. -->

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | push | solid | gray/neutral | |
| e2 | n2 → n3 | artifact ready | solid | gray/neutral | |
| e3 | n3 → n4 | all green | solid | gray/neutral | build only — deleted by E1 |
| e4 | n4 → n5 | deployed | solid | gray/neutral | |
| e5 | n5 → n6 | verified | solid | gray/neutral | |
| e6 | n3 → n7 | all green | solid | gray/neutral | added by E1 (inherits e3's label) |
| e7 | n7 → n4 | no criticals | solid | gray/neutral | added by E1 |
| e8 | n5 → n1 | regression found | dashed | red | added by E2; feedback edge, routed around the line |

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| — | (none — the instruction explicitly says no sections, no lanes) | | | |

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | margin sticky | pipeline promise: every commit that survives the gates ships itself — no manual promotion | in the margin, adjacent to the flow (not stranded in a far corner) |

## Comprehension key

<!-- Keyed to the FINAL board state (after E1 and E2) — the IC blind judge sees only the
final PNG. CORE ×2, SECONDARY ×1. -->

CORE:
- [C1] The board depicts a software release/deployment pipeline.
- [C2] The flow starts at Commit.
- [C3] Commit flows to CI Build.
- [C4] CI Build flows to Unit Tests.
- [C5] Unit Tests flows to Security Scan.
- [C6] Security Scan flows to Staging Deploy.
- [C7] Staging Deploy flows to Smoke Tests.
- [C8] Smoke Tests flows to Production.
- [C9] Production is the end of the pipeline and is visually distinct from the other stages (green).
- [C10] A feedback edge returns from Smoke Tests back to Commit (a regression loop).

SECONDARY:
- [S1] The Commit → CI Build edge is labeled "push".
- [S2] The CI Build → Unit Tests edge is labeled "artifact ready".
- [S3] The Unit Tests → Security Scan edge is labeled "all green".
- [S4] The Security Scan → Staging Deploy edge is labeled "no criticals".
- [S5] The Staging Deploy → Smoke Tests edge is labeled "deployed"; Smoke Tests → Production is labeled "verified".
- [S6] The feedback edge is dashed and red and labeled "regression found".
- [S7] The main pipeline is a single line with no branches — the feedback edge is the only departure.
- [S8] A margin note conveys that promotion is automatic — anything that passes the gates ships without manual action.

## Intent-fidelity checklist

<!-- Checked against final canvas JSON + final PNG. Node/edge refs per the tables above.
Items marked (E1)/(E2) are appended by those edits — the running checklist at each stage
contains only the items that exist at that stage (e.g. IF-09 applies at build, is replaced
by E1-02/E1-03 after E1). -->

- [ ] IF-01 node n1 exists, label "Commit", gray/neutral
- [ ] IF-02 node n2 exists, label "CI Build", gray/neutral
- [ ] IF-03 node n3 exists, label "Unit Tests", gray/neutral
- [ ] IF-04 node n4 exists, label "Staging Deploy", gray/neutral
- [ ] IF-05 node n5 exists, label "Smoke Tests", gray/neutral
- [ ] IF-06 node n6 exists, label "Production", green — the only non-neutral node at build
- [ ] IF-07 edge e1 n1→n2, labeled "push", solid, label legible and visually associated with its edge
- [ ] IF-08 edge e2 n2→n3, labeled "artifact ready", solid
- [ ] IF-09 edge e3 n3→n4, labeled "all green", solid (build stage only; superseded by E1)
- [ ] IF-10 edge e4 n4→n5, labeled "deployed", solid
- [ ] IF-11 edge e5 n5→n6, labeled "verified", solid
- [ ] IF-12 sticky a1 present in the margin adjacent to the flow, gist = automatic promotion promise
- [ ] IF-13 no sections or lanes exist on the board
- [ ] IF-14 the six nodes read as one directed line in the specced order (single axis, no branches)
- [ ] IF-15 no edge label chip sits on a line or elbow (PNG check — instruction asked for clear air explicitly)
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (nodes/sections/edges beyond spec + declared substitutions)

## Follow-up edits

<!-- 2 edits, each its own agent session, run in order, each accepted before the next. -->

### E1 — insert Security Scan mid-flow

Instruction (verbatim):

> Insert a Security Scan stage between Unit Tests and Staging Deploy. Rewire it properly:
> Unit Tests now flows into Security Scan — keep the "all green" label on that arrow — and
> Security Scan flows into Staging Deploy labeled "no criticals". The scan stage stays
> neutral gray like the rest. Do not touch Commit, CI Build, or Unit Tests at all; if the
> downstream stages need to slide to make room, slide them along the line only — same
> order, same register, labels and colors untouched — and say so in your summary.

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 node n7 exists, label "Security Scan", gray/neutral, positioned on the line between n3 and n4
- [ ] E1-02 edge e6 n3→n7 exists, labeled "all green", solid
- [ ] E1-03 edge e7 n7→n4 exists, labeled "no criticals", solid
- [ ] E1-04 the old direct edge e3 (n3→n4) is gone — no duplicate/leftover edge bypassing the scan
- [ ] E1-05 the pipeline still reads as one directed line (now seven stages) in order

Stability invariants (ES):
- [inv] n1, n2, n3 positions byte-identical (0px movement) — the untouched prefix
- [inv] e1, e2 unchanged: endpoints, labels, style, color
- [inv] n4, n5, n6 keep their relative order and shared register; any make-room shift is along the flow axis only and is declared in the commit summary
- [inv] e4, e5 labels, styles, colors, and endpoints unchanged
- [inv] a1 sticky unmoved, text unchanged
- [inv] no node or edge anywhere is restyled, recolored, or relabeled
- in-scope objects: n7 (new), e6/e7 (new), e3 (removed), n4–n6 (declared along-axis make-room slide only)

### E2 — failure-semantics restyle: the regression loop

Instruction (verbatim):

> One more thing — add the failure semantics. A single dashed red feedback edge from Smoke
> Tests back to Commit, labeled "regression found", routed cleanly around the pipeline, not
> through it, and not on top of the forward arrows. Nothing else moves, nothing else
> restyles.

Fidelity checks (append to the running IF checklist):
- [ ] E2-01 edge e8 exists, direction n5→n1 (Smoke Tests back to Commit)
- [ ] E2-02 e8 is dashed
- [ ] E2-03 e8 is red
- [ ] E2-04 e8 labeled "regression found", chip legible and clear of other content
- [ ] E2-05 e8 routes around the pipeline — it does not pass through any node or over any forward edge's label chip, and does not overlap a forward edge so as to read bidirectional

Stability invariants (ES):
- [inv] every object (7 nodes + a1) at its byte-identical pre-edit position — this edit is purely additive
- [inv] all existing edges (e1, e2, e4, e5, e6, e7) unchanged: endpoints, routes, labels, styles, colors
- [inv] no restyling or relabeling of any existing content
- in-scope objects: e8 (new) only

## Grading notes

- Genre calibration: linear flow is the easiest genre in the suite — judges must resist
  grading on mere correctness. Anchor hard against the references: at complexity 1 the whole
  score is composition — corridor widths, chip air, sticky adjacency, frame use. A correct
  but cramped line is the round-1 "too close together if you're actually trying to read it"
  class, not a 7.
- Known trap — chip-on-elbow: v4 round 1 committed boards with a label chip sitting ON a
  routing elbow under clean diagnostics (v4r1-flowchart S1 "No" chip). The build instruction
  here asks for chip clearance explicitly, so IF-15 is fair game; SQ judges it under
  machinery/legibility too — that is two axes seeing one defect through different lenses,
  not double-penalization.
- Known trap — E2 feedback routing: the round-1 corpus produced (a) back-edges drawn exactly
  on top of the forward path, reading as bidirectional (old state-machine S1b — an IC
  corruption, hard-caps IC at 6 if a blind reader reports Commit→Smoke Tests), and (b)
  perimeter mega-detours (v3 class, SQ 4 territory). E2-05 owns the first; SQ sub-check 7
  owns the second.
- E1 suffix slide: a declared along-axis shift of n4–n6 is an accommodation, not a
  violation — do not ding ES for it. An undeclared shift, an off-register drift, or any
  motion of the n1–n3 prefix is a violation.
- Junction machinery: if the agent fabricates waypoint/junction objects to route e8, the
  crosshair-glyph leakage is SQ business (sub-check 5); the objects themselves count against
  IF-NEG-2 unless declared as routing substitutions in the commit summary.
- Sticky placement: "in the margin, adjacent to the flow" — the round-1 miss was parking it
  in a far corner away from what it annotates. Adjacency is an SQ concern (references keep
  annotations next to their flows); IF-12 only requires presence + margin placement + gist.
