# v5 round 2 — nested architecture

Canvas: eval-v5-nested-arch · Sessions run: 3 (S1 build, S2 readability probe, S3
structural edit — same battery and instructions as Round 1) · Date: 2026-07-22 · Harness:
:4820 v5 (5 graph lints; full `<style_guide>` [9 topics] + `<board_state>` injected at
spawn; every apply_ops returns DELTA + LINTS delta + an auto close-up render) · Baseline:
`v4r1-nested-arch.md`.

Reference anchoring was repeated during recovery: gc-decomp-harness (bar ≈7.5) and
intent-classification-2 (≈7) were rendered at 2800px and viewed beside all three stage renders
and the final Studio render. All scores below are side-by-side judgments against those images,
not absolute ratings. The recovered final Studio SVG is byte-identical to the interrupted
executor's saved final SVG; its 2800px PNG is in the session scratchpad
(`v5r2-nested-arch/final-committed.png`).

Recovery/materialization audit: every session was already `accepted`; none was rejected and no
accept call was repeated. S3's 18/18 proposed effects were present in the live document, and a
canonical comparison of the full live canvas against the interrupted executor's expected final
document matched exactly (26 objects, 12 connections). Therefore S1 → S2 → S3 was already
materialized; no recovery PUT and no new harness session were needed.

## Sessions

### S1 — build: Production VPC with Edge, Services, Data and 10 labeled flows
- session/container: ebf21ed7-4058-478e-a156-f2ee87d0d265 /
  30726cf0-5ba7-5825-a52b-7797bd2a2ee7
- outcome: committed → accepted → already materialized; 30 turns, ~7.9 min, 0 tool errors.
- tool sequence: board ×4, apply_ops ×19, render_draft ×6, commit. Accepted op mix:
  addObject 14, addConnection 10, updateObject 1 (25 ops).
- what landed: the requested nested VPC and three tinted groups; distinct blue REST, orange
  dashed event and teal data channels; every requested label; a left-margin sticky; and a
  visually emphasized Event Bus. The first build already has far more reference-board grammar
  than v4 S1: tint does the grouping, color carries semantics, and the node registers are clear.
- lint story: frame-balance correctly saw the nearly empty two-object seed board, then dissolved
  during construction. The edge batch produced a 25-finding wall: 18 covered-content errors,
  four covered-content warnings and three broken-edges warnings (anti-parallel/co-linear
  routes). The agent iterated until diagnostics were clean, but needed 19 apply_ops calls and
  ultimately introduced two 32px Event Bus port dots as a router workaround. The lint feedback
  prevented the v4 chip strikes, but optimized the drawing toward scaffolding instead of toward
  direct semantic edges.
- aesthetic (anchored): **6.0** — clearly above v4 S1's 5: readable colored channels, strong
  tint hierarchy and a useful note. It remains a full point below intent-classification-2:
  Edge and Services carry large dead interiors, async routes bunch beneath Inventory, and the
  two orange rings look like unexplained graph nodes.
- misses: both async Inventory edges are attached to tiny ellipse objects rather than directly
  to Inventory/Event Bus. The render makes those rings look attached by proximity, but the live
  graph does not preserve the requested service↔bus endpoints. No lint owns that semantic
  disconnection.

### S2 — readability probe: breathe, widen, rebalance, hug sections
- session/container: abb23b4f-8080-4ac5-bc2a-88923e478f1a /
  ba78c93d-4863-5fe0-8781-cb86c2c9fe46
- outcome: committed → accepted → already materialized; 17 turns, ~6.25 min, 0 tool errors.
- tool sequence: board, apply_ops ×7, render_draft ×8, commit. Accepted op mix: updateObject 15,
  addObject 1 (the new Messaging section); topology and semantic colors otherwise preserved.
- what changed: Edge tightened around its two nodes; Services became a cleaner single register;
  Data was pulled into a deliberate lower band; Event Bus gained a labeled Messaging frame.
  This is a real reference chase, not uniform inflation, and it makes the architecture read at a
  glance.
- lint story: the first rebalance exposed four covered-content errors and one broken-edges
  warning. Subsequent deltas repeatedly found covered-content and co-linear/border-hug cases,
  plus one unreadable-labels warning at the raised label floor. All were heeded; the session
  ended clean. The visual cost is that the original two port dots survived inside the now more
  prominent Messaging frame.
- aesthetic (anchored): **6.5** — a +0.5 improvement over S1 and equal to v4 S2. Corridors and
  deliberate frames approach the ≈7 anchor; the event cluster is still mechanically routed and
  materially less calm than either reference.

### S3 — structural edit: add Notifications with two Event Bus consumes
- session/container: 063f3a29-211d-4288-9b33-35aba7587b7c /
  c04b6f5b-0925-5aab-8a65-13fddd1efa73
- outcome: committed → accepted → already materialized; 49 turns, ~9.7 min, 0 tool errors.
- tool sequence: board ×8, inspect, apply_ops ×36, render_draft ×3, commit. Accepted op mix:
  addObject 9, addConnection 2, updateObject 3, updateConnection 4 (18 ops).
- what landed: Notifications is correctly colored and aligned as the fourth Services card; both
  requested orange dashed labels are visible; existing colors, labels and nodes remain. But eight
  of the nine added objects are 32px routing ellipses. Together with S1's two, the final board has
  **10 visible port dots**.
- lint story: covered-content dominated the session (89 positive events in incremental lint
  deltas, including repeats as routes oscillated); broken-edges added one. The agent repeatedly
  moved routes and dots, got from five errors to warnings only, and explicitly shipped W1 because
  the existing `order.created` chip remains within 16px of the Inventory read/write path. A fresh
  diagnostic run on the recovered live document reproduces exactly that single warning.
