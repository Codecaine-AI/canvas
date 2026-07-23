# S5 — Nested architecture with a hub (cloud deployment)

<!-- Fixture contract: this file alone must be enough to (a) run the scenario from a blank
canvas and get a comparable board every time, and (b) grade all five axes. The build
instruction is the canonical source of intent; every table below restates the instruction
precisely — the checklist may never demand anything the instruction doesn't ask for. -->

- id: `s5-nested-arch`
- canvas: `eval-suite-s5-nested-arch` (created fresh every run; delete any existing first)
- genre: nested architecture
- complexity: 4
- board: 2400×1600 locked `page-frame`
- session budget: 1 build session + 3 edit sessions, 15 min poll cap each

## Build instruction (verbatim — send exactly this)

> Build a cloud deployment diagram with real nesting. One big tinted section titled "VPC",
> neutral gray wash, containing two child tinted sections: "Public Subnet" (green tint)
> holding ALB and API Gateway, and "Private Subnet" (orange tint) holding Auth Service,
> Orders Service, Notifications Service, and Postgres. Containment is non-negotiable:
> every node fully inside its subnet, both subnets fully inside the VPC with visible
> breathing room — nothing pokes past a border, ever. Outside the VPC on the left, the
> entry: a Client node, with a solid neutral edge labeled "HTTPS" into ALB, then ALB →
> API Gateway, solid. The gateway fans into the private subnet: API Gateway → Auth
> Service solid labeled "authn", API Gateway → Orders Service solid labeled "REST", and
> Orders Service → Postgres solid labeled "read/write". Now the connective center of the
> board: an Event Bus node outside the VPC on the right — make it visibly the hub, larger
> than the service boxes, violet. All event traffic is violet solid labeled edges: Orders
> Service → Event Bus "publish", Auth Service → Event Bus "audit events", Event Bus →
> Notifications Service "dispatch", Event Bus → Analytics "stream", Event Bus → Webhooks
> "external delivery". Analytics and Webhooks are standalone neutral boxes outside the
> VPC near the bus. Notifications Service → Email Provider, solid neutral, labeled "send
> email" — Email Provider is an external SaaS box, also outside the VPC. Observability
> overlay: dashed muted-gray edges from Auth Service, Orders Service, and Notifications
> Service to a single Metrics & Tracing box outside the VPC — visibly a quieter family
> than the violet event traffic, no labels needed on those three. One margin sticky
> telling the eventing story: services never call each other directly — everything after
> the synchronous order write flows through the Event Bus. Reference-board finish: label
> chips in open corridors, the hub's spokes readable, deliberate density — tight inside
> the subnets, generous air in the corridor around the bus.

## Ground truth

### Nodes

| ref | label (verbatim) | kind/shape | color-class | notes |
|---|---|---|---|---|
| n1 | Client | box | neutral | entry, outside VPC, left |
| n2 | ALB | box | neutral | Public Subnet |
| n3 | API Gateway | box | neutral | Public Subnet |
| n4 | Auth Service | box | neutral | Private Subnet |
| n5 | Orders Service | box | neutral | Private Subnet |
| n6 | Notifications Service | box | neutral | Private Subnet |
| n7 | Postgres | box (store) | neutral | Private Subnet |
| n8 | Event Bus | box, larger than service boxes | violet | THE HUB, outside VPC, right; 7 edges total (5 at the bus per the five event edges, plus E1 adds one) |
| n9 | Analytics | box | neutral | outside VPC, near bus |
| n10 | Webhooks | box | neutral | outside VPC, near bus |
| n11 | Email Provider | box | neutral | external SaaS, outside VPC |
| n12 | Metrics & Tracing | box | neutral | observability sink, outside VPC |

12 nodes at build.

### Edges

| ref | from → to | label | style | color-class | notes |
|---|---|---|---|---|---|
| e1 | n1 → n2 | HTTPS | solid | neutral | entry |
| e2 | n2 → n3 | — | solid | neutral | inside Public Subnet |
| e3 | n3 → n4 | authn | solid | neutral | crosses subnet boundary |
| e4 | n3 → n5 | REST | solid | neutral | crosses subnet boundary |
| e5 | n5 → n7 | read/write | solid | neutral | inside Private Subnet |
| e6 | n5 → n8 | publish | solid | violet | event family, exits VPC |
| e7 | n4 → n8 | audit events | solid | violet | event family, exits VPC |
| e8 | n8 → n6 | dispatch | solid | violet | event family, enters VPC |
| e9 | n8 → n9 | stream | solid | violet | event family |
| e10 | n8 → n10 | external delivery | solid | violet | event family |
| e11 | n6 → n11 | send email | solid | neutral | to external SaaS |
| e12 | n4 → n12 | — | dashed | muted | observability overlay |
| e13 | n5 → n12 | — | dashed | muted | observability overlay |
| e14 | n6 → n12 | — | dashed | muted | observability overlay |

