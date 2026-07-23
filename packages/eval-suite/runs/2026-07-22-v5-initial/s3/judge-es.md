# ES — Edit Stability

Scenario: `s3-state-machine`  
Run: `2026-07-22-v5-initial`

## E1 — Add Migrating

### In-scope classification

- In-scope requested additions: `state-migrating` (n8), `edge-migrate` (e13), `edge-migration-complete` (e14), and `edge-migration-failed` (e15).
- In-scope declared make-room neighbor: `heartbeat-badge` (b1).
- Out of scope and therefore frozen: `page-frame`, `seed-idle` (n1), `state-connecting` (n2), `seed-connected` (n3), `state-degraded` (n4), `state-reconnecting` (n5), `state-suspended` (n6), `state-disconnecting` (n7), `failure-note` (a1), `port-connect`, `port-packet-loss`, and all twelve pre-existing connections `edge-connect`, `edge-handshake`, `edge-timeout`, `edge-packet-loss`, `edge-grace-expired`, `edge-recovered`, `edge-session-resumed`, `edge-suspend`, `edge-quarantine`, `edge-resume-window`, `edge-close`, and `edge-socket-closed`.
- Out-of-scope additions: `port-migrate`, `port-migration-complete`, and `port-migration-failed`; these are not in the fixture's expected in-scope set.

### Violations and accommodations

| classification | object id | change | magnitude | declared? |
|---|---|---|---|---|
| violation | `port-migrate` | Added an unrequested visible routing-port ellipse on the new migrate corridor. | +1 object, 16×16 px | No |
| violation | `port-migration-complete` | Added an unrequested visible routing-port ellipse on the new completion corridor. | +1 object, 16×16 px | No |
| violation | `port-migration-failed` | Added an unrequested visible routing-port ellipse on the new failure corridor. | +1 object, 16×16 px | No |
| accommodation | `heartbeat-badge` | Shifted left from `(1168,848)` to `(1072,848)` to clear the new migration labels; it remains touching the bottom of Connected in the E1 PNG. | 96 px left | Yes — the E1 summary names the 96 px shift |

No other object or connection changed.

### Stability invariants

- **PASS — n1–n7, b1, a1 movement:** n1–n7 and a1 are byte-identical. The only movement is b1's declared 96 px make-room shift, which is visually minimal for the new completion-label corridor and preserves the touching anchor.
- **PASS — e1–e12 frozen attributes/corridors:** all twelve connection records are byte-identical pre/post; the PNGs show their existing corridors retained.
- **PASS — e1/e3 separation survives:** the solid `connect()` track and lower dashed-red `timeout` back-edge remain visibly separate in E1.
- **PASS — no existing resize/restyle/relabel:** all existing object sizes, text, color, style, and parentage are unchanged.

**E1 score: 7/10.** Three minor out-of-scope routing-port additions prevent an exact-ask diff; every fixture invariant and the fought-for e1/e3 separation hold.

## E2 — Readability geometry pass

### In-scope classification

- Geometry is in scope for all sixteen pre-edit objects: `page-frame`, `seed-idle`, `state-connecting`, `seed-connected`, `state-degraded`, `state-reconnecting`, `state-suspended`, `state-disconnecting`, `state-migrating`, `heartbeat-badge`, `failure-note`, `port-connect`, `port-packet-loss`, `port-migrate`, `port-migration-complete`, and `port-migration-failed`.
- Route geometry is in scope for all fifteen pre-edit connections.
- Frozen/out of scope for every object and connection: adds/removes, endpoint topology, labels/text, styles, colors, size, and parentage.
- The allowed object-position changes were: `failure-note` `(-32,0)`, `heartbeat-badge` `(+80,-112)`, `port-connect` `(-208,-80)`, `port-migrate` `(+128,+80)`, `port-migration-complete` `(+128,-128)`, `port-migration-failed` `(-336,+160)`, `port-packet-loss` `(-304,-256)`, `seed-connected` `(-16,-176)`, `seed-idle` `(+64,+112)`, `state-connecting` `(+32,-80)`, `state-degraded` `(-352,-144)`, `state-disconnecting` `(-96,-48)`, `state-migrating` `(+144,+80)`, `state-reconnecting` `(-336,+112)`, and `state-suspended` `(-1584,0)`; `page-frame` stayed fixed. These broad geometry moves are not violations by themselves under the probe override.

### Violations and accommodations

| classification | object/connection ids | change | magnitude | declared? |
|---|---|---|---|---|
| violation | `port-close-source`, `port-close-target`, `port-complete-source`, `port-failed-source`, `port-grace-source`, `port-grace-target`, `port-handshake-source`, `port-handshake-target`, `port-migrate-source`, `port-packet-source`, `port-quarantine-source`, `port-quarantine-target`, `port-recovered-source`, `port-recovered-target`, `port-resume-source`, `port-resume-target`, `port-session-source`, `port-session-target`, `port-socket-source`, `port-socket-target`, `port-suspend-source`, `port-suspend-target`, `port-timeout-source`, `port-timeout-target` | Added routing-port objects during a geometry-only edit. | +24 objects; count 16→40 | No in the commit summary; the later evaluation note acknowledges them |
| violation | `edge-close`, `edge-grace-expired`, `edge-handshake`, `edge-migrate`, `edge-migration-complete`, `edge-migration-failed`, `edge-packet-loss`, `edge-quarantine`, `edge-recovered`, `edge-resume-window`, `edge-session-resumed`, `edge-socket-closed`, `edge-suspend`, `edge-timeout` | Rewired one or both semantic endpoints to routing-port objects. Exact mappings are listed below. | 14 of 15 connections | No in the commit summary; the later evaluation note acknowledges them |
| violation | `seed-connected`, `state-connecting`, `state-degraded`, `state-reconnecting`, `port-connect`, `port-migration-complete`, `port-packet-loss` | Changed frozen colors: gray→green, gray→blue, gray→red, gray→yellow, gray→blue, gray→green, and gray→red respectively. | 7 recolors | Yes, as “color-coded clusters,” but color was expressly frozen and cannot be an accommodation |
| violation (fought-for property) | `heartbeat-badge` | Moved from touching Connected to a position 64 px below it amid the green recovery wiring; the E2 PNG no longer shows the prior touching anchor or a dedicated short badge stub. | vector `(+80,-112)`, 137.6 px displacement | Not specifically; only the general rebalance is declared |

