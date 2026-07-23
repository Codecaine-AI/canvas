# s4-swimlane — sessions (run 2026-07-22-v5-initial)

Board: `eval-suite-s4-swimlane` (2400×1600 locked `page-frame`, seeds
`seed-submit-form` + `seed-parse-request`). Recreated fresh via DELETE + POST at
19:40 CDT; `stage-blank.json` was snapshotted before any session. Harness `:4820`,
studio `:4000`. Sessions ran strictly sequentially; the build scope was `page-frame`
plus both seed IDs, and every edit scope contained all then-current object IDs.

## stage0 — build the request-processing swimlane pipeline

- sessionId: `1ed11010-03f8-44b1-aacf-fd4e13e1fbe2`
- containerId: `9d7dde34-8a6b-5644-bf22-8274c314adf7`
- started: 2026-07-22 19:40:13 CDT
- wall time: 6m03s
- op count: 34
- outcome: committed
- retries: 0
- commit summary (verbatim): Built the four tinted swimlanes, complete sync/async flows, aligned handoff columns, legend, and summary; remaining flaw: the auto-router sends the long dashed status edge along the right-side corridor.

## e1 — insert the Observability lane

- sessionId: `0be99ae4-5b88-483c-852e-d8150b96401b`
- containerId: `6dc6b0c8-bbaf-59c0-aa40-a6009c461d36`
- started: 2026-07-22 19:47:35 CDT
- wall time: 53s
- op count: 10
- outcome: committed
- retries: 0
- commit summary (verbatim): Added a full-width muted-gray Observability lane between Data and Workers, expanded the frame downward, added Trace Requests and Collect Metrics, and connected both requested dashed gray taps; diagnostics are clean.

## e2 — add the cache-hit shortcut

- sessionId: `db948497-0ab2-4bb7-affa-0c7227399214`
- containerId: `336020cb-820e-51ba-ac7d-c3f22f2171ac`
- started: 2026-07-22 19:49:31 CDT
- wall time: 24s
- op count: 1
- outcome: committed
- retries: 0
- commit summary (verbatim): Added only the dashed gray “cache hit” edge from Auth Check to Render Result, routed through the existing API–Frontend corridor; no existing objects or edges changed.

## e3 — tighten the lane gaps

- sessionId: `c4cb60a3-c6cb-4357-a87b-ab01b01c3ecd`
- containerId: `cc67e01b-2171-5741-b3a5-8400692e6cab`
- started: 2026-07-22 19:51:09 CDT
- wall time: 39s
- op count: 15
- outcome: committed
- retries: 0
- commit summary (verbatim): Closed all inter-lane gaps from 64px to 32px, moving each lane’s contents with it while preserving horizontal layout and clear label space; no remaining flaws.

## Run notes

- Harness anomalies: none. All four sessions reached `proposal-ready`, were accepted,
  and now report `accepted`; no retry, rejection, abandonment, timeout, NUL parse issue,
  or hanging `render_draft` call occurred.
- Materialization verification: every accepted patch was applied once through the canvas
  reducer and PUT to Studio, then checked by a fresh GET. Initial strict comparisons on
  stage0/E1/E2 reported false mismatches after successful PUTs because Studio normalizes
  serialized documents and supplies connection defaults such as `arrow: "forward"`;
  immediate live-state checks confirmed the operations were already present, so none was
  replayed. Final counts are 23 objects and 18 connections.
- E2 is an exact one-connection diff from E1: all objects and annotations are byte-identical,
  and the only added connection is dashed gray `cache hit` from Auth Check to Render Result.
- E3 changed geometry on exactly 15 objects, preserved every x-coordinate and all connection
  and annotation bytes, and reduced all four inter-lane gaps from 64px to 32px.
- Snapshot renderer anomaly: `qlmanage` is unavailable in the sandbox as expected. The exact
  Studio preview SVGs were rasterized with the repository's `@resvg/resvg-js` dependency at
  2800px width; stage0 is 2800×1925 and e1/e2/e3 are each 2800×2240.
