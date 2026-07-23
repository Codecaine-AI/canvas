# ES — Edit Stability

- Scenario: `s4-swimlane`
- Run: `2026-07-22-v5-initial`
- Per-edit scores: E1 **10/10**, E2 **10/10**, E3 **10/10**
- Mean ES score: **10/10**

## E1 — Insert the Observability lane

### In-scope classification

- Existing objects in scope: `page-frame` (height only), `lane-workers`, `workers-pick-up-job`, `workers-process-data`, and `workers-write-results` (rigid vertical make-room translation).
- Requested additions in scope: `lane-observability`, `observability-trace-requests`, `observability-collect-metrics`, `edge-parse-trace-tap`, and `edge-process-metrics-tap`.
- Existing connection routes in scope: `edge-queue-pick`, `edge-write-resultsdb`, and `edge-process-status`, because they cross the insertion gap.
- Existing objects out of scope: `lane-frontend`, `lane-api`, `lane-data`, `seed-submit-form`, `frontend-validate-input`, `frontend-show-progress`, `frontend-render-result`, `seed-parse-request`, `api-auth-check`, `api-enqueue-job`, `api-serve-result`, `data-job-queue`, `data-results-db`, `legend-sync-async`, and `pipeline-summary`.
- Existing connections out of scope: `edge-submit-validate`, `edge-validate-progress`, `edge-progress-render`, `edge-validate-parse`, `edge-parse-auth`, `edge-auth-enqueue`, `edge-enqueue-queue`, `edge-pick-process`, `edge-process-write`, `edge-resultsdb-serve`, `edge-serve-render`, and `edge-enqueue-serve`.

### Diff, violations, and accommodations

- Authorized in-scope resize: `page-frame` height 1600→1920, magnitude **+320px**; width and origin unchanged.
- Declared make-room accommodation: `lane-workers` moved **(Δx 0, Δy +320px)**; declared by the summary's insertion between Data and Workers plus downward frame expansion.
- Declared make-room accommodations: `workers-pick-up-job`, `workers-process-data`, and `workers-write-results` each moved **(Δx 0, Δy +320px)** with no resize, restyle, relabel, or re-parenting. These are the fixture-authorized rigid-unit translation.
- Requested additions have the expected geometry and membership: Observability at `(96,1216)`, 2272×256; Trace Requests at `(752,1312)`; Collect Metrics at `(1744,1312)`.
- Every out-of-scope object is byte-identical. Every pre-existing connection record is byte-identical; only the three authorized crossing routes reflow in the viewed PNG.
- Violations: **none**.
- Undeclared accommodations: **none**.

### Invariant verdicts

1. **PASS — lane order.** The viewed E1 PNG and JSON show Frontend, API, Data, Observability, Workers; the original four retain their relative order.
2. **PASS — upper three lanes frozen.** Frontend, API, Data, every member node in them, both stickies, and their geometry are unchanged at 0px.
3. **PASS — Workers translates rigidly.** The lane and all three Workers nodes have the identical `(0,+320px)` delta; their sizes, x positions, relative offsets, and left-to-right order are unchanged.
4. **PASS — membership.** Every pre-existing `parentId` is unchanged; the two new nodes are parented to `lane-observability`.
5. **PASS — all 15 build edges preserved.** All remain present with byte-identical endpoints, direction, label, style, arrow, and color.
6. **PASS — non-gap routes stable.** Side-by-side viewing of stage0 and E1 shows the same route shapes/corridors for the upper-lane runs, enqueue→queue, database/API/Frontend returns, and the rigidly translated in-Workers runs. Only `edge-queue-pick`, `edge-write-resultsdb`, and `edge-process-status` re-route across the inserted gap, as authorized.

**E1 score: 10/10.** The diff is exactly the requested insertion plus its declared, fixture-authorized make-room translation.

## E2 — Add the cache-hit shortcut

### In-scope classification

- In scope: the single requested new connection `edge-auth-render-cache-hit` only.
- All 23 pre-existing objects are out of scope: `page-frame`, all five `lane-*` sections, `legend-sync-async`, `pipeline-summary`, `seed-submit-form`, `frontend-validate-input`, `frontend-show-progress`, `frontend-render-result`, `seed-parse-request`, `api-auth-check`, `api-enqueue-job`, `api-serve-result`, `data-job-queue`, `data-results-db`, `observability-trace-requests`, `observability-collect-metrics`, `workers-pick-up-job`, `workers-process-data`, and `workers-write-results`.
- All 17 pre-existing connections are out of scope: `edge-submit-validate`, `edge-validate-progress`, `edge-progress-render`, `edge-validate-parse`, `edge-parse-auth`, `edge-auth-enqueue`, `edge-enqueue-queue`, `edge-queue-pick`, `edge-pick-process`, `edge-process-write`, `edge-write-resultsdb`, `edge-resultsdb-serve`, `edge-serve-render`, `edge-process-status`, `edge-enqueue-serve`, `edge-parse-trace-tap`, and `edge-process-metrics-tap`.

