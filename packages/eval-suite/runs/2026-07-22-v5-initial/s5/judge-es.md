# ES — Edit Stability

- Scenario: `s5-nested-arch`
- Run: `2026-07-22-v5-initial`
- Scoring: per follow-up edit, then averaged

## E1 — Add Payments Service

### In-scope classification

- Objects: `payments-service` (new); `private-subnet` bounds; `vpc` bounds for growth only; and the positions of `auth-service`, `orders-service`, `postgres`, and `notifications-service` as declared make-room accommodations. `vpc` and `notifications-service` did not change.
- Connections: `edge-orders-payments` and `edge-payments-bus` (new). Route-only scope also covered the existing connections attached to Private Subnet members where reflow forced a route change: `edge-api-auth`, `edge-api-orders`, `edge-orders-postgres`, `edge-orders-bus`, `edge-auth-bus`, `edge-bus-notifications`, `edge-notifications-email`, `edge-auth-metrics`, `edge-orders-metrics`, and `edge-notifications-metrics`. All 14 pre-existing connection records retained endpoints, direction, label, style, arrow, and color byte-for-byte.
- Out-of-scope objects: `page-frame`, `seed-client`, `seed-event-bus`, `public-subnet`, `alb`, `api-gateway`, `analytics`, `webhooks`, `email-provider`, `metrics-tracing`, and `eventing-story`. Every one is byte-identical pre/post.
- Out-of-scope connections: `edge-client-alb`, `edge-alb-api`, `edge-bus-analytics`, and `edge-bus-webhooks`. Their records are byte-identical, and the PNG pair shows their corridors unchanged.

### Changes, violations, and accommodations

- Requested/in-scope: `private-subnet` changed from `(912,352,640,864)` to `(864,288,688,928)`: Δx = -48 px, Δy = -64 px, Δwidth = +48 px, Δheight = +64 px. `payments-service` was added at `(1200,352,224,96)`, along with the two requested connections.
- Declared accommodation: `auth-service` moved from `(1232,480)` to `(1120,480)`, Δ(-112,0), a 112 px displacement. Declared by the commit summary's “expanded/reflowed only the Private Subnet” statement and permitted by the fixture's make-room set.
- Declared accommodation: `orders-service` moved from `(1008,576)` to `(928,608)`, Δ(-80,+32), an 86.2 px displacement. Same declaration and make-room basis.
- Declared accommodation: `postgres` moved from `(1280,896)` to `(944,896)`, Δ(-336,0), a 336 px displacement. Same declaration and make-room basis.
- Violations: none.
- Undeclared accommodations: none.

### Stability invariants

1. **PASS — Public Subnet frozen.** `public-subnet`, `alb`, and `api-gateway` are byte-identical in geometry and all other fields.
2. **PASS — Outside-VPC world frozen.** `seed-client`, `seed-event-bus`, `analytics`, `webhooks`, `email-provider`, and `metrics-tracing` did not move or resize; the out-of-scope sticky and page frame are also unchanged.
3. **PASS — Build edges preserved.** All 14 prior connection records have identical endpoints, directions, labels, styles, arrows, and colors. In the viewed PNGs, corridors outside the grown private region remain unchanged.
4. **PASS — Hub size preserved.** `seed-event-bus` remains `(1696,592,320,160)`; no shrink or size reclassification occurred.
5. **PASS — Containment at both observed commits.** Post-edit, `public-subnet` has positive VPC margins `(left 80, top 320, right 800, bottom 288)` and `private-subnet` has `(left 464, top 96, right 80, bottom 128)`. The five private members have positive section margins: Payments `(336,64,128,768)`, Auth `(256,192,208,640)`, Orders `(64,320,400,512)`, Postgres `(80,608,432,224)`, and Notifications `(416,768,48,64)`, listed left/top/right/bottom. The pre-edit snapshot also satisfies containment.

**E1 score: 9/10.** Zero violations, with three declared make-room accommodations; this matches the 9-row rather than the exact-diff 10-row.

## E2 — Retitle and recolor Private Subnet

### In-scope classification

