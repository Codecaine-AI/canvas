# ES — Edit Stability: s2 / 2026-07-22-v5-initial

## E1 — Add the fraud-review branch

### In-scope classification

- Objects: `fraud-review` (new n11).
- Connections: `edge-fraud-flagged` (new e13), `edge-fraud-cleared` (new e14), `edge-fraud-confirmed` (new e15).
- Declared make-room neighbors: none. The commit summary explicitly says no existing node moved.

### Out-of-scope classification

- Objects: `page-frame`; `seed-start` (n1); `seed-end` (n9); `order-valid` (n2); `request-correction` (n3); `charge-payment` (n4); `in-stock` (n5); `create-backorder` (n6); `await-restock` (n7); `pick-pack` (n8); `order-refunded` (n10); `refund-note` (a1); and `resubmitted-arrow` (the declared build-time substitute for e4).
- Connections: `edge-new-order` (e1), `edge-valid-yes` (e2), `edge-valid-no` (e3), `edge-charged` (e5), `edge-charge-declined` (e6), `edge-stock-yes` (e7), `edge-stock-no` (e8), `edge-queued` (e9), `edge-stock-arrived` (e10), `edge-restock-expired` (e11), and `edge-handed-carrier` (e12).

### Diff evidence, violations, and accommodations

- The JSON diff adds exactly one object and three connections. Every pre-existing object and connection is byte-identical.
- The stage0 and E1 PNGs were viewed. Existing node positions, the n2 Yes/No exit geometry, the feedback-arrow corridor, and the other existing connection corridors remain visually fixed while the violet branch is added.
- The stage0-to-E1 PNG pair uses visibly different font rendering, but the underlying `text` and `style` data for every existing object are byte-identical, and `sessions.md` records that E1–E3 were rasterized with the continuation's resvg path. This is a renderer difference, not a canvas restyle.
- Violations: none.
- Accommodations: none.

### Stability invariants

1. **PASS — n1–n10 and a1 movement.** All existing object geometry is byte-identical; there is no undeclared move over 16px and no declared make-room move.
2. **PASS — e1–e12 preservation.** All represented pre-existing connection records retain endpoints, labels, styles, and colors byte-for-byte. The E1 PNG shows their visible corridors preserved; the build's e4 substitution, `resubmitted-arrow`, is also unchanged.
3. **PASS — n2 Yes/No geometry.** `edge-valid-yes`, `edge-valid-no`, and `order-valid` are byte-identical, and the two chips/exits retain their existing rendered geometry.
4. **PASS — feedback corridor.** `resubmitted-arrow` is byte-identical and visually remains in the same corridor.
5. **PASS — no existing resize/restyle/relabel.** Every existing object is byte-identical in geometry, color/style, type, parent, and text.

**E1 score: 10/10.** Zero violations and zero undeclared accommodations; the diff is exactly the ask.

## E2 — Restyle the failure family

### In-scope classification

- Connections, style/color channel only: `edge-valid-no` (e3), `edge-charge-declined` (e6), `edge-restock-expired` (e11), and `edge-fraud-confirmed` (e15).
- Objects: none.

### Out-of-scope classification

- Objects: `page-frame`, `seed-start`, `seed-end`, `order-valid`, `request-correction`, `charge-payment`, `in-stock`, `create-backorder`, `await-restock`, `pick-pack`, `order-refunded`, `refund-note`, `resubmitted-arrow`, and `fraud-review`.
- Connections: `edge-new-order`, `edge-valid-yes`, `edge-charged`, `edge-stock-yes`, `edge-stock-no`, `edge-queued`, `edge-stock-arrived`, `edge-handed-carrier`, `edge-fraud-flagged`, and `edge-fraud-cleared`.

### Diff evidence, violations, and accommodations

- Both snapshots contain 14 objects and 14 connections. The only JSON changes are `color: gray|violet -> red` and `style: solid -> dashed` on the four in-scope connection IDs.
- The E1 and E2 PNGs were viewed. Geometry and labels remain fixed; exactly the specified failure family becomes dashed red. `resubmitted-arrow` and `edge-stock-no` remain ordinary solid gray flows.
- Violations: none.
- Accommodations: none.

### Stability invariants

1. **PASS — zero object geometry changes.** All 14 objects are byte-identical in position and size (and in every other field).
2. **PASS — connection count/endpoints/routes.** Connection count remains 14; all endpoints are byte-identical, and the before/after PNGs show no route change.
3. **PASS — only the named four differ.** Only e3, e6, e11, and e15 differ, and each differs only in `style` and `color`.
4. **PASS — all labels frozen.** All 14 represented connection labels are byte-identical; the build's e4 label remains byte-identical on `resubmitted-arrow` as well, covering all fifteen logical edge labels.

**E2 score: 10/10.** Zero violations and zero undeclared accommodations; the styling-only diff is exact.

## E3 — Nudge Await restock

### In-scope classification

- Object: `await-restock` (n7), vertical position only.
- Connections permitted only a minimal routed-geometry consequence: `edge-queued` (e9), `edge-stock-arrived` (e10), and `edge-restock-expired` (e11).

### Out-of-scope classification

- Objects: `page-frame`, `seed-start`, `seed-end`, `order-valid`, `request-correction`, `charge-payment`, `in-stock`, `create-backorder`, `pick-pack`, `order-refunded`, `refund-note`, `resubmitted-arrow`, and `fraud-review`.
- Connections: `edge-new-order`, `edge-valid-yes`, `edge-valid-no`, `edge-charged`, `edge-charge-declined`, `edge-stock-yes`, `edge-stock-no`, `edge-handed-carrier`, `edge-fraud-flagged`, `edge-fraud-cleared`, and `edge-fraud-confirmed`.

### Diff evidence, violations, and accommodations

- The only JSON change is `await-restock.geometry.y: 960 -> 1008`, a declared/requested +48px downward move. Its x remains 1536 and its size remains 224x112; text, type, parent, and color are unchanged.
- Every connection record is byte-identical. The E2 and E3 PNGs were viewed: only `Await restock` and the necessary incident route portions shift visually, and the `stock arrived` chip remains clear of the Pick & pack corridor.
- Violations: none.
- Accommodations: none. The +48px change is the named edit target, not an out-of-scope accommodation.

### Stability invariants

1. **PASS — all other objects frozen.** Every object except `await-restock` is byte-identical in position, size, style/color, and label.
2. **PASS — nonincident connections frozen.** e1–e8 and e12–e15 are byte-identical in all stored fields and visually retain their routes.
3. **PASS — incident-edge semantics preserved.** e9/e10/e11 are themselves byte-identical in endpoints, labels, styles, and colors; only the minimal rendered geometry needed to follow n7 changes.
4. **PASS — no additions/removals.** Object and connection counts remain 14 and 14.
5. **PASS — E2 fought-for styling survives.** All four failure-family edges remain dashed red with identical labels and endpoints.

**E3 score: 10/10.** Zero violations and zero undeclared accommodations; the nudge is surgical and within the accepted 32–48px range.

## Mean

**ES mean: (10 + 10 + 10) / 3 = 10/10.**
