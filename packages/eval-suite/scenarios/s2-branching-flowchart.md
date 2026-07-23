# S2 — Branching flowchart: order fulfillment

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s2-branching-flowchart`
- canvas: `eval-suite-s2-branching-flowchart` (created fresh every run; delete any existing first)
- genre: branching flowchart
- complexity: 2
- board: 2400×1600 locked `page-frame`
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> Build me the order-fulfillment flow, and make it reference quality — labeled arrows on
> every hop, readable spacing, every branch condition legible at a glance. Entry is Order
> received, which flows to an Order valid? decision — make the decisions orange so they
> stand out. Valid? Yes goes to Charge payment; No goes to Request correction, and
> corrections loop back into Order valid? labeled "resubmitted". Charge payment splits: on
> success it flows to an In stock? decision labeled "charged"; if the card is declined it
> goes straight to an Order refunded terminal labeled "charge declined". In stock? Yes goes
> to Pick & pack; No goes to Create backorder, then Await restock labeled "queued", and the
> backorder path rejoins the main line into Pick & pack labeled "stock arrived". If the
> restock window lapses instead, Await restock goes to Order refunded labeled "restock
> window expired". Pick & pack flows to Order shipped labeled "handed to carrier" — that's
> the happy terminal, make it green. Order refunded is the failure terminal — make it red so
> nobody misses it. Everything else neutral gray, all flow arrows solid for now. Label the
> entry arrow "new order" and put Yes/No on every decision exit. Finish with one margin
> sticky next to the refund side: "backorders rejoin the line — a refund only happens when
> the card declines or the restock window lapses."

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | Order received | entry pill | gray/neutral | flow start |
| n2 | Order valid? | decision | orange | Yes/No exits |
| n3 | Request correction | process | gray/neutral | correction side path |
| n4 | Charge payment | process | gray/neutral | |
| n5 | In stock? | decision | orange | Yes/No exits |
| n6 | Create backorder | process | gray/neutral | backorder side path |
| n7 | Await restock | process | gray/neutral | E3's nudge target |
| n8 | Pick & pack | process | gray/neutral | rejoin point |
| n9 | Order shipped | terminal | green | happy terminal |
| n10 | Order refunded | terminal | red | failure terminal |
| n11 | Fraud review | process | violet | exists only after E1 |

<!-- ref is a stable handle for this file (n1, n2…) — the agent chooses its own ids. -->

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | new order | solid | gray/neutral | |
| e2 | n2 → n4 | Yes | solid | gray/neutral | |
| e3 | n2 → n3 | No | solid | gray/neutral | dashed red after E2 |
| e4 | n3 → n2 | resubmitted | solid | gray/neutral | the feedback edge; NOT in E2's failure family |
| e5 | n4 → n5 | charged | solid | gray/neutral | |
| e6 | n4 → n10 | charge declined | solid | gray/neutral | dashed red after E2 |
| e7 | n5 → n8 | Yes | solid | gray/neutral | |
| e8 | n5 → n6 | No | solid | gray/neutral | NOT in E2's failure family |
| e9 | n6 → n7 | queued | solid | gray/neutral | |
| e10 | n7 → n8 | stock arrived | solid | gray/neutral | backorder rejoin |
| e11 | n7 → n10 | restock window expired | solid | gray/neutral | dashed red after E2 |
| e12 | n8 → n9 | handed to carrier | solid | gray/neutral | |
| e13 | n2 → n11 | Flagged | solid | violet | added by E1 |
| e14 | n11 → n4 | cleared | solid | violet | added by E1 |
| e15 | n11 → n10 | confirmed fraud | solid | violet | added by E1; dashed red after E2 |

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| — | (none requested) | | | |

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | margin sticky | backorders rejoin the line; a refund only happens when the card declines or the restock window lapses | margin, adjacent to the refund side of the flow |

## Comprehension key

<!-- Keyed to the FINAL board state (after E1–E3) — the IC blind judge sees only the final
PNG. CORE ×2, SECONDARY ×1. -->

CORE:
- [C1] The board depicts an order-fulfillment flow starting at Order received.
- [C2] Order valid? is a decision with distinct Yes and No exits.
- [C3] A valid order proceeds to Charge payment.
- [C4] An invalid order goes to Request correction.
- [C5] Request correction loops back into Order valid? (corrections are resubmitted, not terminal).
- [C6] After a successful charge the flow reaches the In stock? decision.
- [C7] A declined charge goes to Order refunded.
- [C8] In stock? Yes goes to Pick & pack.
- [C9] In stock? No goes to Create backorder, then Await restock.
- [C10] The backorder path rejoins the main line at Pick & pack.
- [C11] Await restock can also end in Order refunded (restock window expired).
- [C12] Pick & pack flows to Order shipped, the success terminal.
- [C13] Order refunded is a separate failure terminal, visually distinct (red).
- [C14] A fraud path exists: Order valid? can flag an order into Fraud review; cleared orders continue to Charge payment; confirmed fraud ends in Order refunded.

SECONDARY:
- [S1] Dashed red marks the failure family — the edges that reject or refund (validation No, charge declined, restock window expired, confirmed fraud).
- [S2] The correction loop ("resubmitted") and the inventory No branch are NOT dashed red — they are ordinary solid flow.
- [S3] The two decisions are orange.
- [S4] Order shipped is green.
- [S5] Fraud review is violet and is entered via an exit labeled "Flagged".
- [S6] The backorder rejoin edge is labeled "stock arrived".
- [S7] The final hop is labeled "handed to carrier"; the entry arrow is labeled "new order".
- [S8] A margin note conveys that backorders rejoin the main line and refunds happen only on card decline or restock-window lapse.

## Intent-fidelity checklist

<!-- Checked against final canvas JSON + final PNG. Items marked (E1)/(E2)/(E3) are appended
by those edits. -->

- [ ] IF-01 node n1 exists, label "Order received", gray/neutral
- [ ] IF-02 node n2 exists, label "Order valid?", decision kind, orange
- [ ] IF-03 node n3 exists, label "Request correction", gray/neutral
- [ ] IF-04 node n4 exists, label "Charge payment", gray/neutral
- [ ] IF-05 node n5 exists, label "In stock?", decision kind, orange
- [ ] IF-06 node n6 exists, label "Create backorder", gray/neutral
- [ ] IF-07 node n7 exists, label "Await restock", gray/neutral
- [ ] IF-08 node n8 exists, label "Pick & pack", gray/neutral
- [ ] IF-09 node n9 exists, label "Order shipped", green
- [ ] IF-10 node n10 exists, label "Order refunded", red
- [ ] IF-11 edge e1 n1→n2 labeled "new order", solid
- [ ] IF-12 edge e2 n2→n4 labeled "Yes", solid
- [ ] IF-13 edge e3 n2→n3 labeled "No", solid at build
- [ ] IF-14 edge e4 n3→n2 labeled "resubmitted", solid — direction is back INTO the decision
- [ ] IF-15 edge e5 n4→n5 labeled "charged", solid
- [ ] IF-16 edge e6 n4→n10 labeled "charge declined", solid at build
- [ ] IF-17 edge e7 n5→n8 labeled "Yes", solid
- [ ] IF-18 edge e8 n5→n6 labeled "No", solid
- [ ] IF-19 edge e9 n6→n7 labeled "queued", solid
- [ ] IF-20 edge e10 n7→n8 labeled "stock arrived", solid
- [ ] IF-21 edge e11 n7→n10 labeled "restock window expired", solid at build
- [ ] IF-22 edge e12 n8→n9 labeled "handed to carrier", solid
- [ ] IF-23 every decision exit carries a legible Yes/No chip visually associated with its edge (PNG check)
- [ ] IF-24 sticky a1 present in the margin adjacent to the refund side, gist = rejoin/refund conditions
- [ ] IF-25 no sections exist; non-terminal, non-decision nodes are neutral gray
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content (nodes/sections/edges beyond spec + declared substitutions)

## Follow-up edits

<!-- 3 edits, each its own agent session, run in order, each accepted before the next. -->

### E1 — add the fraud-review branch

Instruction (verbatim):

> Add a fraud path without disturbing anything that's already there. Order valid? gets a
> third exit labeled "Flagged" into a new Fraud review node — make the node and all three
> fraud arrows violet so the family reads as one flow. Cleared orders leave Fraud review and
> rejoin at Charge payment labeled "cleared"; confirmed fraud leaves Fraud review into the
> existing Order refunded terminal labeled "confirmed fraud". The existing branches keep
> their geometry — if you must shift a neighbor to open a corridor, keep it minimal and say
> so in your summary.

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 node n11 exists, label "Fraud review", violet
- [ ] E1-02 edge e13 n2→n11 labeled "Flagged", solid, violet
- [ ] E1-03 edge e14 n11→n4 labeled "cleared", solid, violet
- [ ] E1-04 edge e15 n11→n10 labeled "confirmed fraud", solid, violet
- [ ] E1-05 all pre-existing labels, styles, and colors survive verbatim (spot-check e2/e3 Yes/No, the red/green terminals, the sticky text)

Stability invariants (ES):
- [inv] n1–n10 and a1: no undeclared move > 16px; any declared make-room shift is minimal and named in the commit summary
- [inv] e1–e12: endpoints, labels, styles, colors unchanged; no edge rerouted through a visibly different corridor except where the new branch's corridor plainly requires it (declared)
- [inv] the Yes and No exits of n2 keep their existing labeled geometry — adding the third exit may not reshuffle the first two
- [inv] the feedback edge e4 keeps its corridor
- [inv] no existing node is resized, restyled, or relabeled
- in-scope objects: n11 (new), e13/e14/e15 (new), plus declared minimal make-room neighbors only

### E2 — restyle the failure family

Instruction (verbatim):

> Now mark the failure semantics: every edge that rejects or refunds goes dashed and red —
> that's the No branch out of Order valid?, "charge declined", "restock window expired", and
> "confirmed fraud". Labels stay exactly as they are. Leave the "resubmitted" return edge
> and the In stock? No branch alone — those are normal flow, not failures. This is styling
> only: nothing moves, nothing gets relabeled, no edge is added or removed.

Fidelity checks (append to the running IF checklist):
- [ ] E2-01 e3 now dashed, red, still labeled "No", same endpoints n2→n3
- [ ] E2-02 e6 now dashed, red, still labeled "charge declined", same endpoints
- [ ] E2-03 e11 now dashed, red, still labeled "restock window expired", same endpoints
- [ ] E2-04 e15 now dashed, red, still labeled "confirmed fraud", same endpoints
- [ ] E2-05 e4 ("resubmitted") and e8 (In stock? "No") are UNCHANGED — still solid, original color
- [ ] E2-06 the restyle landed as updates to the existing connections — no duplicate edges added alongside the originals, none deleted-and-recreated with lost labels

Stability invariants (ES):
- [inv] zero geometry changes: every object (11 nodes + a1) byte-identical in position and size
- [inv] connection count identical pre/post; no connection's endpoints or route changed
- [inv] only e3, e6, e11, e15 differ, and only in style/color
- [inv] all fifteen edge labels byte-identical
- in-scope objects: e3, e6, e11, e15 (style/color channel only)

### E3 — THE NUDGE PROBE: clear the rejoin corridor

Instruction (verbatim):

> Small surgical fix: move Await restock down about 40px so its "stock arrived" label
> clears the Pick & pack corridor. Touch nothing else — same size, same color, same labels,
> every other box and arrow exactly where it is.

Fidelity checks (append to the running IF checklist):
- [ ] E3-01 n7 moved downward by roughly 40px (32–48px accepted — geometry snaps to the 16px grid; judge intent, not pixel-exactness)
- [ ] E3-02 n7 horizontal drift ≤ 16px; size, color, label unchanged
- [ ] E3-03 e9, e10, e11 still attach to n7 with correct endpoints, labels, and styles; their reroutes are the minimal consequence of the move
- [ ] E3-04 the "stock arrived" chip sits clear of the Pick & pack corridor in the final PNG

Stability invariants (ES — extra tight; everything except the named object is frozen):
- [inv] every object except n7 (all other nodes + a1) byte-identical in position, size, style, label
- [inv] every connection not incident to n7 (e1–e8, e12–e15) byte-identical: endpoints, route, label, style, color
- [inv] e9/e10/e11 keep endpoints, labels, styles, colors — only their routed geometry may change, minimally
- [inv] no objects or connections added or removed
- [inv] E2's dashed-red restyle survives untouched (fought-for property)
- in-scope objects: n7 only (plus the minimal reroute of its three incident edges)

## Grading notes

- Known trap — decision shape: the round-1 corpus established that `type: "decision"`
  renders as a rounded rectangle in both renderers; no diamond glyph exists
  (v4r1-flowchart, Round-2 change #2). The instruction deliberately asks for "decisions",
  not diamonds — do not penalize the missing diamond shape on any axis, and do not credit
  an agent for failing to attempt one.
- Known trap — E3 is the round-1 nudge killer: the old system abandoned 20px-class nudges
  outright after inventing `nudge=(-32,24)` syntax, and v3's small-fix session moved all 13
  objects (findings-flowchart S4/S6). ES here is scored on surgical execution, not on
  whether the clearance was cosmetically necessary at run time — if the label already
  cleared the corridor, a correct ~40px move with everything else frozen still scores 10.
  A whole-board re-solve for this ask is the ES-2 anchor class.
- Known trap — E2 restyle-by-duplication: v3's restyle probe watched for restyles landing
  as duplicate addConnection edges instead of updates to existing connections
  (V3-TRIAL-PROTOCOL S3). E2-06 owns this; a duplicated edge also corrupts IC (a blind
  reader sees two parallel arrows).
- Failure-family discrimination: E2 deliberately excludes e4 and e8. Over-applying the
  restyle to them is an E2-05 failure and an ES violation (out-of-scope restyle) — this is
  the probe's discrimination edge, judges should check it explicitly.
- Feedback + rejoin routing: this genre's round-1 composition failures were board-spanning
  edge sweeps (~900px, findings-flowchart S2) and merge edges piling onto a shared face at
  the rejoin point (S1 Pack & ship). n8 takes both e7 and e10 — watch that the two arrivals
  read separately. SQ sub-checks 5/7 own these; they are not IF failures unless a label
  becomes illegible.
- Junction machinery: waypoint/junction objects invented for routing count against IF-NEG-2
  unless declared in a commit summary; their visual leakage (crosshair glyphs, arrowheads
  into waypoints) is SQ's business. Do not double-penalize a single declared substitution
  across IF and PH — declared honesty is credited in PH per axes/ph.md.
- Sticky adjacency: instruction places a1 "next to the refund side" — presence + margin +
  gist is IF-24; whether it hugs the refund flow the way references keep annotations
  adjacent is SQ.
