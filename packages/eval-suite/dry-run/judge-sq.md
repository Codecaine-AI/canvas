# SQ dry-run grades — 2026-07-22 (independent judge session)

Judge: Static Quality axis only, per `packages/eval-suite/axes/sq.md` (then the single-file `axes.md`). Inputs: the two
reference PNGs plus the five board PNGs. Nothing else read.

## Calibration

**gc-decomp-harness = 7.5.** Seven tinted regions each do real grouping work
(Runner+Agent Loop, Score gate, Knowledge, PR handoff, State substrate, Surfaces), with
labeled colored corridors keeping one hue per flow family (pink knowledge, orange
PR/slices, teal state, red process-health, purple toolpack) and margin annotations parked
cleanly at the left. Density variation reads deliberate — a dense runner core against
airy handoff columns — registers hold, every chip owns air, and there is zero routing
machinery anywhere on a board this heavily wired.

**intent-classification-2 = 7.0.** The same virtue set at smaller scale: two tinted
panels grouping the alternative designs, semantic shape/color conventions (blue classify
pentagons, purple intent triangles, yellow context cards, teal handlers), clean tree
drops with no crossings and no machinery. The large empty band across the lower half of
both panels and the top-heavy free-floating intake cluster are the imbalance that keeps
it half a point under gc — plus a minor text-wrap blemish ("Subscriptio ns").

Ref re-scores this session: gc 7.5, intent 7.0 — no CAL-DRIFT.

---

## eval-v4-flowchart — SQ **6.5**

**Delta (vs intent-classification-2, 7.0):** The reference fills its panels edge-to-edge
with a balanced two-column composition, while the flowchart leaves the bottom ~40% of
the locked frame plus the lower halves of both large sections dead and lets the
"No"/"Corrected" chips pile up at a shared bend.

- Frame use: **FAIL-ish** — content packed to the top band; bottom ~40% of frame empty, big hollow lower-left in Order validation.
- Corridors & air: good — stages readable at arm's length, chips own air.
- Grouping: good — three tinted sections (validation/payment/fulfillment) do real work.
- Color: good — semantic and consistent (red-dashed failure, green success, orange retry/correction, purple fraud-assess).
- Machinery leakage: minor — no crosshairs, but the "No" chip collides with "Corrected" at the valid?-branch elbow.
- Alignment & rhythm: decent — main spine on register; Fulfillment strip reads slightly bolted-on at top right.
- Edge legibility: good — one long No-corridor up the right of Payment, but clean and unambiguous.

## eval-v4-state-machine — SQ **6.0**

**Delta (vs intent-classification-2, 7.0):** The reference shows zero routing machinery
with every edge running box-to-box, while this board terminates its red timeout edges
into crosshair waypoint glyphs, leaves the heartbeat badge floating unanchored, and does
its grouping by proximity only — no tinted region anywhere.

- Frame use: **FAIL** — bottom ~40% of the locked frame empty; mass in the upper half (the rubric's named example of this miss).
- Corridors & air: strong — the board's best trait; every chip breathes.
- Grouping: **FAIL** — no sections/tints; failure-cluster vs lifecycle implied only by position.
- Color: good — red=failure, purple=suspend family, teal=teardown, gray=happy path.
- Machinery leakage: **FAIL** — two red crosshair junction glyphs plus a gray one; dashed arrows terminating into waypoints; floating "heartbeat / 30s" badge.
- Alignment & rhythm: fair — main register holds, but Degraded/Suspended/Reconnecting scatter without a shared register.
- Edge legibility: fair — "socket closed" runs a long low marathon; recovered/packet-loss elbows near the junction glyphs get murky.

## eval-v4-swimlane — SQ **6.0**

**Delta (vs intent-classification-2, 7.0):** The reference's edges are short, clean tree
drops with zero ambiguity, while the swimlane's async dashed lines run border-hugging
marathons up the right edge ("status", "write") and tangle into a congested dashed
corridor between the Data and Observability lanes.

- Frame use: fair — lanes span the full width, but a dead band sits under the Workers lane and the lower frame.
- Corridors & air: fair — boxes breathe inside lanes; the inter-lane gutters are traffic jams.
- Grouping: strong — five tinted lanes doing exactly the grouping work the genre demands.
- Color: good — dashed-orange=async vs solid=sync is declared on the sticky and held; blue/green accents consistent.
- Machinery leakage: minor — no crosshairs, but "spans"/"poll"/"status"/"write" chips float at the frame border far from mid-edge, reading semi-orphaned.
- Alignment & rhythm: good — in-lane registers hold cleanly.
- Edge legibility: **FAIL** — perimeter mega-runs on the right edge, multiple dashed crossings, near-parallel dashed runs in the poll/spans gutter.

## eval-v4-org-tree — SQ **7.0**

**Delta (vs intent-classification-2, 7.0):** Level with the reference — it matches the
tints-zero-machinery-clean-registers virtue set, and its flaw is the same one: where the
reference spends its vertical space on real branching depth, the org-tree's sections are
mostly hollow air between the VP register and the team register, plus a dead lower
frame.

- Frame use: fair — full width used; tall empty band inside every section and dead space below content.
- Corridors & air: strong — every box and chip owns clear air.
- Grouping: strong — five tinted department sections, exact membership, legible titles.
- Color: good — restrained by design (blue VPs, gray teams) with the one exception, the orange dashed "acting" line, carrying real meaning; restraint is not monotony.
- Machinery leakage: clean — zero glyphs; sticky annotation properly parked in the margin.
- Alignment & rhythm: strong — VP register and leaf register both hold across all five sections.
- Edge legibility: good — single deliberate dashed crossing ("acting"); the CEO trunk's twin outer branches hook slightly awkwardly into section tops, a nit not a fault.

## eval-v4-nested-arch — SQ **5.5**

**Delta (vs intent-classification-2, 7.0):** The reference binds every edge directly to
its boxes, while this board interposes a floating column of PUBLISH/CONSUME/DATA/CACHE
pills between the services and their wires — reading as orphaned badges — and routes
duplicate-labeled dashed detours (order.created appears three times) through a congested
corridor to the bus.

- Frame use: **FAIL** — large dead zones in the VPC frame right-of-Edge, below Services, and most of the Data section; Postgres floats with no visible attachment.
- Corridors & air: fair — boxes have air, but the pill column and the Services→Bus corridor are crowded.
- Grouping: good — nested VPC > Edge/Services/Data tinting is real and legible.
- Color: good — blue REST, dashed-orange events, teal data paths; consistent.
- Machinery leakage: **FAIL** — the eight-pill port column reads as orphaned floating badges; dashed wires hop pill-to-pill and merge ambiguously near the CONSUME stack.
- Alignment & rhythm: fair — service boxes off-register (Inventory indented, Billing/Notifications staggered) without a deliberate read.
- Edge legibility: **FAIL** — anti-parallel dashed runs, thrice-repeated edge labels, and an Inventory service whose inbound wiring is genuinely hard to trace.

---

## Rank-order sanity check

Gut ranking, best → worst: **org-tree > flowchart > state-machine ≈ swimlane > nested-arch**.

Scores agree: 7.0 > 6.5 > 6.0 = 6.0 > 5.5. The state-machine/swimlane tie survives
scrutiny — the state-machine has explicit machinery (crosshairs, floating badge) and no
grouping but clean corridors; the swimlane has exemplary grouping but the worst edge
discipline of the two — different failure profiles, equal severity. No reconciliation
needed. Spread is honest (5.5–7.0), no compression toward the middle: nothing here
reaches gc's finish, and only the org-tree earns parity with the weaker reference.