### Diff, violations, and accommodations

- Added exactly `edge-auth-render-cache-hit`: `api-auth-check`→`frontend-render-result`, label `cache hit`, dashed, gray/muted, forward.
- All objects and annotations are byte-identical. All 17 pre-existing connections are byte-identical.
- The viewed E1/E2 PNG pair shows the new dashed cache-hit run and no other visual displacement or rerouting.
- Violations: **none**.
- Accommodations, declared or undeclared: **none**.

### Invariant verdicts

1. **PASS — zero object moves.** Every node, lane, sticky, and frame has identical position and size.
2. **PASS — pre-existing edges frozen.** All 17 retain identical records, including endpoints, labels, styles, colors, and arrows; their viewed routes are unchanged.
3. **PASS — exact one-connection diff.** There are no additions or changes besides `edge-auth-render-cache-hit`.

**E2 score: 10/10.** This is an exact one-connection edit with zero collateral change.

## E3 — Tighten the lane gaps

This is a geometry-only probe, so the fixture's topology/label/style invariants replace ordinary positional violation math.

### In-scope classification

- Vertical geometry in scope: `lane-frontend`, `lane-api`, `lane-data`, `lane-observability`, `lane-workers` and all 15 member nodes; `page-frame` height; and optional vertical tracking of `legend-sync-async` and `pipeline-summary` if declared. The Frontend group, frame, and stickies legitimately remain at 0px.
- Cross-lane route geometry in scope: `edge-validate-parse`, `edge-enqueue-queue`, `edge-queue-pick`, `edge-write-resultsdb`, `edge-process-status`, `edge-resultsdb-serve`, `edge-serve-render`, `edge-parse-trace-tap`, `edge-process-metrics-tap`, and `edge-auth-render-cache-hit`.
- Frozen/out-of-scope fields: every object's x position, dimensions other than optional frame height, text, style, color, and parent; every connection's endpoints, direction, label, style, color, and arrow; and membership of the object, connection, and annotation sets. The eight in-lane routes (`edge-submit-validate`, `edge-validate-progress`, `edge-progress-render`, `edge-parse-auth`, `edge-auth-enqueue`, `edge-enqueue-serve`, `edge-pick-process`, `edge-process-write`) may only translate with their rigid lane contents, not be reconfigured.

### Diff, violations, and accommodations

- Frontend rigid unit: `lane-frontend`, `seed-submit-form`, `frontend-validate-input`, `frontend-show-progress`, and `frontend-render-result` each move **0px**.
- API rigid unit: `lane-api`, `seed-parse-request`, `api-auth-check`, `api-enqueue-job`, and `api-serve-result` each move **(Δx 0, Δy −32px)**.
- Data rigid unit: `lane-data`, `data-job-queue`, and `data-results-db` each move **(Δx 0, Δy −64px)**.
- Observability rigid unit: `lane-observability`, `observability-trace-requests`, and `observability-collect-metrics` each move **(Δx 0, Δy −96px)**.
- Workers rigid unit: `lane-workers`, `workers-pick-up-job`, `workers-process-data`, and `workers-write-results` each move **(Δx 0, Δy −128px)**.
- `page-frame`, `legend-sync-async`, and `pipeline-summary` remain byte-identical. All 18 connection records and the annotation array remain byte-identical.
- All four gaps shrink **64px→32px**: Frontend–API, API–Data, Data–Observability, and Observability–Workers.
- The viewed E2/E3 PNG pair confirms the lanes close ranks without horizontal rearrangement or a newly crowded/stranded label chip.
- Violations: **none**.
- Undeclared accommodations: **none**. All 15 moved objects are explicitly in-scope geometry changes, not out-of-scope accommodations.

### Invariant verdicts

1. **PASS — membership byte-stable.** The same 23 objects, 18 connections, and empty annotation set remain; nothing is added, removed, restyled, or relabeled.
2. **PASS — lane order.** Frontend, API, Data, Observability, Workers is unchanged.
3. **PASS — x positions and in-lane arrangement.** Every node has Δx=0; all widths/heights and left-to-right relationships are unchanged.
4. **PASS — containment and membership.** Every `parentId` is byte-identical, and the viewed E3 PNG shows every node still fully inside its lane.
5. **PASS — rigid vertical units.** Within each lane, the section and every member share exactly one vertical delta: 0, −32, −64, −96, and −128px from top to bottom.

**E3 score: 10/10.** The geometry-only edit reduces every gap uniformly while preserving all frozen topology, labels, styles, memberships, x coordinates, and rigid in-lane arrangements.

## Mean

`(10 + 10 + 10) / 3 = 10.0`

**Final ES score: 10/10.** No cap or override applies.
