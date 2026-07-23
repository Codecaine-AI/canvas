# s2-branching-flowchart — sessions (run 2026-07-22-v5-initial)

Board: `eval-suite-s2-branching-flowchart` (2400×1600 locked `page-frame`).
Harness `:4820`, studio `:4000`. Sessions within the scenario were strictly sequential.
The interrupted executor had already materialized stage0 and accepted e1; this continuation
recovered e1's accepted proposal, materialized it, and then ran e2 and e3.

## stage0 — build order-fulfillment flow

- sessionId: `b7be6217-7b2f-4c95-833d-d89afc92112b`
- containerId: `6b2d2cf8-bcd5-5770-8527-85fe9597700b`
- wall time: 261s
- op count: 23
- outcome: committed
- retries: 0
- commit summary: Built the labeled order-fulfillment flow with orange decisions, green/red terminals, a clear backorder rejoin, and the refund margin note; the correction return uses a labeled arrow-shape because anti-parallel routed connectors overlap.

## e1 — add the fraud-review branch

- sessionId: `f3d927d4-448a-473d-bad8-d0701536451f`
- containerId: `cab0d1ed-b9d7-5f67-a967-4cfa6cbe8eb6`
- wall time: 225s (reconstructed from the kernel trace timestamps)
- op count: 4
- outcome: committed
- retries: 0
- recovery note: The prior executor called accept but died before applying the returned operations. The live board still matched stage0, so this continuation recovered `.proposal.operations` from the accepted session, applied the same four operations once, PUT the document, and verified the four new IDs.
- commit summary: Added the violet Fraud review flow with Flagged, cleared, and confirmed fraud labels; no existing node moved, though cleared shares Charge payment’s short final entry segment.

## e2 — restyle the failure family

- sessionId: `f11eee5d-f3eb-4995-9312-13ae4a6d4e37`
- containerId: `7a0f76bd-25dc-53c2-ab0b-57432ff67649`
- wall time: 16s
- op count: 4
- outcome: committed
- retries: 0
- commit summary: Marked the four rejection/refund edges dashed red, preserving all labels and leaving the resubmitted and In stock? No flows unchanged; no remaining flaws.

## e3 — nudge Await restock

- sessionId: `f53b2467-5114-4732-b704-d013082637bd`
- containerId: `1c8c25d6-eaaf-594e-8691-99913aa98ac5`
- wall time: 20s
- op count: 1
- outcome: committed
- retries: 0
- commit summary: Moved only “Await restock” down 48px—the nearest 16px-grid move to about 40px—without changing its size, color, or labels.

## Run notes

- No stage was rejected, abandoned, or invalidated by infrastructure; no harness retry was needed.
- E2 changed only `edge-valid-no`, `edge-charge-declined`, `edge-restock-expired`, and `edge-fraud-confirmed`; object geometry and connection count were unchanged.
- E3 changed only `await-restock` (`x` unchanged, `y` +48px); all connections were byte-identical and E2's dashed-red styling survived.
- `qlmanage` could not initialize its macOS sandbox in this executor. The continuation rendered e1–e3 from the same preview SVGs with the repo's `@resvg/resvg-js` renderer at 2800px width, then padded them to the suite's 2800×2800 thumbnail dimensions.
