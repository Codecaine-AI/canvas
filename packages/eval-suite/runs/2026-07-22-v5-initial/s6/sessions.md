# s6-org-tree — sessions (run 2026-07-22-v5-initial)

Board: `eval-suite-s6-org-tree` (2400×1600 locked `page-frame`, seeds `seed-ceo` and
`seed-vp-engineering`). The target returned 404 on the lifecycle DELETE, was recreated fresh,
and `stage-blank.json` was saved before the build. Intended sessions were strictly sequential;
every edit scope contained `page-frame` plus every then-current object id.

## stage0 — build the three-level org chart

- sessionId: `9bcf26d5-9864-4943-9b2d-9dce96b07e69`
- containerId: `73b24723-1161-5483-b177-ecf6ee26e243`
- wall time: 5m05.570s (kernel container creation to terminal `done`)
- op count: 34
- outcome: committed
- retries: 0
- commit summary (verbatim): Built the three-level poster org chart with unequal tinted subtrees, baseline-aligned teams, clean top-to-bottom reports, a margin key, and the orange dashed exception; minor flaw: the exception briefly shares Engineering’s vertical trunk before branching.

## discarded runner-error session before e1

- sessionId: `bc550f3a-5e45-43e4-b446-59ef4a548e81`
- containerId: `193d8a69-ec9f-512b-bf16-9913f540d074`
- wall time: 3m02.226s (kernel container creation to terminal `done`)
- op count: 21
- outcome: rejected
- retries: 0
- commit summary (verbatim): Moved Growth under VP Engineering, added Brand Studio under VP Design, kept all teams on one baseline, centered each fan and the CEO, and set four equal 32px panel gutters; no remaining diagnostics.
- rejection note: The runner's first E1 extractor accidentally concatenated the E1, E2, and E3 fixture instructions. The session was rejected immediately and again after its still-running kernel produced a proposal; none of its operations were materialized. The live canvas was verified byte-identical to `stage0.json` before the corrected E1 session began.

## e1 — move Growth to Engineering

- sessionId: `e2ac3786-5f1c-4927-bb70-32fda14b4223`
- containerId: `4912e2e6-71a0-5592-a882-4e33dd2e06d1`
- wall time: 2m13.972s (kernel container creation to terminal `done`)
- op count: 11
- outcome: committed
- retries: 0 harness retries (one runner-side replacement followed the malformed session above)
- commit summary (verbatim): Moved Growth into the widened Engineering panel, rewired its solid report to VP Engineering, tightened Product, and kept all nine teams baseline-aligned with each VP centered; no remaining flaws.
- materialization note: Accept succeeded, then a reusable helper in another scenario directory disappeared before it could apply the patch. Recovery verified that the live board still matched stage0, applied the same 11 accept-response operations exactly once, PUT the result, and verified the E1 effects. Studio supplied the omitted default `arrow: "forward"` field on the new connection.

## e2 — add Brand Studio under Design

- sessionId: `d5025611-c8c5-49c3-9a69-d30139a60492`
- containerId: `5965b046-2841-58bb-98db-0604136e6e38`
- wall time: 58.319s (kernel container creation to terminal `done`)
- op count: 8
- outcome: committed
- retries: 0
- commit summary (verbatim): Added Brand Studio beside Design Systems with a solid gray VP Design report, widened and re-centered the Design fan, shifted Operations right as a unit, and left the dotted-line endpoints untouched; no remaining flaws.
- materialization note: PUT/GET semantic deep equality was verified. An initial raw-string comparison reported only JSON object-key ordering, not a document difference.

## e3 — equalize the panel gaps

- sessionId: `e1e0f504-e48e-4c58-bac5-18e8e139ee77`
- containerId: `ae4d4c8d-eef2-547b-ba6f-df0e0d552624`
- wall time: 49.149s (kernel container creation to terminal `done`)
- op count: 1
- outcome: committed
- retries: 0
- commit summary (verbatim): Kept the four rigid panels on their existing equal 32px gutters and re-centered the CEO over the outer VP row; no other geometry or styling changed.

## Run notes

- All four intended sessions reached terminal `done`, were accepted, and were materialized. No session hit the stuck-`render_draft` signature, no stage was invalidated by infrastructure, and no harness retry was needed.
- The reject endpoint did not cancel the malformed session's underlying kernel run. The runner waited for its container to reach `done` before starting corrected E1, preserving the one-in-flight rule.
- Final live-canvas canonical SHA-256 matched `e3.json`. The final board has 22 objects and 15 connections; E3 changed only `seed-ceo.geometry.x` (1184→1296). Panel gutters are 32/32/32px.
- `qlmanage` was unavailable as documented. Stage PNGs were rendered from the exact Studio preview SVGs with the repository's `@resvg/resvg-js` at 2800px width; all four are 2800×1925 and were visually inspected.
- Accepted-output note for later judges: the board is not wrecked, but the committed JSON has no explicit top/bottom anchors, and the dashed exception connection is stored as VP Engineering → Design Systems with its visible label in a separate object. The preview also renders the short labels `CEO` and `IT` as glyph-like artifacts even though the JSON text values are correct.
