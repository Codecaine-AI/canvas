# S3 — State machine with cycles: connection lifecycle

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for.
This scenario is the standing-suite descendant of the round-1 connection-lifecycle battery
(findings-state-machine.md, v4r1-state-machine.md) — same proven shape, self-contained. -->

- id: `s3-state-machine`
- canvas: `eval-suite-s3-state-machine` (created fresh every run; delete any existing first)
- genre: state machine
- complexity: 3
- board: 2800×1800 locked `page-frame` (larger than default — the readability probe needs air)
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> Build the connection-lifecycle state machine, reference finish — labeled transitions ON
> the connectors, semantic color families, room to read every chip. Seven states: Idle,
> Connecting, Connected, Degraded, Reconnecting, Suspended, Disconnecting. States are
> neutral gray except Suspended, which is violet to match its family, and Disconnecting,
> which is teal to match the shutdown path. The happy path is solid gray: Idle to Connecting
> labeled "connect()", Connecting to Connected labeled "handshake OK". Failures are dashed
> red: Connecting back to Idle labeled "timeout", Connected to Degraded labeled "packet
> loss > 5%", Degraded to Reconnecting labeled "grace expired". Recovery is solid green:
> Degraded back to Connected labeled "recovered", Reconnecting to Connected labeled
> "session resumed". The suspension family is solid violet: Connected to Suspended labeled
> "suspend()", Degraded to Suspended labeled "quarantine", and Suspended to Reconnecting
> labeled "resume window". The shutdown path is solid teal: Connected to Disconnecting
> labeled "close()", Disconnecting to Idle labeled "socket closed". Connected also has a
> heartbeat self-transition every 30 seconds — I know self-loops are dicey in this tool; if
> you can't draw a real one, give Connected a small green "heartbeat / 30s" badge pinned
> directly to the box — touching it, inside it, or attached by a short stub, NOT floating
> off in space — and declare the substitution in your summary. Keep the timeout back-edge
> visually separate from the connect() arrow — that pair must never read as one
> bidirectional edge. One margin sticky on the failure semantics: "dashed red = degradation
> — every failure lands back in Reconnecting or Idle, nothing dead-ends."

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | Idle | state box | gray/neutral | start/rest state |
| n2 | Connecting | state box | gray/neutral | |
| n3 | Connected | state box | gray/neutral | hub: 6 incident edges + badge |
| n4 | Degraded | state box | gray/neutral | |
| n5 | Reconnecting | state box | gray/neutral | |
| n6 | Suspended | state box | violet | matches suspension family |
| n7 | Disconnecting | state box | teal | matches shutdown path |
| b1 | ↻ heartbeat / 30s | small badge pill | green | declared self-loop substitution; must be visually ANCHORED to n3 (see IF-22) |
| n8 | Migrating | state box | orange | exists only after E1 |

<!-- ref is a stable handle for this file (n1, n2…) — the agent chooses its own ids. -->

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | connect() | solid | gray/neutral | happy path |
| e2 | n2 → n3 | handshake OK | solid | gray/neutral | happy path |
| e3 | n2 → n1 | timeout | dashed | red | anti-parallel with e1; E3's target |
| e4 | n3 → n4 | packet loss > 5% | dashed | red | |
| e5 | n4 → n5 | grace expired | dashed | red | |
| e6 | n4 → n3 | recovered | solid | green | recovery; anti-parallel with e4 |
| e7 | n5 → n3 | session resumed | solid | green | recovery |
| e8 | n3 → n6 | suspend() | solid | violet | |
| e9 | n4 → n6 | quarantine | solid | violet | |
| e10 | n6 → n5 | resume window | solid | violet | |
| e11 | n3 → n7 | close() | solid | teal | |
| e12 | n7 → n1 | socket closed | solid | teal | |
| (self) | n3 → n3 | heartbeat / 30s | — | green | UNSUPPORTED by the tool surface — rendered as badge b1; a declared substitution, not an omission |
| e13 | n3 → n8 | migrate() | solid | orange | added by E1 |
| e14 | n8 → n3 | migration complete | solid | green | added by E1 |
| e15 | n8 → n5 | migration failed | dashed | red | added by E1 |

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| — | (none requested) | | | |

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | margin sticky | dashed red = degradation; every failure lands back in Reconnecting or Idle — nothing dead-ends | margin, adjacent to the failure edges |