14 edges at build. Hub degree of n8 = 5 (e6–e10), all violet, all labeled.

### Sections / groups

| ref | title | tint | members (node refs) | nesting |
|---|---|---|---|---|
| sec1 | VPC | neutral (gray wash) | sec2, sec3 (and their members) | top-level section |
| sec2 | Public Subnet | green | n2 n3 | child of sec1, fully inside |
| sec3 | Private Subnet | orange | n4 n5 n6 n7 | child of sec1, fully inside; retitled/retinted in E2 |

n1, n8, n9, n10, n11, n12 are outside every section (page-frame only).

### Annotations

| ref | kind | gist | placement |
|---|---|---|---|
| a1 | margin sticky | eventing story: services never call each other directly — everything after the synchronous order write flows through the Event Bus | board margin, outside the VPC |

## Comprehension key

CORE:
- [C1] Public Subnet contains exactly ALB and API Gateway.
- [C2] Private Subnet contains exactly Auth Service, Orders Service, Notifications Service, and Postgres.
- [C3] Both subnets are nested inside the VPC; Client, Event Bus, Analytics, Webhooks, Email Provider, and Metrics & Tracing sit outside the VPC.
- [C4] The entry path is Client → ALB → API Gateway.
- [C5] API Gateway calls both Auth Service and Orders Service.
- [C6] Orders Service reads/writes Postgres.
- [C7] The Event Bus is the board's hub — five event edges converge on/leave it.
- [C8] Orders Service publishes INTO the Event Bus (direction service→bus).
- [C9] Auth Service sends audit events INTO the Event Bus (direction service→bus).
- [C10] The Event Bus dispatches OUT to Notifications Service (direction bus→service).
- [C11] The Event Bus feeds Analytics and Webhooks (direction bus→satellite, both).
- [C12] Notifications Service feeds Email Provider.
- [C13] Dashed muted edges are the observability overlay: Auth, Orders, and Notifications all point to Metrics & Tracing.
- [C14] Violet edges are event traffic — a distinct family from the neutral synchronous calls.

SECONDARY:
- [S1] Event edge labels: "publish", "audit events", "dispatch", "stream", "external delivery".
- [S2] Synchronous-path labels: "HTTPS", "authn", "REST", "read/write", "send email".
- [S3] Email Provider is an external SaaS, outside the VPC.
- [S4] Sticky gist: services never call each other directly; everything after the synchronous write flows through the bus.
- [S5] The Event Bus is visibly emphasized — larger than the service boxes, violet.
- [S6] Subnet tints are distinct: Public green, Private orange, VPC a neutral wash.
- [S7] The observability sink is one shared box named Metrics & Tracing.

## Intent-fidelity checklist

Nodes:
- [ ] IF-01 node n1 exists, label "Client", neutral, outside the VPC
- [ ] IF-02 node n2 exists, label "ALB", inside Public Subnet
- [ ] IF-03 node n3 exists, label "API Gateway", inside Public Subnet
- [ ] IF-04 node n4 exists, label "Auth Service", inside Private Subnet
- [ ] IF-05 node n5 exists, label "Orders Service", inside Private Subnet
- [ ] IF-06 node n6 exists, label "Notifications Service", inside Private Subnet (full display label — not an id slug like "notifications-service", the round-1 defect class)
- [ ] IF-07 node n7 exists, label "Postgres", inside Private Subnet
- [ ] IF-08 node n8 exists, label "Event Bus", violet, visibly larger than the service boxes, outside the VPC
- [ ] IF-09 nodes n9 "Analytics", n10 "Webhooks", n11 "Email Provider", n12 "Metrics & Tracing" exist, neutral, outside the VPC

