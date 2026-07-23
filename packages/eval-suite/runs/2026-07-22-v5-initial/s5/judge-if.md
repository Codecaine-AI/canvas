# IF — Intent Fidelity

**Score: 6/10**

**Pass fraction:** 33/41 = **0.8049**. Under the IF rubric, `P >= 0.80` and `< 0.88` maps to **6**.

## Per-item verdicts

### Build — nodes

- **IF-01 — PASS.** JSON object `seed-client` is labeled `Client`, uses neutral white, is parented to `page-frame`, and its rectangle ends at x=320, before the VPC begins at x=400.
- **IF-02 — FAIL.** JSON object `alb` exists inside `public-subnet`, but its color is `teal`, not the ground-truth neutral color-class. In the PNG its displayed label is also glyph-like marks rather than a legible `ALB`.
- **IF-03 — FAIL.** JSON object `api-gateway` exists with the correct label and parent, but its color is `blue`, not the ground-truth neutral color-class.
- **IF-04 — FAIL.** JSON object `auth-service` exists with the correct label and parent, but its color is `blue`, not the ground-truth neutral color-class.
- **IF-05 — FAIL.** JSON object `orders-service` exists with the correct label and parent, but its color is `teal`, not the ground-truth neutral color-class.
- **IF-06 — FAIL.** JSON object `notifications-service` has the full correct display label and parent, but its color is `yellow`, not the ground-truth neutral color-class.
- **IF-07 — PASS.** JSON object `postgres` is a white neutral `database`, labeled `Postgres`, and parented to the app/private subnet.
- **IF-08 — PASS.** `seed-event-bus` is violet, outside the VPC, and 320x160 versus 224x96 for service boxes, so it is visibly larger.
- **IF-09 — PASS.** `analytics`, `webhooks`, `email-provider`, and `metrics-tracing` all exist as neutral white/gray boxes outside the VPC; `Email Provider` also carries the requested `External SaaS` designation.

### Build — sections and containment

- **IF-10 — PASS.** `vpc` exists as a gray neutral-wash section.
- **IF-11 — PASS.** `public-subnet` is green and its only direct node members are `alb` and `api-gateway`.
- **IF-12 — PASS.** The build summary declares the original orange `Private Subnet`; E1 and E2 legitimately supersede its membership, title, and tint. The final same section object contains all four original members plus only the requested Payments addition and is titled/tinted as E2 requires.
- **IF-13 — PASS.** Public Subnet `(480,512,352,544)` lies fully inside VPC `(400,192,1232,1152)`, with margins L80/R800/T320/B288.
- **IF-14 — PASS.** App/Private Subnet `(864,288,688,928)` lies fully inside the VPC, with margins L464/R80/T96/B128.
- **IF-15 — PASS.** Every Public and App Subnet member rectangle is fully inside its section. The tightest App margins remain positive (for example, Payments has 64 px above it and Notifications has 64 px below it).
- **IF-16 — PASS.** Client is left of the VPC; Event Bus, Analytics, Webhooks, and Email Provider are right of it; Metrics & Tracing is below it. None overlaps the VPC rectangle.
- **IF-17 — PASS.** Neither child section is a full-height empty tower: Public is 352x544 with its two nodes and deliberate margins, while App is 688x928 and spatially occupied by five nodes.

### Build — edges

- **IF-18 — FAIL.** JSON has the correct solid gray `seed-client` -> `alb` edge with label `HTTPS`, and the ALB -> API edge is correct, but the PNG renders the `HTTPS` chip as unreadable glyph-like marks rather than the required legible label.
- **IF-19 — FAIL.** JSON has the correct solid gray API -> Auth `authn` and API -> Orders `REST` edges, but the PNG renders the `REST` chip as unreadable glyph-like marks; the grouped item therefore fails the edge-label legibility requirement.
- **IF-20 — PASS.** `edge-orders-postgres` is Orders -> Postgres, solid gray, labeled `read/write`.
- **IF-21 — PASS.** `edge-orders-bus` is Orders -> Event Bus, solid violet, labeled `publish`.
- **IF-22 — PASS.** `edge-auth-bus` is Auth -> Event Bus, solid violet, labeled `audit events`.
- **IF-23 — PASS.** `edge-bus-notifications` is Event Bus -> Notifications, solid violet, labeled `dispatch`.
- **IF-24 — PASS.** Event Bus -> Analytics `stream` and Event Bus -> Webhooks `external delivery` are both solid violet with correct directions.
- **IF-25 — PASS.** Notifications -> Email Provider is solid gray and labeled `send email`.
- **IF-26 — PASS.** Auth, Orders, and Notifications each point to `metrics-tracing` via an unlabeled dashed gray edge.
- **IF-27 — PASS.** All five build event edges remain present and labeled; the only added bus edge is the E1-required Payments edge, giving the correctly edited hub degree of six.
- **IF-28 — PASS.** In the PNG each label chip is positioned on its own routed edge. The two malformed chips remain spatially attributable to their edges; their legibility failures are counted in IF-18 and IF-19.
- **IF-29 — PASS.** All 16 JSON connections use `arrow: forward`, and every `from`/`to` pair matches the specified direction.

### Build — annotation and negatives

- **IF-30 — PASS.** The yellow `eventing-story` sticky is outside the VPC at the left board margin and contains both required ideas: no direct service calls and post-write flow through the Event Bus.
- **IF-NEG-1 — PASS.** All specced build and edit nodes and edges are present; the summaries declare no substitution or omission.
- **IF-NEG-2 — PASS.** JSON contains no relay/port/junction nodes, extra section, or extra edge: beyond the page frame it has exactly the three requested architecture sections, 13 requested nodes, one sticky, and 16 requested connections.

### E1 — Payments Service

- **E1-01 — FAIL.** `payments-service` exists and is fully inside the App/Private Subnet, but JSON color `pink` is not the required neutral color-class (and does not match a neutral sibling-service treatment).
- **E1-02 — PASS.** `edge-orders-payments` is Orders -> Payments, solid gray, labeled `charge`.
- **E1-03 — PASS.** `edge-payments-bus` is Payments -> Event Bus, solid violet, labeled `payment.captured`.
- **E1-04 — PASS.** Final geometry preserves positive containment margins for every App member and for both child sections inside the VPC.

### E2 — App Subnet restyle

- **E2-01 — PASS.** The section object's final text is `App Subnet`.
- **E2-02 — PASS.** Its final color is `teal`.
- **E2-03 — PASS.** `sessions.md` records that E2 changed exactly `text` and `color` on `private-subnet`; all geometry and connections were byte-identical.

### E3 — hub rebalance

- **E3-01 — PASS.** The PNG shows all six hub labels legibly and separately placed: `publish`, `audit events`, `dispatch`, `stream`, `external delivery`, and `payment.captured`. In particular, the two close incoming labels occupy distinct, nonoverlapping chips on separate parallel spokes.
- **E3-02 — PASS.** Final JSON retains the six hub edges and three dashed observability taps with correct endpoints, direction, label, style, and color; `sessions.md` confirms all 16 connections were byte-identical in E3.

## Caps and final score

No cap applies. No requested node or edge is silently absent, no edge direction is reversed, and no requested-and-confirmed content is destroyed. The uncapped rubric result is therefore the final **IF score: 6/10**.