Endpoint rewires, pre→post:

- `edge-close`: `seed-connected→state-disconnecting` to `port-close-source→port-close-target`.
- `edge-grace-expired`: `state-degraded→state-reconnecting` to `port-grace-source→port-grace-target`.
- `edge-handshake`: `state-connecting→seed-connected` to `port-handshake-source→port-handshake-target`.
- `edge-migrate`: source `seed-connected→port-migrate-source`; target remains `port-migrate`.
- `edge-migration-complete`: source `state-migrating→port-complete-source`; target remains `port-migration-complete`.
- `edge-migration-failed`: source `state-migrating→port-failed-source`; target remains `port-migration-failed`.
- `edge-packet-loss`: source `seed-connected→port-packet-source`; target remains `port-packet-loss`.
- `edge-quarantine`: `state-degraded→state-suspended` to `port-quarantine-source→port-quarantine-target`.
- `edge-recovered`: `state-degraded→seed-connected` to `port-recovered-source→port-recovered-target`.
- `edge-resume-window`: `state-suspended→state-reconnecting` to `port-resume-source→port-resume-target`.
- `edge-session-resumed`: `state-reconnecting→seed-connected` to `port-session-source→port-session-target`.
- `edge-socket-closed`: `state-disconnecting→seed-idle` to `port-socket-source→port-socket-target`.
- `edge-suspend`: `seed-connected→state-suspended` to `port-suspend-source→port-suspend-target`.
- `edge-timeout`: `state-connecting→seed-idle` to `port-timeout-source→port-timeout-target`.

There are no allowed accommodations in E2: geometry was already in scope, while the listed non-geometry changes are forbidden invariant breaks.

### Stability invariants

- **FAIL — identical object and connection counts:** objects change 16→40; connections remain 15→15.
- **PASS — byte-identical labels:** every node, edge, badge, and sticky label/text value is unchanged.
- **FAIL — byte-identical styles and colors:** connection styles/colors and object shape styles remain unchanged, but seven existing object colors change.
- **FAIL — connection endpoints frozen:** fourteen of fifteen connections are rewired through newly added routing ports; only `edge-connect` keeps its E1 endpoints.
- **FAIL — geometry channel only:** the PNG shows the intended wider corridors, but the patch also adds objects, rewires topology, and recolors existing objects.
- **FAIL — E1 additions survive except in geometry:** `state-migrating` keeps its text/type/color/size, and the three edge labels/styles/colors survive, but all three E1 connections change source endpoints.

**E2 score: 3/10.** This is out-of-scope restyling plus major structural churn on top of legitimate geometry movement, matching the rubric's 3 anchor; multiple frozen-channel invariants and the prior badge anchor are broken.

## E3 — Timeout corridor

### In-scope classification

- In scope: `edge-timeout` route/endpoints; removal of `port-timeout-source` and `port-timeout-target`; and the minimal declared e1-route adjustment comprising `edge-connect`, `port-connect`, and new `port-connect-source`.
- Out of scope: every other pre-edit object and the thirteen connections other than `edge-timeout` and `edge-connect`; all labels, styles, and colors are frozen everywhere.
- The in-scope diff removes both timeout waypoint ports, reconnects `edge-timeout` directly `state-connecting→seed-idle`, moves `port-connect` 64 px upward `(720,608)→(720,544)`, adds `port-connect-source` at `(528,544)`, and changes `edge-connect` from `seed-idle→port-connect` to `port-connect-source→port-connect`. The commit summary declares the upper-track separation.

### Violations and accommodations

No violations. No accommodations: every changed item is part of the fixture's explicit e3/e1 route scope. The 64 px e1-track adjustment is declared, minimal, and visually confined to the paired corridor.

### Stability invariants

- **PASS — out-of-scope object positions:** every state, b1, a1, and every routing object outside the timeout/connect pair is byte-identical. The only surviving moved object is in-scope `port-connect` (64 px up).
- **PASS — other connections frozen:** all thirteen connections outside e3/e1 are byte-identical. The declared e1 adjustment is confined to its upper track.
- **PASS — labels/styles/colors frozen:** no label, style, arrow, or color changes anywhere, including on `edge-timeout`.
- **PASS — E2 corridor widths elsewhere preserved:** all geometry outside the timeout/connect pair is identical, and the E2/E3 PNGs show the same board-wide corridors.
- **PASS — fought-for separation:** the E3 PNG shows one continuous dashed-red timeout arrow directly from Connecting back to Idle, with no waypoint/crosshair on that path, and a distinct solid-gray `connect()` arrow on the upper track.

**E3 score: 10/10.** The diff is exactly the corridor repair, with zero violations and zero undeclared accommodations.

## Mean

**ES mean: 6.67/10** (`(7 + 3 + 10) / 3 = 6.666…`). No edit was refused or excluded.