- In scope: exactly `private-subnet.text` (`Private Subnet` → `App Subnet`) and `private-subnet.color` (`orange` → `teal`).
- Out-of-scope objects/fields: every other field of `private-subnet`, plus all fields of `page-frame`, `seed-client`, `seed-event-bus`, `vpc`, `public-subnet`, `alb`, `api-gateway`, `auth-service`, `orders-service`, `postgres`, `notifications-service`, `analytics`, `webhooks`, `email-provider`, `metrics-tracing`, `eventing-story`, and `payments-service`. All are byte-identical.
- Out-of-scope connections: all 16 connections — `edge-client-alb`, `edge-alb-api`, `edge-api-auth`, `edge-api-orders`, `edge-orders-postgres`, `edge-orders-bus`, `edge-auth-bus`, `edge-bus-notifications`, `edge-bus-analytics`, `edge-bus-webhooks`, `edge-notifications-email`, `edge-auth-metrics`, `edge-orders-metrics`, `edge-notifications-metrics`, `edge-orders-payments`, and `edge-payments-bus`. The entire connection array is byte-identical.

### Changes, violations, and accommodations

- The complete JSON diff touches one object and exactly the two requested fields.
- Violations: none.
- Accommodations: none, declared or undeclared.

### Stability invariants

1. **PASS — Exact two-field diff.** Only `private-subnet.text` and `private-subnet.color` changed.
2. **PASS — Geometry byte-frozen.** Every node, section, and sticky position and size is byte-identical, including `private-subnet.geometry = (864,288,688,928)`.
3. **PASS — Connections byte-frozen.** Every connection endpoint, direction, route-defining record, label, style, arrow, and color is byte-identical. The viewed PNG pair likewise shows fixed geometry and routing.
4. **PASS — No size reclassification.** No object type, style, width, or height changed.

**E2 score: 10/10.** The diff is exactly the ask, with no violation or accommodation.

## E3 — Rebalance the hub fan

This is a geometry-only probe, so the fixture invariants replace ordinary positional violation math.

### In-scope classification

- Objects: positions of `seed-event-bus`, `analytics`, `webhooks`, `email-provider`, and `metrics-tracing`. The bus was eligible to move but remained fixed.
- Connections, route-only: `edge-orders-bus`, `edge-auth-bus`, `edge-bus-notifications`, `edge-bus-analytics`, `edge-bus-webhooks`, `edge-notifications-email`, `edge-auth-metrics`, `edge-orders-metrics`, `edge-notifications-metrics`, and `edge-payments-bus`, because they touch one of the five in-scope outside objects. Their stored connection records remained byte-identical; the visible routes to moved satellites/tap sink reflowed from the new endpoint positions.
- Out-of-scope objects: `page-frame`, `seed-client`, `vpc`, `public-subnet`, `private-subnet`, `alb`, `api-gateway`, `auth-service`, `orders-service`, `postgres`, `notifications-service`, `payments-service`, and `eventing-story`. All are byte-identical.
- Out-of-scope connections: `edge-client-alb`, `edge-alb-api`, `edge-api-auth`, `edge-api-orders`, `edge-orders-postgres`, and `edge-orders-payments`. All are byte-identical and visually retain their corridors.

### Changes, violations, and accommodations

- Requested/in-scope: `analytics` moved `(2208,320)` → `(1760,256)`, Δ(-448,-64), 452.5 px displacement.
- Requested/in-scope: `webhooks` moved `(2208,864)` → `(2208,624)`, Δ(0,-240), 240 px displacement.
- Requested/in-scope: `email-provider` moved `(1744,1056)` → `(2080,1072)`, Δ(+336,+16), 336.4 px displacement.
- Requested/in-scope: `metrics-tracing` moved `(1120,1440)` → `(1376,1424)`, Δ(+256,-16), 256.5 px displacement.
- `seed-event-bus` remained `(1696,592,320,160)`.
- Violations: none.
- Accommodations: none; the four moves are the objects expressly named by the edit, not out-of-scope accommodations.

### Stability invariants

1. **PASS — VPC and contents frozen.** `vpc`, both subnet frames, and every contained node (`alb`, `api-gateway`, `auth-service`, `orders-service`, `postgres`, `notifications-service`, and `payments-service`) have zero movement and zero resize; all their other fields are also byte-identical.
2. **PASS — Client frozen.** `seed-client` remains `(128,640,192,96)`.
3. **PASS — Topology and styling frozen.** No connection was added, removed, relabeled, restyled, recolored, or reversed; all 16 connection records are byte-identical. The viewed E2/E3 PNGs show route changes only for the requested outside fan/tap endpoints.
4. **PASS — Hub size preserved.** `seed-event-bus` remains 320×160 with the same type, style, and violet color; it was neither moved nor shrunk.

**E3 score: 10/10.** Every geometry-probe invariant holds, with no out-of-scope change.

## Mean

**ES mean: (9 + 10 + 10) / 3 = 9.67/10.**
