# S4 — Swimlane pipeline (request processing)

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s4-swimlane`
- canvas: `eval-suite-s4-swimlane` (created fresh every run; delete any existing first)
- genre: swimlane pipeline
- complexity: 3
- board: 2400×1600 locked `page-frame` (vertical growth explicitly authorized in E1)
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> Build me a request-processing pipeline as a proper swimlane board — four full-width
> horizontal lanes, tinted so the lanes themselves do the grouping work, stacked top to
> bottom in this order: Frontend (teal tint), API (violet tint), Data (orange tint),
> Workers (green tint). One convention for the whole board: solid edges are synchronous
> calls, dashed edges are async handoffs — and put a small legend sticky in the top margin
> that says exactly that, so a reader never has to guess. Frontend lane, left to right,
> all solid: Submit Form → Validate Input → Show Progress → Render Result. When validation
> passes, Validate Input drops into the API lane with a solid edge labeled "submit" into
> Parse Request. API lane run, solid, left to right: Parse Request → Auth Check → Enqueue
> Job → Serve Result. Enqueue Job hands off async — dashed, orange, labeled "enqueue" —
> down into Job Queue in the Data lane; the Data lane also holds Results DB. Workers lane
> run, solid: Pick Up Job → Process Data → Write Results; the queue feeds it with a
> dashed orange edge labeled "poll" from Job Queue into Pick Up Job. Two deliberate
> long-haul edges — route them cleanly, no perimeter marathons: Write Results goes back up
> into the Data lane with a solid edge labeled "persist" into Results DB, and Process Data
> sends a dashed muted-gray edge labeled "status" all the way up to Show Progress in the
> Frontend lane — that one skips two whole lanes, keep its route readable and its label
> next to its run. Close the loop: Results DB → Serve Result, solid, labeled "read", and
> Serve Result → Render Result, solid, labeled "response". Add one margin sticky
> summarizing the pipeline: the submit returns immediately, the real work flows through
> the queue, and status streams back to the browser. Finish matters: every label chip in
> clear air, lanes equal width, stages sitting on clean columns so the cross-lane handoffs
> drop vertically, readable at arm's length.

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | Submit Form | process box | neutral | Frontend lane, leftmost |
| n2 | Validate Input | process box | neutral | Frontend lane |
| n3 | Show Progress | process box | neutral | Frontend lane; target of status feedback |
| n4 | Render Result | process box | neutral | Frontend lane, rightmost |
| n5 | Parse Request | process box | neutral | API lane, leftmost |
| n6 | Auth Check | process box | neutral | API lane |
| n7 | Enqueue Job | process box | neutral | API lane |
| n8 | Serve Result | process box | neutral | API lane, rightmost |
| n9 | Job Queue | process box (queue) | neutral | Data lane |
| n10 | Results DB | process box (store) | neutral | Data lane |
| n11 | Pick Up Job | process box | neutral | Workers lane, leftmost |
| n12 | Process Data | process box | neutral | Workers lane |
| n13 | Write Results | process box | neutral | Workers lane, rightmost |

13 nodes. The agent chooses its own ids; refs are handles for this file only.

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | — | solid | neutral | in-lane Frontend run |
| e2 | n2 → n3 | — | solid | neutral | in-lane Frontend run |
| e3 | n3 → n4 | — | solid | neutral | in-lane Frontend run |
| e4 | n2 → n5 | submit | solid | neutral | cross-lane Frontend→API |
| e5 | n5 → n6 | — | solid | neutral | in-lane API run |
| e6 | n6 → n7 | — | solid | neutral | in-lane API run |
| e7 | n7 → n8 | — | solid | neutral | in-lane API run |
| e8 | n7 → n9 | enqueue | dashed | orange | async, API→Data |
| e9 | n9 → n11 | poll | dashed | orange | async, Data→Workers (crosses Observability after E1) |
| e10 | n11 → n12 | — | solid | neutral | in-lane Workers run |
| e11 | n12 → n13 | — | solid | neutral | in-lane Workers run |
| e12 | n13 → n10 | persist | solid | neutral | long-haul Workers→Data, against reading order (crosses Observability after E1) |
| e13 | n12 → n3 | status | dashed | muted | SKIP-LANE: Workers→Frontend, passes over Data and API |
| e14 | n10 → n8 | read | solid | neutral | Data→API |
| e15 | n8 → n4 | response | solid | neutral | API→Frontend, closes the loop |

15 edges at build.

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| sec1 | Frontend | teal | n1 n2 n3 n4 | top lane |
| sec2 | API | violet | n5 n6 n7 n8 | below sec1 |
| sec3 | Data | orange | n9 n10 | below sec2 |
| sec4 | Workers | green | n11 n12 n13 | below sec3 (Observability inserts above it in E1) |

All four lanes full-width horizontal bands, equal width, stacked in the order above.

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | margin sticky | pipeline summary: submit returns immediately, real work flows through the queue, status streams back to the browser | board margin, outside the lanes |
| a2 | legend sticky | solid = synchronous call, dashed = async handoff | top margin |

## Comprehension key

CORE:
- [C1] The board is four horizontal lanes named Frontend, API, Data, Workers, in that top-to-bottom order (five after E1, with Observability between Data and Workers).
- [C2] Frontend flow order is Submit Form → Validate Input → Show Progress → Render Result.
- [C3] Validate Input hands off to Parse Request in the API lane (the "submit" crossing).
- [C4] API flow order is Parse Request → Auth Check → Enqueue Job → Serve Result.
- [C5] Enqueue Job feeds Job Queue asynchronously (dashed).
- [C6] Job Queue feeds Pick Up Job asynchronously (dashed) — the queue is how work reaches the Workers lane.
- [C7] Workers flow order is Pick Up Job → Process Data → Write Results.
- [C8] Write Results writes into Results DB (direction Workers→Data).
- [C9] Results DB is read by Serve Result (direction Data→API).
- [C10] Serve Result returns to Render Result (direction API→Frontend).
- [C11] Process Data sends status back up to Show Progress in the Frontend lane, skipping the lanes between.
- [C12] Dashed means async, solid means synchronous.
- [C13] Job Queue and Results DB both live in the Data lane.

SECONDARY:
- [S1] The two queue edges are labeled "enqueue" and "poll".
- [S2] The database edges are labeled "persist" (in) and "read" (out).
- [S3] The feedback edge is labeled "status".
- [S4] A legend states the solid-vs-dashed convention.
- [S5] The margin sticky says the submit returns immediately, work flows through the queue, and status streams back.
- [S6] Async queue edges are orange; the status edge is muted gray.
- [S7] The four lanes carry four distinct tints (teal, violet, orange, green).
- [S8] The cross-lane request/response pair is labeled "submit" and "response".

## Intent-fidelity checklist

Nodes:
- [ ] IF-01 node n1 exists, label "Submit Form", inside Frontend lane
- [ ] IF-02 node n2 exists, label "Validate Input", inside Frontend lane
- [ ] IF-03 node n3 exists, label "Show Progress", inside Frontend lane
- [ ] IF-04 node n4 exists, label "Render Result", inside Frontend lane
- [ ] IF-05 node n5 exists, label "Parse Request", inside API lane
- [ ] IF-06 node n6 exists, label "Auth Check", inside API lane (full label, not truncated — v4 shipped "Auth…")
- [ ] IF-07 node n7 exists, label "Enqueue Job", inside API lane
- [ ] IF-08 node n8 exists, label "Serve Result", inside API lane
- [ ] IF-09 node n9 exists, label "Job Queue", inside Data lane
- [ ] IF-10 node n10 exists, label "Results DB", inside Data lane
- [ ] IF-11 node n11 exists, label "Pick Up Job", inside Workers lane
- [ ] IF-12 node n12 exists, label "Process Data", inside Workers lane
- [ ] IF-13 node n13 exists, label "Write Results", inside Workers lane

Sections:
- [ ] IF-14 four full-width tinted lane sections titled Frontend / API / Data / Workers, stacked top-to-bottom in that order
- [ ] IF-15 lane tints are four distinct classes: Frontend teal, API violet, Data orange, Workers green
- [ ] IF-16 lanes are equal width (left and right edges aligned across all lanes)
- [ ] IF-17 every node is fully contained inside its specced lane (no straddling a lane border)
- [ ] IF-18 in-lane left-to-right order matches the specced runs (n1<n2<n3<n4; n5<n6<n7<n8; n11<n12<n13)

Edges:
- [ ] IF-19 e1–e3 exist: solid in-lane Frontend run in order n1→n2→n3→n4
- [ ] IF-20 e4 exists n2→n5, solid, labeled "submit"
- [ ] IF-21 e5–e7 exist: solid in-lane API run in order n5→n6→n7→n8
- [ ] IF-22 e8 exists n7→n9, dashed, orange, labeled "enqueue"
- [ ] IF-23 e9 exists n9→n11, dashed, orange, labeled "poll"
- [ ] IF-24 e10–e11 exist: solid in-lane Workers run in order n11→n12→n13
- [ ] IF-25 e12 exists n13→n10, solid, labeled "persist"
- [ ] IF-26 e13 exists n12→n3, dashed, muted, labeled "status"
- [ ] IF-27 e14 exists n10→n8, solid, labeled "read"
- [ ] IF-28 e15 exists n8→n4, solid, labeled "response"
- [ ] IF-29 every edge label chip is visually associated with its own run (PNG check; a chip stranded in a margin naming a run elsewhere fails)
- [ ] IF-30 all directions as specced (any reversal → IF cap 6 per axes/if.md)

Annotations:
- [ ] IF-31 legend sticky present in the top margin stating solid = synchronous, dashed = async
- [ ] IF-32 margin sticky present with the pipeline-summary gist (immediate return / queue / status streaming), placed outside the lanes

Negative:
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (no extra nodes, lanes, sections, relay/junction pills, or edges beyond spec + declared substitutions)

## Follow-up edits

### E1 — insert the Observability lane

Instruction (verbatim):

> Insert a fifth lane, Observability, between Data and Workers — same full-width lane
> treatment, muted gray tint. Two nodes in it, left to right: Trace Requests and Collect
> Metrics. Wire two dashed muted-gray taps: Parse Request → Trace Requests and Process
> Data → Collect Metrics. Grow the board vertically if you need the room — do not squeeze
> the existing lanes to make it fit. Everything already on the board stays as it is: lane
> order ends up Frontend, API, Data, Observability, Workers top to bottom, every existing
> node keeps its lane and its left-to-right arrangement, and no existing edge loses its
> label, style, or color.

New ground truth: node n14 "Trace Requests", node n15 "Collect Metrics" (neutral, Observability lane, n14 left of n15); section sec5 "Observability", muted tint, between sec3 and sec4; edge e16 n5→n14 dashed muted (unlabeled), edge e17 n12→n15 dashed muted (unlabeled).

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 section sec5 "Observability" exists, muted tint, full-width, positioned between Data and Workers
- [ ] E1-02 nodes n14 "Trace Requests" and n15 "Collect Metrics" exist inside sec5, n14 left of n15
- [ ] E1-03 edge e16 n5→n14 exists, dashed, muted
- [ ] E1-04 edge e17 n12→n15 exists, dashed, muted
- [ ] E1-05 lanes remain equal width including the new lane

Stability invariants (ES):
- [inv] lane relative order is Frontend, API, Data, Observability, Workers (existing four keep relative order)
- [inv] Frontend, API, and Data lanes and all their member nodes do not move (0px; they sit above the insertion point)
- [inv] Workers lane translates down as a rigid unit: its three nodes keep identical relative positions and left-to-right arrangement
- [inv] every lane's node membership is unchanged (no node changes lane)
- [inv] all 15 build edges still exist with identical endpoints, direction, label, style, and color
- [inv] edge routes for edges NOT crossing the insertion gap are unchanged
- in-scope objects: sec5, n14, n15, e16, e17; page-frame (vertical growth); sec4 + n11 n12 n13 (rigid vertical translation, declared); routes of e9, e12, e13 (they cross the insertion gap and must re-route)

### E2 — the cache-hit shortcut

Instruction (verbatim):

> One more edge, nothing else: a dashed muted-gray edge labeled "cache hit" from Auth
> Check up to Render Result — when the auth-layer cache answers, we skip the queue
> entirely. Do not move anything to make room for it; thread it through the existing
> corridors. Every node, lane, and existing edge stays exactly where it is.

Fidelity checks:
- [ ] E2-01 edge e18 n6→n4 exists, dashed, muted, labeled "cache hit"
- [ ] E2-02 the "cache hit" chip sits in clear air on its own run

Stability invariants (ES):
- [inv] zero object moves — every node, lane section, and sticky at identical position and size
- [inv] all pre-existing edges keep identical routes, labels, styles, colors
- [inv] the diff is exactly one added connection
- in-scope objects: e18 only

### E3 — tighten the lane gaps

Instruction (verbatim):

> The board reads a bit gappy vertically — tighten the vertical gaps between the lanes so
> the whole pipeline reads denser, without any label losing its air. Geometry only: same
> lanes, same order, same nodes, same edges, same labels, same styles. Nothing inside a
> lane rearranges horizontally; the lanes just close ranks vertically.

Fidelity checks:
- [ ] E3-01 every inter-lane vertical gap is smaller than (or equal to, if already minimal) its pre-edit value, and at least one gap measurably shrank
- [ ] E3-02 no label chip overlaps a node, edge, border, or other chip in the final PNG

Stability invariants (ES):
- [inv] object, section, edge, and annotation sets are byte-identical in membership — nothing added, removed, restyled, or relabeled
- [inv] lane order Frontend, API, Data, Observability, Workers unchanged
- [inv] every node's x-position unchanged (≤16px); in-lane arrangements rigid
- [inv] every node stays inside its lane; lane membership unchanged
- [inv] each lane's contents move only as a rigid unit with their lane (vertical translation)
- in-scope objects: vertical positions of all five lane sections and their member nodes; page-frame height; routes of cross-lane edges (they shorten with the gaps); stickies may shift vertically to track the margin (declared)

## Grading notes

Genre traps from the round-1 corpus (`findings-swimlane.md`, `v4r1-swimlane.md`) — judges
should look for these specifically, and NOT double-penalize declared substitutions:

- **Skip-lane perimeter mega-detours.** Full-width lanes are historically impenetrable to
  the router; every corpus generation shipped cross-lane edges detouring around 2000px+ of
  lane perimeter (v1 S1/S3; v4 S3's "poll" wrap after lane insertion). e13 "status" is this
  scenario's stress edge at build; after E1, e9 "poll" and e12 "persist" also cross the new
  lane — E1 is the exact insertion that broke Data/Workers adjacency in v4 S3. A detour is
  an SQ edge-legibility hit, not an IF failure, as long as endpoints/direction hold.
- **Skip-lane taxonomy, for honesty:** at build only e13 is a true multi-lane skip; e12
  "persist" crosses one lane boundary against reading order and becomes a true skip over
  Observability after E1. Judge routing quality, not the label "skip".
- **Margin-stranded label chips.** v4 S3 parked "poll"/"spans" chips at x≈190 naming
  ~2300px runs. IF-29 exists for this; SQ should also notice.
- **Co-linear runs and border-hugging.** v4 S1 shipped a dashed run painted over a solid
  edge for ~500px and a status edge tracing a lane border so it read as lane outline.
  Diagnostics are blind to this class (edge-clarity BLIND in v4r1) — judges must catch it
  from the PNG.
- **Section-trim/density warnings on full-width lanes are false positives** (fired ~22
  warning-turns in v4r1). An agent overriding them with a verbatim note is GOOD process
  (PH credit), not a violation.
- **Lane-height floor.** Five lanes historically pressured the 1600px frame (v1 S2
  abandoned against it). E1 explicitly authorizes vertical growth — do not penalize frame
  growth; DO penalize squeezing existing lanes (invariant breach) or committing content
  clipped off-frame.
- **Omission-means-deletion.** Old-system S6 silently dropped four Frontend stages during
  an unrelated edit. Any silently absent specced node/edge caps IF at 5 per axes/if.md.