## Comprehension key

<!-- Keyed to the FINAL board state (after E1–E3) — the IC blind judge sees only the final
PNG. CORE ×2, SECONDARY ×1. -->

CORE:
- [C1] The board depicts a connection-lifecycle state machine; Idle is the start/rest state.
- [C2] Idle transitions to Connecting via connect().
- [C3] Connecting transitions to Connected on handshake success.
- [C4] Connecting falls BACK to Idle on timeout — direction is backward, this is not a second forward edge.
- [C5] Connected degrades to Degraded on packet loss.
- [C6] Degraded transitions to Reconnecting when the grace period expires.
- [C7] Degraded can recover directly back to Connected.
- [C8] Reconnecting returns to Connected when the session is resumed.
- [C9] Connected can be suspended into Suspended (suspend()).
- [C10] Degraded can be quarantined into Suspended.
- [C11] Suspended exits to Reconnecting via a resume window — Suspended is not a dead end.
- [C12] Connected shuts down through Disconnecting via close().
- [C13] Disconnecting completes back to Idle when the socket closes.
- [C14] Connected has a recurring heartbeat self-transition, and it belongs to Connected specifically (the badge reads as Connected's, not as a label on some other edge).
- [C15] Migrating is entered from Connected, returns to Connected on completion, and fails into Reconnecting.

SECONDARY:
- [S1] Dashed red is the failure/degradation convention.
- [S2] Solid green marks recovery transitions.
- [S3] Violet marks the suspension family (edges and the Suspended state).
- [S4] Teal marks the shutdown path (edges and the Disconnecting state).
- [S5] The packet-loss threshold is 5% ("packet loss > 5%").
- [S6] The heartbeat cadence is 30 seconds.
- [S7] Ordinary states and the happy path are neutral gray; Migrating is orange.
- [S8] A margin note conveys that dashed red means degradation and every failure funnels back to Reconnecting or Idle.
- [S9] The timeout and connect() arrows are two separate, opposite arrows — not one bidirectional edge.

## Intent-fidelity checklist

<!-- Checked against final canvas JSON + final PNG. Items marked (E1)/(E3) are appended by
those edits. -->

- [ ] IF-01 node n1 exists, label "Idle", gray/neutral
- [ ] IF-02 node n2 exists, label "Connecting", gray/neutral
- [ ] IF-03 node n3 exists, label "Connected", gray/neutral
- [ ] IF-04 node n4 exists, label "Degraded", gray/neutral
- [ ] IF-05 node n5 exists, label "Reconnecting", gray/neutral
- [ ] IF-06 node n6 exists, label "Suspended", violet
- [ ] IF-07 node n7 exists, label "Disconnecting", teal
- [ ] IF-08 edge e1 n1→n2 labeled "connect()", solid, gray/neutral
- [ ] IF-09 edge e2 n2→n3 labeled "handshake OK", solid, gray/neutral
- [ ] IF-10 edge e3 n2→n1 labeled "timeout", dashed, red — direction back to Idle
- [ ] IF-11 edge e4 n3→n4 labeled "packet loss > 5%", dashed, red
- [ ] IF-12 edge e5 n4→n5 labeled "grace expired", dashed, red
- [ ] IF-13 edge e6 n4→n3 labeled "recovered", solid, green
- [ ] IF-14 edge e7 n5→n3 labeled "session resumed", solid, green
- [ ] IF-15 edge e8 n3→n6 labeled "suspend()", solid, violet
- [ ] IF-16 edge e9 n4→n6 labeled "quarantine", solid, violet
- [ ] IF-17 edge e10 n6→n5 labeled "resume window", solid, violet
- [ ] IF-18 edge e11 n3→n7 labeled "close()", solid, teal
- [ ] IF-19 edge e12 n7→n1 labeled "socket closed", solid, teal
- [ ] IF-20 heartbeat present: either a true self-loop on n3 (not expected — unsupported) or badge b1, a small green pill labeled "heartbeat / 30s" (↻ prefix optional), with the substitution declared in a commit summary
- [ ] IF-21 badge b1 is visually ANCHORED to n3: touching its border, contained within it, or attached by a short stub connector — a pill floating in open space FAILS this item, and a badge that reads as a label on some other edge fails it doubly
- [ ] IF-22 e1 and e3 are visually separate arrows — no co-linear overlap reading as one bidirectional edge (PNG check; instruction demanded this explicitly)
- [ ] IF-23 every transition label is a legible chip visually associated with its own connector (on-connector labels were the instruction's headline ask)
- [ ] IF-24 sticky a1 present in the margin adjacent to the failure edges, gist = dashed red means degradation, failures funnel to Reconnecting or Idle
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (nodes/sections/edges beyond spec + declared substitutions)

## Follow-up edits

<!-- 3 edits, each its own agent session, run in order, each accepted before the next. -->

### E1 — add the Migrating state

Instruction (verbatim):

> Add a Migrating state — orange box — for live session handoff, and give it room instead
> of wedging it in: Connected to Migrating labeled "migrate()" in orange, Migrating back to
> Connected labeled "migration complete" in solid green like the other recoveries, and
> Migrating to Reconnecting labeled "migration failed", dashed red like the other failures.
> Don't crowd the existing machine — if a neighbor must shift to open a corridor, keep it
> minimal and say so in your summary. Everything else stays exactly as it is.

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 node n8 exists, label "Migrating", orange
- [ ] E1-02 edge e13 n3→n8 labeled "migrate()", solid, orange
- [ ] E1-03 edge e14 n8→n3 labeled "migration complete", solid, green
- [ ] E1-04 edge e15 n8→n5 labeled "migration failed", dashed, red
- [ ] E1-05 the three new labels' chips own clear air — none lands on an existing chip or box (the round-1 S3 failure mode; instruction said "don't crowd")
- [ ] E1-06 badge b1 still reads as anchored to n3 after the edit

Stability invariants (ES):
- [inv] n1–n7, b1, a1: no undeclared move > 16px; declared make-room shifts minimal and named in the commit summary
- [inv] e1–e12: endpoints, labels, styles, colors unchanged; no reroute through a visibly different corridor except as the new corridors plainly require (declared)
- [inv] the e1/e3 separation (fought-for, demanded at build) survives
- [inv] no existing object resized, restyled, or relabeled
- in-scope objects: n8 (new), e13/e14/e15 (new), plus declared minimal make-room neighbors only

### E2 — THE READABILITY PROBE (geometry-only polish pass)

Instruction (verbatim):

> Compare against our house standard: give every labeled edge room to breathe, widen the
> corridors, and rebalance so it reads at a glance — polish to reference quality.

Fidelity checks (append to the running IF checklist):
- [ ] E2-01 every labeled chip owns clear air in the final PNG — no chip touches another chip, a box, or a line it doesn't belong to
- [ ] E2-02 the frame is not >35% dead on one side: no contiguous empty band (full frame width or full frame height) exceeding 35% of the locked frame's area — the v4 round-1 top-packed miss
- [ ] E2-03 badge b1 remains anchored to n3 and did NOT drift to where it reads as a label on another wire (the v4 S2 heartbeat-drift failure)

Stability invariants (ES — this is a GEOMETRY-ONLY pass; topology, labels, styles, colors untouched):
- [inv] object count and connection count identical pre/post — zero adds, zero removes
- [inv] every label (node, edge, badge, sticky) byte-identical
- [inv] every style and color-class byte-identical — no edge changes solid/dashed, no recolors
- [inv] every connection keeps its endpoints — no rewiring
- [inv] only position/route geometry may change, and the changes serve the stated goal (wider corridors, chip air, balance)
- [inv] E1's three additions and their attributes survive untouched except in geometry
- in-scope objects: ALL objects, geometry channel only — this is the one edit where broad movement is legitimate; the frozen channels are topology, labels, styles, colors

### E3 — reroute the timeout corridor: one continuous arrow

Instruction (verbatim):

> The timeout path from Connecting back to Idle still reads like machinery. I want it as
> one continuous dashed red arrow from Connecting to Idle — no crosshair glyphs, no
> arrowheads dying into waypoints, no visible junction anywhere along it — and clearly
> separated from the connect() arrow so the pair can't be misread as one bidirectional
> edge. Touch only that corridor; if there are leftover routing waypoints on it, remove
> them. Everything else stays put.

Fidelity checks (append to the running IF checklist):
- [ ] E3-01 edge e3 exists n2→n1, dashed, red, labeled "timeout"
- [ ] E3-02 e3 renders as ONE continuous path — no junction/waypoint objects remain on the timeout corridor, no crosshair glyphs, no intermediate arrowhead terminations
- [ ] E3-03 e3 and e1 are visibly separate parallel-opposite arrows — neither overlaps the other, and the "timeout" chip clearly belongs to the back edge
- [ ] E3-04 any junction objects previously serving the timeout route are deleted, not orphaned elsewhere on the board

Stability invariants (ES):
- [inv] every object except any timeout-corridor junction/waypoint objects (all states, b1, a1): no undeclared move > 16px
- [inv] every connection other than e3 (and e1's route where corridor separation plainly requires a minimal adjustment, declared): endpoints, routes, labels, styles, colors unchanged
- [inv] no labels, styles, or colors change anywhere — including on e3 itself (it was already dashed red "timeout"; this is a routing fix)
- [inv] E2's achieved corridor widths elsewhere on the board are not collapsed (fought-for property)
- in-scope objects: e3's route, timeout-corridor junction objects (removal), e1's route (minimal, declared)

## Grading notes

- This genre's round-1 traps, in order of severity:
  1. **Anti-parallel pairs** (e1/e3, and e4/e6): the old system drew the timeout back-edge
     exactly on top of the forward edge — it read as one bidirectional arrow (SVG paths
     `M 574 1208 L 650 1208` vs the reverse; findings-state-machine S1b). That is an IC
     CORE corruption (caps IC at 6) plus SQ-3 anchor territory. v4 avoided it only by
     inventing junction machinery — which is the next trap.
  2. **Junction-glyph machinery**: v4's only route to anti-parallel separation was
     or-junction waypoint objects rendering as bare crosshair glyphs with arrowheads
     terminating INTO them (v4r1-state-machine S1/S2, ~1 anchored point of SQ). If the
     build uses junctions: leakage is SQ sub-check 5; the objects count against IF-NEG-2
     only if undeclared; and E3 exists precisely to demand their removal — E3 is scored on
     whether the corridor ends up machinery-free, whatever the build did.
  3. **Self-loop → badge substitution**: self-loop connectors are unsupported by the tool
     surface (round-1: drawn straight through the box; v3: board-wrecking). The DECLARED
     badge substitution is the accepted rendering — judges must NOT treat it as a missing
     edge (no silent-absence cap; the (self) row fails IF-20 only if the badge is absent
     or undeclared) and must NOT double-penalize: PH credits the honest declaration, IF-21
     owns anchoring, SQ owns floating-pill ugliness. What IS penalized: a floating badge
     (v4 S1), or a badge that drifts until it reads as another wire's label (v4 S2 — an IC
     corruption of C14).
  4. **Chip crowding on dense hubs**: n3 carries six edges plus the badge; round-1 S3
     landed new chips ON existing boxes ("admin suspend" on "packet loss > 5%"). E1-05 and
     E2-01 own this.
  5. **Dead frame**: v4 committed with the bottom ~40% of the locked frame empty and
     lint-clean, twice. E2-02 makes it a checkable fidelity item for the readability pass;
     at build time it is SQ sub-check 1 only.
- E2 discrimination: the probe instruction is deliberately identical to v4 round-1's S2 so
  results anchor cleanly against that corpus. The known good outcome was ~10 pure-geometry
  ops that measurably widened corridors; the known miss was "rebalance" interpreted
  horizontally only. Any topology/label/style churn in E2 is an ES violation even if the
  board looks better — geometry-only is the contract.
- E3 vs ES: deleting junction objects on the timeout corridor is IN scope (the instruction
  says remove them); ES violations are motions elsewhere. If the build produced no
  junctions and e1/e3 are already clean, a minimal separation-tightening pass (or an honest
  "already clean, adjusted nothing" refusal) scores well — do not demand churn.
- Hub-balance overrides: round-1 established that hub-balance warnings fire on every
  deliberate left-to-right spine and that overriding them with a verbatim note is the
  RIGHT call — PH must credit reasoned overrides, not count them as silenced warnings.
- Color families: states are mostly neutral by instruction — do not score the gray states
  as monotone-by-neglect (a user-requested restrained palette is not monotony, per SQ
  sub-check 4). The semantic load is on the edge families: red/green/violet/teal/orange.