Sections & containment (the sacred checks — JSON geometry, verify each):
- [ ] IF-10 section sec1 "VPC" exists, neutral wash tint
- [ ] IF-11 section sec2 "Public Subnet" exists, green tint, containing exactly n2 and n3
- [ ] IF-12 section sec3 "Private Subnet" exists, orange tint, containing exactly n4, n5, n6, n7
- [ ] IF-13 sec2's rectangle is FULLY inside sec1's rectangle, positive margin on all four sides (the round-1 corpus committed a child section 132px outside its parent — check the actual coordinates, not the parentId)
- [ ] IF-14 sec3's rectangle is FULLY inside sec1's rectangle, positive margin on all four sides
- [ ] IF-15 every member node's rectangle is fully inside its section's rectangle — no node straddles any section border
- [ ] IF-16 none of n1, n8, n9, n10, n11, n12 overlaps the VPC rectangle
- [ ] IF-17 neither subnet is a stretched empty tower: each subnet's height/width is driven by its content, not stretched to fill the VPC band

Edges:
- [ ] IF-18 e1 n1→n2 solid neutral "HTTPS"; e2 n2→n3 solid neutral
- [ ] IF-19 e3 n3→n4 solid neutral "authn"; e4 n3→n5 solid neutral "REST"
- [ ] IF-20 e5 n5→n7 solid neutral "read/write"
- [ ] IF-21 e6 n5→n8 violet solid "publish", direction into the bus
- [ ] IF-22 e7 n4→n8 violet solid "audit events", direction into the bus
- [ ] IF-23 e8 n8→n6 violet solid "dispatch", direction out of the bus
- [ ] IF-24 e9 n8→n9 violet solid "stream"; e10 n8→n10 violet solid "external delivery"
- [ ] IF-25 e11 n6→n11 solid neutral "send email"
- [ ] IF-26 e12/e13/e14 exist: dashed muted, from n4/n5/n6 respectively into n12, unlabeled
- [ ] IF-27 the hub has exactly its five specced event edges (degree-5 at build) and every one is labeled
- [ ] IF-28 every label chip visually associated with its own edge (PNG check)
- [ ] IF-29 all directions as specced (any reversal → IF cap 6)

Annotations:
- [ ] IF-30 margin sticky present with the eventing-story gist, outside the VPC

Negative:
- [ ] IF-NEG-1 no specced node/edge absent without a declared substitution in a commit summary
- [ ] IF-NEG-2 no unrequested structural content — specifically NO relay/port/junction pill nodes invented to serve edge routing (v4 round-1 invented 9 unrequested pills under label-clearance pressure), no extra sections, no extra edges

## Follow-up edits

### E1 — add Payments Service

Instruction (verbatim):

> Add a Payments Service inside the Private Subnet, same styling as its sibling services.
> Wire it: Orders Service → Payments Service, solid neutral, labeled "charge", and
> Payments Service → Event Bus, violet solid, labeled "payment.captured". The Private
> Subnet may grow to make room — and the VPC may grow with it if it must — but when
> you're done every contained node is still fully inside its section and both subnets are
> still fully inside the VPC. Nothing crosses a border. Public Subnet and everything
> outside the VPC stays untouched.

New ground truth: node n13 "Payments Service", neutral box, member of sec3; edge e15 n5→n13 solid neutral "charge"; edge e16 n13→n8 violet solid "payment.captured" (hub degree rises to 6).

Fidelity checks (append to the running IF checklist):
- [ ] E1-01 node n13 "Payments Service" exists, neutral, fully inside sec3
- [ ] E1-02 edge e15 n5→n13 exists, solid, neutral, labeled "charge"
- [ ] E1-03 edge e16 n13→n8 exists, solid, violet, labeled "payment.captured"
- [ ] E1-04 containment re-verified post-edit: all sec3 members inside sec3, sec2/sec3 inside sec1, positive margins all sides — no section boundary crossed by any contained node

