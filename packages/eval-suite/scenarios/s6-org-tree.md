# S6 — Org tree (three-level org chart)

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s6-org-tree`
- canvas: `eval-suite-s6-org-tree` (created fresh every run; delete any existing first)
- genre: org tree
- complexity: 3
- board: 2400×1600 locked `page-frame`
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> Build our org chart, three levels, and make it read like a poster. Top: CEO, teal,
> centered. Second level, four VPs reporting to the CEO: VP Engineering, VP Product, VP
> Design, VP Operations — teal like the CEO. Third level, nine teams, gray boxes: under
> VP Engineering — Platform, Frontend, Infrastructure, Security; under VP Product —
> Growth, Insights; under VP Design — Design Systems; under VP Operations — IT,
> Facilities. Yes, the subtrees are deliberately unequal — do not pad them to fake
> symmetry. Wrap each VP's subtree (the VP plus its teams) in a light tinted panel titled
> with the org name: Engineering (teal wash), Product (violet wash), Design (orange
> wash), Operations (green wash) — the panels do the grouping, so the edges can stay
> clean. Reporting lines are solid neutral gray, and wire them like a real org chart:
> every reporting edge exits its parent from the bottom and enters its child from the top
> — no side entries, ever. One exception edge: Design Systems has a dotted-line report to
> VP Engineering — draw that one dashed, orange, labeled "dotted line", visibly different
> from the solid reports. Discipline: all nine team boxes sit on one shared baseline
> across all four panels, and each VP sits centered over its own children's midpoint,
> with the CEO centered over the VP row. One margin sticky on how to read it: solid =
> direct report, orange dashed = dotted-line report, panels group each VP's org. Give the
> levels air — this should read at arm's length.

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | CEO | box | teal | level 1, above all panels, centered over the VP row |
| n2 | VP Engineering | box | teal | level 2, in panel sec1 |
| n3 | VP Product | box | teal | level 2, in panel sec2 |
| n4 | VP Design | box | teal | level 2, in panel sec3 |
| n5 | VP Operations | box | teal | level 2, in panel sec4 |
| n6 | Platform | box | gray | leaf, sec1 |
| n7 | Frontend | box | gray | leaf, sec1 |
| n8 | Infrastructure | box | gray | leaf, sec1 |
| n9 | Security | box | gray | leaf, sec1 |
| n10 | Growth | box | gray | leaf, sec2 at build; moves to sec1 in E1 |
| n11 | Insights | box | gray | leaf, sec2 |
| n12 | Design Systems | box | gray | leaf, sec3; source of the dotted line |
| n13 | IT | box | gray | leaf, sec4 |
| n14 | Facilities | box | gray | leaf, sec4 |

14 nodes at build. All nine leaves share one baseline register (same top y across panels).

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | — | solid | neutral | CEO fan; bottom-exit / top-entry |
| e2 | n1 → n3 | — | solid | neutral | CEO fan |
| e3 | n1 → n4 | — | solid | neutral | CEO fan |
| e4 | n1 → n5 | — | solid | neutral | CEO fan |
| e5 | n2 → n6 | — | solid | neutral | Eng fan |
| e6 | n2 → n7 | — | solid | neutral | Eng fan |
| e7 | n2 → n8 | — | solid | neutral | Eng fan |
| e8 | n2 → n9 | — | solid | neutral | Eng fan |
| e9 | n3 → n10 | — | solid | neutral | Product fan; rewired to n2→n10 in E1 |
| e10 | n3 → n11 | — | solid | neutral | Product fan |
| e11 | n4 → n12 | — | solid | neutral | Design fan (single child) |
| e12 | n5 → n13 | — | solid | neutral | Ops fan |
| e13 | n5 → n14 | — | solid | neutral | Ops fan |
| e14 | n12 → n2 | dotted line | dashed | orange | THE cross-subtree dotted-line report; survives all edits |

14 edges at build. e14 is the only labeled, only dashed, only non-neutral edge.

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| sec1 | Engineering | teal (wash) | n2 n6 n7 n8 n9 | flat panel; +n10 after E1 |
| sec2 | Product | violet (wash) | n3 n10 n11 | flat panel; loses n10 in E1 |
| sec3 | Design | orange (wash) | n4 n12 | flat panel; +n15 after E2 |
| sec4 | Operations | green (wash) | n5 n13 n14 | flat panel |

Four sibling panels in a row, no nesting. n1 (CEO) belongs to no panel.

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | margin sticky | how to read the chart: solid = direct report, orange dashed = dotted-line report, panels group each VP's org | board margin, outside the panels |

## Comprehension key

CORE:
- [C1] The CEO sits at the top; four VPs report to the CEO.
- [C2] The four VPs are Engineering, Product, Design, and Operations.
- [C3] VP Engineering's teams are Platform, Frontend, Infrastructure, Security.
- [C4] VP Product's teams are Growth and Insights.
- [C5] VP Design's team is Design Systems (a single child).
- [C6] VP Operations' teams are IT and Facilities.
- [C7] Every team hangs off exactly one VP by a solid line (the direct-report relation is unambiguous per team).
- [C8] Design Systems ALSO has a dashed orange connection to VP Engineering — a second, different-styled relationship crossing subtrees.
- [C9] Solid means direct report; the orange dashed line means a dotted-line (secondary) report.
- [C10] The subtrees are unequal: Engineering is the largest (4 teams), Design the smallest (1).
- [C11] The four panels group each VP with its own teams (grouping recovered from tint/title, not just proximity).

SECONDARY:
- [S1] Panel titles: Engineering, Product, Design, Operations.
- [S2] Leadership (CEO + VPs) is teal; teams are gray.
- [S3] All nine team boxes sit on one shared baseline across the panels.
- [S4] The dashed cross-link is labeled "dotted line".
- [S5] The sticky explains the solid/dashed convention and the panel grouping.
- [S6] The four panels carry four distinct washes (teal, violet, orange, green).
- [S7] Each VP is centered over its children; the CEO is centered over the VP row (the symmetry reads as deliberate).

## Intent-fidelity checklist

Nodes:
- [ ] IF-01 node n1 "CEO" exists, teal, above the panels, no panel membership
- [ ] IF-02 nodes n2–n5 exist with labels "VP Engineering", "VP Product", "VP Design", "VP Operations", all teal
- [ ] IF-03 nodes n6–n9 exist ("Platform", "Frontend", "Infrastructure", "Security"), gray, inside sec1
- [ ] IF-04 nodes n10–n11 exist ("Growth", "Insights"), gray, inside sec2
- [ ] IF-05 node n12 "Design Systems" exists, gray, inside sec3
- [ ] IF-06 nodes n13–n14 exist ("IT", "Facilities"), gray, inside sec4
- [ ] IF-07 no padding/filler nodes added to even out the subtrees (instruction forbade faked symmetry)

Sections:
- [ ] IF-08 four tinted panels exist titled Engineering / Product / Design / Operations with teal / violet / orange / green washes respectively
- [ ] IF-09 each panel contains exactly its VP plus its specced teams; every member's rectangle fully inside its panel (JSON geometry)
- [ ] IF-10 the CEO is outside all four panels

Edges:
- [ ] IF-11 e1–e4 exist: CEO → each of the four VPs, solid, neutral
- [ ] IF-12 e5–e8 exist: VP Engineering → Platform / Frontend / Infrastructure / Security, solid, neutral
- [ ] IF-13 e9–e10 exist: VP Product → Growth / Insights, solid, neutral
- [ ] IF-14 e11 exists: VP Design → Design Systems, solid, neutral
- [ ] IF-15 e12–e13 exist: VP Operations → IT / Facilities, solid, neutral
- [ ] IF-16 e14 exists: Design Systems → VP Engineering, dashed, orange, labeled "dotted line", visibly distinct from every solid report
- [ ] IF-17 no tree edge (e1–e13) enters its child from the side or exits its parent from the side — every solid reporting edge leaves the parent's bottom and arrives at the child's top (PNG check; the genre's top known defect)
- [ ] IF-18 all directions as specced, parent → child (any reversal → IF cap 6)

Layout discipline (all explicitly instructed, so all IF-checkable):
- [ ] IF-19 the nine leaves share a single baseline register (equal y within one grid cell, 16px, across all four panels — JSON check)
- [ ] IF-20 each VP's x-center is at (±16px) the midpoint of its own solid-fan children; the dotted line does NOT shift VP Engineering's centering
- [ ] IF-21 the CEO's x-center is at (±16px) the midpoint of the VP row

Annotations:
- [ ] IF-22 margin sticky present with the reading-guide gist (solid = direct, orange dashed = dotted-line, panels group orgs)

Negative:
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (no extra nodes, panels, junction glyphs, or edges beyond spec + declared substitutions)

## Follow-up edits

### E1 — Growth moves to Engineering

Instruction (verbatim):

> Growth is moving: it now reports to VP Engineering, not VP Product. Move the Growth box
> into the Engineering panel, rewire its solid report line from VP Product to VP
> Engineering — out of the VP's bottom, into Growth's top, as always. The dotted line
> from Design Systems to VP Engineering stays exactly as it is. Engineering's panel may
> widen and Product's may tighten to fit — but the nine teams stay on the shared
> baseline, the Design and Operations panels don't move, and every VP stays centered over
> its own children.

Post-edit ground truth: n10 is a member of sec1; e9 becomes n2→n10 (solid, neutral, unlabeled); Engineering fan has 5 children, Product fan has 1 (n11).

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 n10 "Growth" now fully inside sec1, on the shared baseline
- [ ] E1-02 Growth's solid report edge now runs n2→n10, bottom-exit/top-entry; no solid edge remains between n3 and n10
- [ ] E1-03 e14 (dotted line) intact: same endpoints n12→n2, dashed, orange, labeled "dotted line"
- [ ] E1-04 n2 re-centered over its five solid children; n3 re-centered over n11

Stability invariants (ES):
- [inv] sec3, sec4 and every member (n4, n5, n12, n13, n14) do not move
- [inv] the leaf baseline y-value is unchanged; every leaf still on it
- [inv] n1 stays centered over the VP row (may shift only if the VP row's midpoint moved, declared)
- [inv] no edge other than e9 is rerouted, restyled, or relabeled (e14 explicitly frozen)
- [inv] within sec1, the pre-existing four teams keep their left-to-right order; within untouched panels, arrangement byte-identical
- in-scope objects: n10; e9; sec1 and sec2 bounds; n2 and n3 x-positions (re-centering); sec1's teams may shift horizontally to admit Growth (declared accommodation); n1 x-position only if the VP-row midpoint moves (declared)

### E2 — new hire team under Design

Instruction (verbatim):

> New team under VP Design: Brand Studio, gray box like the others, solid neutral report
> line from VP Design — bottom-out, top-in. It joins Design Systems on the shared
> baseline inside the Design panel. Let the Design panel grow, and nudge its neighbors
> only as much as that growth genuinely requires — the other three fans keep their
> internal arrangement, everything stays on the register, and the dotted line doesn't
> move.

Post-edit ground truth: node n15 "Brand Studio", gray, member of sec3, on the baseline; edge e15 n4→n15 solid neutral; Design fan has 2 children.

Fidelity checks:
- [ ] E2-01 n15 "Brand Studio" exists, gray, fully inside sec3, on the shared baseline
- [ ] E2-02 e15 n4→n15 exists, solid, neutral, bottom-exit/top-entry
- [ ] E2-03 n4 re-centered over its two children
- [ ] E2-04 e14 (dotted line) intact: endpoints, style, color, label unchanged

Stability invariants (ES):
- [inv] the leaf baseline y-value unchanged; all leaves (now ten) on it
- [inv] sec1, sec2, sec4 internal arrangements rigid (members keep identical relative positions; whole-panel horizontal translation allowed only as declared make-room accommodation)
- [inv] no existing edge rerouted beyond what a declared panel translation forces; none restyled or relabeled
- [inv] n1 stays centered over the VP row (declared shift only)
- in-scope objects: n15, e15; sec3 bounds; n4 x-position; neighbor panels (rigid translation only, declared); n1 x-position (declared re-center only)

### E3 — equalize the cluster gaps

Instruction (verbatim):

> Even out the horizontal gaps between the four panels so the tree reads balanced — the
> gutters between Engineering, Product, Design, and Operations should come out equal, or
> as near as makes no difference. Geometry only: nothing added, removed, restyled, or
> relabeled. Each panel moves as a rigid unit — its insides are frozen — the teams stay
> on the baseline, every VP stays centered over its children, and re-center the CEO over
> the VP row when you're done.

Fidelity checks:
- [ ] E3-01 the three inter-panel gutters are equal within one grid cell (max−min ≤ 16px; JSON check)
- [ ] E3-02 n1 x-center at the VP-row midpoint (±16px)

Stability invariants (ES):
- [inv] object, edge, section, and annotation sets byte-identical in membership; zero style/label changes
- [inv] each panel's internal geometry rigid: every member's position relative to its panel origin unchanged
- [inv] the leaf baseline y-value unchanged; no vertical movement of any panel or node
- [inv] leaf/panel left-to-right order unchanged (Engineering, Product, Design, Operations — no reordering to make the math easier)
- [inv] fan-centering holds post-move for all four VPs (rigid translation preserves it; any panel-internal churn shows up here)
- in-scope objects: horizontal positions of sec1–sec4 as rigid units (members translate with their panel); n1 x-position; edge routes (they follow their endpoints)

## Grading notes

Genre traps from the round-1 corpus (`findings-org-tree.md`, `v4r1-org-tree.md`):

- **Side-entry elbow defect — the genre's top known trap.** In every committed render of
  v2, v3, and v4, some CEO→VP or VP→team edges entered boxes from the side with hooked
  elbows; the connection schema supports `from/to.anchor` and both reference boards use
  bottom→top anchoring, but nothing in the pipeline emits it unprompted. This scenario's
  instruction demands bottom-exit/top-entry explicitly, so IF-17 is a hard check, not a
  style preference. Judges: verify on the outer VPs especially (the long fan arms are
  where v4 side-entered).
- **Register and order discipline.** v3's grid re-pack scrambled sibling order and split
  the twelve leaves onto two baselines 52px apart. IF-19 and the per-edit baseline
  invariants target exactly this; an off-register leaf after any edit is an invariant
  violation, not a rounding note.
- **Cluster-gap equalization (E3) historically died at three walls** — raw-coordinate
  refusal, the closed spacing ladder, and size normalization's non-idempotent round trip
  (old system, two honest abandons); v4's model-owned arithmetic achieved exact 128px
  gutters. If the agent honestly refuses E3, ES is unscored for it and the refusal lands
  in IF/PH per axes/if.md + axes/ph.md — do not score a refusal as churn.
- **Whole-board re-solve for a local ask.** v3's 3-pill fix moved all 13 objects (ES
  anchor 2). E1/E2 have tight in-scope lists; an untouched panel that re-lays-out scores
  accordingly.
- **Dotted-line report in the fan math.** The hub-balance diagnostic counts dashed
  cross-links as fan children and both false-fires and mis-centers on them (v4 S1–S3).
  IF-20 deliberately requires centering over SOLID children only; an agent overriding a
  hub-balance warning about VP Engineering with a note naming the dotted line is correct
  behavior (PH credit), and a VP visibly off its solid-fan midpoint is a real defect even
  if diagnostics stay silent.
- **Rhythm/color-contrast false positives.** 32px-intra vs wider-inter spacing is the
  grouping device, and monotone gray teams is the requested palette (v4 S4's W1–W3 were
  all false positives). Overridden-with-verbatim-note is good process; do not read
  warning overrides as defects.
- **Panels and the router.** CEO→VP edges must cross panel top borders; sections are
  historically awkward for the router (perimeter detours). A clean top-entry through the
  panel title band is what the references do; a detour around a panel is an SQ
  edge-legibility hit, not an IF failure, provided endpoints/anchors hold.
- **Deliberately unequal subtrees are the spec.** Do not penalize asymmetric panel widths
  (Design is 1–2 teams wide by design); DO penalize dead vertical bands (v4 S1's 512px
  hollow between registers) and empty stretched panels — density variation should read
  deliberate.
- **Declared substitutions** fail their item without triggering IF's silent-absence cap,
  per axes/README.md; never double-penalize them across axes.