- semantic miss: the two new consume connections are
  `notifications-*-bus-port → notifications-*-port`, not Event Bus → Notifications. S3 also
  rewired three existing event connections to ellipse endpoints. The picture suggests contact;
  the graph says otherwise. This violates the instruction to preserve existing edges and the
  style guide's ban on relay/port scaffolding while passing the final lint gate.
- aesthetic (anchored): **6.0** — Notifications improves the Services register, but the central
  Messaging area becomes a diagram-within-the-diagram: 10 rings, several short dashed stubs and
  six nearby chips. gc-decomp keeps much greater edge density without making routing furniture
  the focal point. Delta vs v4 S3: **+0 on score** (both 6.0); v5 has better grouping/color, but
  the routing workaround cancels the gain.

## Final board vs Round-1 board (both anchored to the same references)

The v5 final is more legible at the macro level than v4: tint hierarchy is immediate, the four
service cards form a clean register, semantic colors are consistent, and every required label is
visible. At the micro level it regresses into 10 routing rings and four event flows whose stored
endpoints are not the requested services/hub. The result is **v5 final ≈6.0 vs v4 final ≈6.0,
about 1 point below intent-classification-2 and 1.5 below gc-decomp**. The v5 architecture solved
label collision perception but did not constrain the kind of fix it incentivized.

## Lint-efficacy table (5 lints, all three transcripts)

`apply_quickfix` was not used. There were no overrides and the commit gate did not block; S3
committed with one warning disclosed in its summary.

| lint | fired | heeded? | correct? | verdict |
|---|---|---|---|---|
| covered-content | **all stages**; S1's first edge batch alone: 18E + 4W; incremental positive events S1/S2/S3: 63/24/89 (repeated geometries included) | yes, usually next turn; S3 needed 36 apply_ops and shipped one W | the chip/line and chip/chip contacts were real; final W1 is visually close but readable | **WORKING but destabilizing** — it catches the v4 blind spot, yet local reroute pressure can oscillate for dozens of turns and rewards extra routing objects |
| containment | 0 | — | all visible nodes remained within their intended frames | WORKING-idle; it does not reason about whether a tiny endpoint object is a legitimate child of the architecture |
| broken-edges | all stages (incremental positive events 4/7/1) | yes, but chiefly via port-dot workarounds | the anti-parallel, co-linear and border-hug fires were real | **MISCALIBRATED / BLIND to semantic detachment** — it should flag tiny unlabeled ellipse endpoints that merely touch a service/hub by proximity. S3 ends with four requested flows terminating on routing dots and passes |
| unreadable-labels | S2 ×1 | heeded | correct raised-floor warning; S1/S3 chips have enough text-length corridor even where the center is visually busy | WORKING; geometry-only label floors cannot prevent a routing-furniture thicket |
| frame-balance | S1 seed ×1 | dissolved during build | correct but noisy on a two-object seed | WORKING, minor calibration: suppress before meaningful construction; correctly silent on S2/S3 |

## Style adherence (did behavior follow each topic unprompted?)

| topic | verdict | evidence |
|---|---|---|
| Spacing and corridors | PARTIAL | S1/S2 establish generous macro corridors; S3 compresses six event chips into the central Messaging corridor |
| Grid discipline | FOLLOWED | accepted geometry stays on the 16px grid; no snap-cleanup pass was needed |
| Section framing | FOLLOWED | Edge, Services, Messaging and Data hug their content deliberately after S2; the VPC provides a stable outer frame |
| Registers and rhythm | FOLLOWED | Services is a flat four-card row and Data is a flat two-card row in the final board |
| Fan composition | PARTIAL | fan labels remain readable, but bus fan-out is implemented through ten visual relay points rather than direct edges |
| Color semantics | FOLLOWED | REST blue, async orange/dashed, data teal, service identities and tints all survive S3 |
| Connectors and labels | **NOT FOLLOWED** | the guide's no relay/port/junction-scaffolding rule is violated 10×; all 12 final connections omit explicit anchors; four event edges have routing ellipses as semantic endpoints |
| Tree edge entry | n/a | no hierarchy tree |
| Lanes and corridors | PARTIAL | clear macro bands, but the Messaging lane is an unresolved knot |

Core v5 hypothesis check: the style guide clearly improves first-pass tint, color and register
craft, while the lints reliably expose text collisions. This genre also supplies the sharpest
counterexample: per-turn perception without a semantic-endpoint invariant optimizes the visible
lint surface and can corrupt graph meaning. “Clean” is not sufficient when the fix introduces
untyped routing nodes.

## Top 3 changes for Round 3

1. **Add a routing-scaffold/semantic-endpoint guard to broken-edges.** Flag an edge whose endpoint
   is a tiny unlabeled ellipse (or any routing-only object) visually touching but not connected to
   the intended node. Grounding: 10 rings in the final board; four requested bus/service flows are
   stored as dot→dot or dot→dot-adjacent connections, yet only one unrelated proximity warning
   remains.
2. **Bound covered-content repair thrash.** After the same finding family reappears for 3–4
   successive route edits, prompt for a structural lane/anchor solution and reject new relay
   objects unless the user requested them. Grounding: 36 apply_ops and 89 positive lint events in
   S3 to add one service and two edges.
3. **Teach and enforce proactive connection anchors.** All 12 final connections omit anchors even
   though correct faces are knowable from the architecture bands. Explicit faces would eliminate
   much of the ring scaffolding and preserve real service↔hub topology.