Stability invariants (ES):
- [inv] sec2 (Public Subnet) and its members n2, n3 do not move
- [inv] n1, n8, n9, n10, n11, n12 do not move (outside-VPC world frozen; e16's route into the bus is new, the bus itself stays put)
- [inv] all 14 build edges keep endpoints, direction, label, style, color; routes not touching the grown region unchanged
- [inv] n8 keeps its size (no silent hub shrink — round-1's size normalization shrank the emphasized bus 248×130→184×96 on an unrelated edit)
- [inv] containment holds at every commit: no child section outside its parent, no member outside its section
- in-scope objects: n13, e15, e16; sec3 bounds; sec1 bounds (growth only); n4–n7 may shift within sec3 to make room (declared accommodation); routes of edges attached to sec3 members where the growth forces it (declared)

### E2 — restyle Private Subnet (THE destructive-tempting probe)

Instruction (verbatim):

> Rename the "Private Subnet" section to "App Subnet" and change its tint from orange to
> teal. That is the whole edit — a retitle and a recolor. Do not move, resize, or reroute
> a single thing: every node, every section frame, every edge stays exactly where it is.
> If your diff contains anything but that section's title and tint, it's wrong.

Fidelity checks:
- [ ] E2-01 sec3's title is now "App Subnet"
- [ ] E2-02 sec3's tint is now teal
- [ ] E2-03 everything else in the document is unchanged

Stability invariants (ES) — this is the restyle-without-relayout probe; grade it hard:
- [inv] the JSON diff touches exactly one object (sec3) and exactly two fields (title, tint)
- [inv] every node, section, and sticky position and size byte-identical, including sec3's own frame
- [inv] every edge route, label, style, and color byte-identical
- [inv] no size reclassification of any object (size-normalization round-trips reclassifying M→L etc. count as violations even at 0px movement)
- in-scope objects: sec3 title + tint fields only

### E3 — rebalance the hub fan

Instruction (verbatim):

> The Event Bus fan is lopsided — the spokes bunch up and the satellites crowd one side.
> Rebalance the hub: arrange Analytics, Webhooks, Email Provider, and Metrics & Tracing
> around the bus so the violet spokes and the dashed taps read cleanly, each label chip in
> its own air. Strictly outside-the-VPC work: nothing inside the VPC moves — not the
> subnets, not a single service, and not the VPC frame itself. The Client stays put too;
> it anchors the entry.

Fidelity checks:
- [ ] E3-01 every hub spoke label chip ("publish", "audit events", "dispatch", "stream", "external delivery", "payment.captured") sits in clear air, unambiguously on its own edge
- [ ] E3-02 the six hub edges and three observability taps all still exist with identical endpoints, direction, labels, styles, colors

Stability invariants (ES):
- [inv] sec1, sec2, sec3 and every contained node: zero movement, zero resize
- [inv] n1 (Client): zero movement
- [inv] no edge added, removed, relabeled, or restyled; only routes touching the moved satellites/bus may change
- [inv] n8 keeps its size class (rebalance means reposition, not shrink the hub)
- in-scope objects: n8, n9, n10, n11, n12 positions; routes of e6–e16 where they terminate at a moved object

## Grading notes

Genre traps from the round-1 corpus (`findings-nested-arch.md`, `v4r1-nested-arch.md`):

- **Child-section containment escapes.** The defining round-1 defect: a child section
  committed 132px outside its parent VPC while the wrecked-layout gate stayed silent and
  overflow lint was treated as advisory. IF-13/14/15 and E1-04 exist precisely for this —
  check geometry from JSON, never trust parentId alone. A containment breach at any commit
  is an invariant violation for ES and a fidelity failure for IF, both.
- **Empty stretched section towers.** Round-1's first build stretched all groups to the
  full 1616px band height with 2–4 nodes floating in dead space (aesthetic 2). IF-17 is
  the check; SQ's frame-use/density sub-checks bite here too.
- **Hub-beside-children fan shape.** The hub-balance diagnostic only knows hub-over-fan
  and false-fired against the instructed corridor-hub placement in all three v4 sessions.
  The bus sitting beside the VPC with a sideways fan is THE requested shape — an agent
  overriding hub-balance warnings with a verbatim note is good process (PH credit), and
  judges must not read the warning trail as evidence of a defect.
- **Unrequested relay/port pills.** Under label-clearance pressure v4 invented 9 relay
  pill nodes (PUBLISH/CONSUME/DATA/…) no instruction asked for — the single biggest
  visual divergence from the references. IF-NEG-2 names this class explicitly.
- **Silent hub shrink (size normalization).** Round-1's fit→expand round trip shrank the
  emphasized Event Bus from L to M on an edit that never mentioned it. Watch the E1 and
  E3 diffs for n8 size changes; that is a violation even though nothing "moved".
- **Label-as-id defects.** Round-1 shipped "notifications-se rvice" wrapped mid-word
  because the DSL had no display-label channel. IF-06 checks the human label explicitly.
- **E2 is the probe.** A pure restyle answered with any re-layout — even a "helpful" one —
  is exactly the failure class being measured (v3's 3-pill restyle moved all 13 objects).
  Score ES from the diff arithmetic; there is no accommodation budget on E2.
- **Swapped-target bookkeeping.** v4 S3 landed two new connections on swapped targets with
  matching-looking labels. Verify e15/e16 endpoints from JSON, not from plausibility.
- **Do not double-penalize declared substitutions:** an honestly declared limitation in a
  commit summary fails its checklist item but does not trigger IF's silent-absence cap and
  earns PH credit per axes/ph.md.
