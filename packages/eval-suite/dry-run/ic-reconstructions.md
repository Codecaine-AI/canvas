# Blind diagram reconstructions — eval v4 dry-run

Reader saw ONLY the five PNGs. No canvas JSON, no docs, no other renders.

---

## eval-v4-flowchart.svg.png

TOPIC: An e-commerce order-processing flowchart from order receipt through validation, payment authorization (with retries and fraud review), to fulfillment or failure.

NODES:
- "Order received" — white rectangle, gray border (Order validation section)
- "Validate order" — white rectangle, gray border
- "Order valid?" — yellow/amber filled rectangle (reads as a decision node)
- "Request correction" — orange/salmon filled rectangle
- "Payment retries: max 3, then fail the order" — yellow sticky-note style box, floating below the Order validation section, attached to nothing
- "Authorize payment" — white rectangle (Payment section)
- "Payment authorized?" — yellow/amber rectangle (decision)
- "Retry payment" — orange/salmon rectangle
- "Fraud review" — white rectangle
- "Fraud suspected?" — yellow/amber rectangle (decision)
- "Order failed" — red/pink rounded pill (terminal)
- "Pack & ship" — white rectangle (Fulfillment section)
- "Order complete" — green rounded pill (terminal)

EDGES:
- Order received → Validate order (Next) — blue solid
- Validate order → Order valid? (Check) — blue solid
- Order valid? → Authorize payment (Yes) — blue solid, crosses from Order validation into Payment section
- Order valid? → Request correction (No) — orange solid, downward
- Request correction → Validate order (Corrected) — orange solid, loops left and back up
- Authorize payment → Payment authorized? (Check) — purple solid
- Payment authorized? → Pack & ship (Yes) — green solid, long horizontal run into Fulfillment
- Payment authorized? → Fraud review (Risky) — purple solid, downward
- Payment authorized? → Retry payment (No) — orange solid, curves down the left side of the decision (see UNCERTAIN re: exact source point)
- Retry payment → Authorize payment (Retry) — orange solid, upward
- Fraud review → Fraud suspected? (Assess) — purple solid
- Fraud suspected? → Order failed (Yes) — red solid, down and left
- Fraud suspected? → Pack & ship (No) — green solid, runs up the right side and appears to join the "Yes" green line heading to Pack & ship (see UNCERTAIN)
- Retry payment → Order failed (Retries exhausted) — red DASHED, exits Retry payment downward and hooks right into Order failed
- Pack & ship → Order complete (Shipped) — green solid

GROUPS:
- "Order validation" — light blue tinted section: Order received, Validate order, Order valid?, Request correction (the yellow retries note sits visually inside/below this section's column but is not wired)
- "Payment" — light purple tinted section: Authorize payment, Payment authorized?, Retry payment, Fraud review, Fraud suspected?, Order failed
- "Fulfillment" — light teal/green tinted section: Pack & ship, Order complete

ORDER: Start at Order received (top-left). Main happy path: Order received → Validate order → Order valid? —Yes→ Authorize payment → Payment authorized? —Yes→ Pack & ship → Order complete. Branch 1 (validation failure loop): Order valid? —No→ Request correction —Corrected→ back to Validate order. Branch 2 (payment retry loop): Payment authorized? —No→ Retry payment —Retry→ back to Authorize payment; if retries exhausted (dashed), Retry payment → Order failed. Branch 3 (fraud): Payment authorized? —Risky→ Fraud review —Assess→ Fraud suspected?; —Yes→ Order failed; —No→ Pack & ship.

CONVENTIONS:
- Yellow/amber rectangles = decision points (all have "?" labels); white rectangles = process steps; rounded pills = terminal outcomes (green = success, red = failure); orange/salmon rectangles = corrective/retry actions.
- Edge colors appear to track path semantics: blue = normal forward flow in validation, orange = correction/retry loops, purple = payment checking/fraud escalation, green = success path, red = failure path.
- Dashed red = exceptional/limit-triggered transition (retries exhausted). The floating yellow note carries the retry policy (max 3) that the dashed edge encodes.

UNCERTAIN:
- The orange "No" edge into Retry payment: its upper end starts very close to where the purple "Check" edge leaves Authorize payment and to the left edge of Payment authorized?. I read it as Payment authorized? —No→ Retry payment, but the actual attachment point is visually ambiguous between Payment authorized? and the Authorize payment→Payment authorized? wire.
- The green "No" line from Fraud suspected? runs straight up (at the right edge of the Payment section) and meets the horizontal green "Yes" line from Payment authorized? to Pack & ship. I cannot tell whether these are two edges that both terminate at Pack & ship or whether "No" merges into the "Yes" wire — the junction is drawn as a merge, so the No path's independent arrowhead into Pack & ship is not visible.
- In the validation section, a small "No" chip sits almost on top of the point where the "Corrected" horizontal wire crosses the vertical Order valid?→Request correction wire; the two orange wires cross at nearly the same point, so at a glance "No"/"Corrected" label ownership must be inferred from position rather than being unambiguous.
- The "Payment retries: max 3..." yellow note has no connector; its association with Retry payment/the dashed edge is inferred from content only.
- The "Yes" chip between Order valid? and Authorize payment sits on a blue wire that crosses the section gap; the chip is closer to Authorize payment than to Order valid?, but I attributed it to the Order valid? exit.

---

## eval-v4-state-machine.svg.png

TOPIC: A network/connection lifecycle state machine (Idle → Connecting → Connected, with Degraded, Suspended, Reconnecting, Disconnecting states) showing failure and recovery semantics.

NODES:
- "Idle" — gray rectangle
- "Connecting" — blue rectangle
- "Connected" — green rectangle
- "Degraded" — yellow/amber rectangle
- "Suspended" — purple rectangle
- "Reconnecting" — orange rectangle
- "Disconnecting" — teal/cyan rectangle
- "↻ heartbeat / 30s" — green rounded pill floating above/left of Connected, not wired to anything
- "Failure semantics" — yellow note box, top-left: "timeout resets to Idle; packet loss > 5% degrades the link; grace expiry starts Reconnecting. All three paths steer back toward reconnection and a healthy session."
- Two red circled-plus (⊕) markers: one above Idle, one above Connecting, joined by the dashed "timeout" wire
- One gray circled-plus (⊕) marker below/left of Degraded near the "recovered" label

EDGES:
- Idle → Connecting (connect()) — gray solid
- Connecting → Connected (handshake OK) — gray solid
- Connecting → Idle (timeout) — red DASHED; routed up from Connecting to a red ⊕ marker, left along the "timeout" chip to a second red ⊕ marker, then down into Idle (arrowheads point left then down, i.e., toward Idle)
- Connected → Degraded (packet loss > 5%) — red DASHED, going up from the Connected area to Degraded's underside (see UNCERTAIN re: exact source)
- Degraded → Connected (recovered) — gray solid; leaves Degraded, passes the "recovered" chip, hits the gray ⊕ marker, then a gray wire curves down and right and approaches Connected's left side (see UNCERTAIN re: merge with handshake wire)
- Degraded → Suspended (quarantine) — purple solid, up and right
- Connected → Suspended (suspend()) — purple solid, straight up
- Degraded → Reconnecting (grace expired) — red DASHED, long horizontal run to the right (arrow near Reconnecting appears purple — see UNCERTAIN)
- Suspended → Reconnecting (resume window) — purple solid, down the right side
- Reconnecting → Connected (session resumed) — gray solid, down the vertical labeled "session resumed" (see UNCERTAIN re: source attachment)
- Connected → Disconnecting (close()) — teal solid, down then right
- Disconnecting → Idle (socket closed) — teal solid, long run left along the bottom then up into Idle

GROUPS: No lanes/sections. Loose spatial grouping only: happy path along the middle row (Idle, Connecting, Connected); degradation/suspension cluster at top (Degraded, Suspended, Reconnecting); teardown at bottom-right (Disconnecting). Color-coding of state boxes appears to be per-state identity rather than group membership.

ORDER: Start at Idle. Main path: Idle —connect()→ Connecting —handshake OK→ Connected. From Connected: normal shutdown via close()→ Disconnecting —socket closed→ Idle (full loop). Failure branches: Connecting —timeout→ Idle (dashed); Connected —packet loss > 5%→ Degraded (dashed); Degraded —recovered→ Connected, or —quarantine→ Suspended, or —grace expired→ Reconnecting (dashed). Suspended —resume window→ Reconnecting. Reconnecting —session resumed→ Connected. Connected —suspend()→ Suspended. The floating heartbeat pill suggests a 30s self-heartbeat while Connected.

CONVENTIONS:
- Red DASHED edges = failure/error-triggered transitions (timeout, packet loss, grace expired) — matching the three failure paths enumerated in the note.
- Purple solid = suspension/resume-related transitions; teal solid = clean shutdown path; gray solid = normal operational transitions.
- Red ⊕ markers appear to be waypoint/junction glyphs on the failure wire; a gray ⊕ appears on the recovered wire. Their exact semantics (junction vs. terminator vs. decorative bend marker) are not evident from the picture.

UNCERTAIN:
- The ⊕ symbols: the timeout wire passes through two red ⊕ circles at its corners, and the recovered wire has a gray ⊕ at its corner. I cannot tell if these are semantic (e.g., fork/join or "consumed event" markers) or rendering artifacts at bend points.
- "recovered" wiring: the arrow near the chip points from Degraded down toward the gray ⊕; from the ⊕ a gray wire curves down/right and appears to MERGE with the Connecting→Connected "handshake OK" wire before entering Connected. So Degraded→Connected via recovered is my best reading, but the shared final segment into Connected makes the terminus a merged wire, not an independent arrowhead.
- "packet loss > 5%" dashed edge: its lower end starts in a congested area where the purple suspend() wire and the session-resumed gray wire also run near Connected's top. Source = Connected is inferred; the exact attachment point is obscured.
- At Reconnecting's left side, the red dashed "grace expired" wire and the purple "resume window" wire converge in the same region, and the visible arrowhead into Reconnecting looks purple. Either both edges terminate there with overlapping heads, or the dashed wire merges into the purple one; can't be certain which.
- "session resumed": the labeled gray vertical descends to Connected's right side, but its top end lies at the same junction area near Reconnecting/grace-expired corner; I attribute it to Reconnecting, but the picture would also support it originating at that wire junction rather than the Reconnecting box itself.
- The heartbeat pill has no wire at all; whether it annotates Connected (self-loop) is inference from proximity.
- The "socket closed" chip sits mid-way along the long bottom teal wire, far from both endpoints; attribution to the Disconnecting→Idle edge is by tracing, and the wire passes beneath other elements on the way.

---

## eval-v4-swimlane.svg.png

TOPIC: A request-processing pipeline across five swimlanes (Frontend, API, Data, Observability, Workers): synchronous request handling plus async job processing, with results persisted and progress reported back to the UI.

NODES:
- Frontend lane: "Submit Form" (green), "Validate Input" (white), "Show Progress" (orange), "Render Result" (green)
- API lane: "Parse Request" (blue), "Auth Check" (white), "Enqueue Job" (orange), "Serve Result" (green)
- Data lane: "Job Queue" (orange), "Results DB" (blue), "Object Store" (blue)
- Observability lane: "Trace Requests" (white), "Collect Metrics" (cyan/teal)
- Workers lane: "Pick Up Job" (orange), "Process Data" (white), "Write Results" (blue)
- Note box (orange, top-left, outside lanes): "REQUEST PIPELINE — Validate at the edge, enqueue async work, persist results, then return progress and output to the UI. Dashed: async / Solid: synchronous"

EDGES:
- Submit Form → Validate Input (unlabeled) — gray solid
- Validate Input → Show Progress (unlabeled) — gray solid, long horizontal
- Show Progress → Render Result (unlabeled) — gray solid
- Validate Input → Parse Request (submit) — blue solid, down into API lane
- Parse Request → Auth Check (unlabeled) — gray solid
- Auth Check → Enqueue Job (unlabeled) — gray solid
- Enqueue Job → Serve Result (unlabeled) — gray solid, long horizontal
- Enqueue Job → Job Queue (enqueue) — orange DASHED, down into Data lane
- Job Queue → Results DB (unlabeled) — gray solid, long horizontal
- Results DB → Object Store (unlabeled) — gray solid
- Results DB → Serve Result (read) — blue solid, up into API lane
- Serve Result → Render Result (serve) — green solid, up into Frontend lane
- Parse Request → Trace Requests (spans) — orange DASHED; drops from Parse Request and arrives at Trace Requests' top; a long companion dashed detour runs to the far-left edge through the "spans" chip (see UNCERTAIN)
- Job Queue → Pick Up Job (poll) — orange DASHED; routed far left around/through lane boundaries past the "poll" chip, then down and right into Pick Up Job (direction per arrowhead into Pick Up Job; see UNCERTAIN)
- Pick Up Job → Process Data (unlabeled) — gray solid
- Process Data → Write Results (unlabeled) — gray solid
- Write Results → Results DB (write) — blue solid, routed up the right side; "write" chip sits at the far right on this wire
- Process Data → Collect Metrics (metrics) — orange DASHED, up into Observability lane
- Process Data (or Write Results — see UNCERTAIN) → Show Progress (status) — orange DASHED, routed all the way around the right edge of the board, up past the "status" chip, then left along the top into Show Progress's underside

GROUPS:
- "Frontend" (light blue lane) — user-facing UI steps
- "API" (light teal lane) — synchronous request handling
- "Data" (light yellow lane) — persistence: queue, DB, object store
- "Observability" (light pink lane) — tracing and metrics sinks
- "Workers" (light purple lane) — async job execution

ORDER: Start at Submit Form (Frontend, top-left). Sync path: Submit Form → Validate Input —submit→ Parse Request → Auth Check → Enqueue Job → Serve Result; meanwhile Validate Input → Show Progress → Render Result in the Frontend lane. Async path: Enqueue Job —enqueue→ Job Queue —poll→ Pick Up Job → Process Data → Write Results —write→ Results DB; Results DB —read→ Serve Result —serve→ Render Result; Results DB → Object Store. Side taps: Parse Request —spans→ Trace Requests; Process Data —metrics→ Collect Metrics; a long dashed —status→ feedback wire returns from the Workers area to Show Progress.

CONVENTIONS:
- Explicitly legended in the note: dashed = async, solid = synchronous.
- Orange dashed = async messaging (enqueue, poll, spans, metrics, status). Blue solid = data-plane sync calls (submit, read, write). Green solid = result delivery (serve). Gray solid = in-lane sequential steps.
- Box fills loosely signal roles: green = user-visible start/end, orange = queue/progress-related, blue = storage/IO-adjacent, white = plain processing.

UNCERTAIN:
- The far-left dashed routing is the most ambiguous area of the board: TWO dashed paths run down the left margin close together, passing the "spans" chip (at the Data-lane level, far left) and the "poll" chip (just above the Observability lane). I paired "spans" with Parse Request→Trace Requests and "poll" with Job Queue→Pick Up Job based on which wires plausibly connect, but the chips sit on long detour segments far from both endpoints, and the two paths cross/overlap near the Data-lane boundary — the pairing could be swapped.
- The "status" dashed wire's origin: it emerges in the Workers-lane region between Process Data and the metrics wire (there is a dashed junction near the top of Process Data where the metrics wire and the rightward status wire appear to touch). I attribute the status feedback to Process Data, but Write Results (or even a tap off the metrics wire) is visually possible.
- Job Queue → Pick Up Job "poll" direction: the visible arrowhead is into Pick Up Job, which reads as "queue delivers job", though "poll" semantically implies the reverse initiation; the drawn direction is what I report.
- The dashed segment near Trace Requests: the arrow into Trace Requests comes from a wire descending at Parse Request's x-position, but that same vertical region also carries the enqueue-adjacent dashed; in the congestion around the Data-lane boundary I cannot fully separate the two dashed wires.
- "write" chip placement: it sits at the extreme right edge, far from Write Results and Results DB; assignment to the Write Results→Results DB blue wire is by tracing the only blue wire passing it.
- Whether Enqueue Job → Serve Result solid edge means "respond immediately with job accepted" vs. simple lane sequence is not determinable from the picture.

---

## eval-v4-org-tree.svg.png

TOPIC: A company org chart: CEO over five departments (Engineering, Product, Marketing, Research, Operations), each led by a VP with reporting teams, plus one interim dotted-line reporting arrangement.

NODES:
- "CEO — Dana Whitfield" — blue box, top center
- "VP Engineering / Priya Natarajan" — blue box (Engineering section)
- "VP Product / Marcus Bell" — blue box (Product section)
- "VP Marketing / Lena Kovacs" — blue box (Marketing section)
- "VP Research / Dr. Amara Osei" — blue box (Research section)
- "VP Operations / Sofia Reyes" — blue box (Operations section)
- Gray team boxes — Engineering: "Platform Team", "Frontend Team", "Infra Team", "Security Team"; Product: "Design Team", "Research Ops", "Growth Team"; Marketing: "Brand Team", "Events Team", "Community Team"; Research: "Applied ML Team", "Data Science Team"; Operations: "Finance Team", "People Team"
- Yellow note box (left): "Interim: Growth also reports to Marketing while Product backfills the director role."

EDGES (all unlabeled gray solid unless noted):
- CEO — Dana Whitfield → VP Engineering (unlabeled)
- CEO — Dana Whitfield → VP Product (unlabeled)
- CEO — Dana Whitfield → VP Marketing (unlabeled)
- CEO — Dana Whitfield → VP Research (unlabeled)
- CEO — Dana Whitfield → VP Operations (unlabeled)
- VP Engineering → Platform Team / Frontend Team / Infra Team / Security Team (4 edges, unlabeled)
- VP Product → Design Team / Research Ops / Growth Team (3 edges, unlabeled)
- VP Marketing → Brand Team / Events Team / Community Team (3 edges, unlabeled)
- VP Research → Applied ML Team / Data Science Team (2 edges, unlabeled)
- VP Operations → Finance Team / People Team (2 edges, unlabeled)
- VP Marketing → Growth Team (acting) — orange, partially DASHED, crossing from the Marketing section leftward into the Product section, terminating with a solid orange arrow down into Growth Team

GROUPS:
- "Engineering" — teal-tinted section (VP Engineering + 4 teams)
- "Product" — purple-tinted section (VP Product + 3 teams)
- "Marketing" — orange-tinted section (VP Marketing + 3 teams)
- "Research" — pink-tinted section (VP Research + 2 teams)
- "Operations" — yellow-tinted section (VP Operations + 2 teams)

ORDER: Read top-down: CEO at the apex fans out to five VPs, one per tinted department section; each VP fans down to their teams (leaf nodes). The single cross-section wire is the orange "acting" edge from VP Marketing to Product's Growth Team, which the yellow note explains as an interim dual-report while Product backfills a director.

CONVENTIONS:
- Blue boxes = named leadership (CEO/VPs); gray boxes = teams (no named individuals); tinted background sections = departments.
- Gray solid tree edges = solid-line reporting; orange dashed = temporary/dotted-line ("acting") reporting relationship; yellow note = commentary on the exception.

UNCERTAIN:
- The "acting" edge's exact source: the orange wire descends from directly beneath VP Marketing (Lena Kovacs), but that same vertical corridor also carries the gray tree wire from VP Marketing to her own teams; the orange and gray wires overlap for the first vertical stretch, so the orange edge could technically be tapping the Marketing tree trunk rather than the VP box itself. VP Marketing is the overwhelmingly likely source given the note.
- The acting edge is dashed for its horizontal stretch but the final vertical drop into Growth Team looks solid orange — I treat it as one edge with inconsistent rendering, but it could be two separate wires meeting at that corner.
- CEO fan-out arrowheads: several arrows enter the department sections at the section edge near (not touching) the VP boxes — e.g., the Engineering arrowhead lands to the right of VP Engineering's box, and the Research/Operations arrowheads land at the sections' upper-left. I read all five as CEO→VP edges, but strictly the arrowheads point into the sections rather than cleanly abutting each VP box.
- No labels exist on any tree edge, so "reports to" semantics are inferred from org-chart convention, not from the picture.

---

## eval-v4-nested-arch.svg.png

TOPIC: A cloud architecture diagram of an event-driven order platform inside a Production VPC: edge ingress, four microservices with typed ports, an event bus carrying domain events, and a data tier (Postgres, Redis).

NODES:
- Outer container: "Production VPC" (gray outline)
- Edge section: "CDN / WAF" (white rect), "API Gateway" (white rect)
- Services section: "Orders Service", "Inventory Service", "Billing Service", "Notifications Service" (all white rects)
- Port chips in a column at the Services section's right edge (rounded pills): "DATA" (teal, top, at Orders' level), "PUBLISH" (orange, at Orders' level), "PUBLISH" (orange, at Inventory's level), "CONSUME" (orange, at Inventory's level), "DATA" (teal, at Inventory's level), "PUBLISH" (orange, at Billing's level), "CACHE" (teal, at Billing's level), "CONSUME" (orange, at Notifications' level), "CONSUME" (orange, at Notifications' level, second)
- "Event Bus" — orange rectangle, sitting in the gap between the Services and Data sections
- Data section: "ORDERS I/O" (teal pill), "Postgres" (white rect), "INVENTORY I/O" (teal pill), "Redis Cache" (white rect)
- Yellow note (far left): "Event-driven order platform; all cross-service state flows through the bus"

EDGES:
- CDN / WAF → API Gateway (ingress) — blue solid
- API Gateway → Orders Service (REST) — blue solid
- API Gateway → Billing Service (REST) — blue solid (one wire leaving the gateway forks up to Orders and down to Billing; each branch has its own REST chip)
- DATA (Orders-level port) → ORDERS I/O (read/write) — teal solid
- DATA (Inventory-level port) → INVENTORY I/O (read/write) — teal solid
- CACHE (Billing-level port) → Redis Cache (session cache) — teal solid
- PUBLISH (Orders-level) → Event Bus (order.created) — orange; dashed leaving the port, becoming a solid orange arrow into the Event Bus's left side at the "order.created" chip nearest the bus
- PUBLISH (Inventory-level) → Event Bus (stock.changed) — orange dashed via the vertical dashed trunk at the chips column (see UNCERTAIN)
- Event Bus → CONSUME (Inventory-level) (order.created) — orange dashed, arrowhead pointing left into the CONSUME pill
- PUBLISH (Billing-level) → Event Bus (invoice.issued) — orange dashed (chip "invoice.issued" at that level on the dashed trunk)
- Event Bus → CONSUME (Notifications-level) (invoice.issued) — orange dashed; a dashed wire descends from the Event Bus area, runs left through the "invoice.issued" chip, then down to the upper CONSUME pill
- Event Bus → CONSUME (Notifications-level, second) (order.created) — orange dashed through the "order.created" chip at that level down to the lower CONSUME pill

GROUPS:
- "Production VPC" — outermost gray container holding everything except the yellow note
- "Edge" — light blue nested section: CDN/WAF, API Gateway
- "Services" — light purple nested section: the four services plus their port-chip column
- "Data" — light green nested section: ORDERS I/O, Postgres, INVENTORY I/O, Redis Cache
- The Event Bus sits BETWEEN Services and Data, inside the VPC but belonging to neither nested section
- Port-chip proximity implies ownership: DATA+PUBLISH ↔ Orders; PUBLISH+CONSUME+DATA ↔ Inventory; PUBLISH+CACHE ↔ Billing; CONSUME+CONSUME ↔ Notifications

ORDER: Start at CDN/WAF (top-left, Edge) —ingress→ API Gateway —REST→ Orders Service and Billing Service. Services then interact two ways: (1) synchronous data-plane teal wires from DATA/CACHE ports into the Data tier (Orders read/write ORDERS I/O; Inventory read/write INVENTORY I/O; Billing session-cache to Redis); (2) async event flow through the Event Bus: Orders publishes order.created; Inventory publishes stock.changed and consumes order.created; Billing publishes invoice.issued; Notifications consumes invoice.issued and order.created. Per the note, all cross-service state flows through the bus.

CONVENTIONS:
- Nested tinted rectangles = deployment/logical zones (VPC > Edge/Services/Data).
- Rounded pill chips attached to services = typed ports: teal pills (DATA/CACHE, and ORDERS I/O / INVENTORY I/O on the data side) = state/storage interfaces; orange pills (PUBLISH/CONSUME) = event-bus interfaces.
- Blue solid = synchronous request traffic (ingress, REST); teal solid = storage read/write traffic; orange dashed = async event topics, with small label chips (order.created, stock.changed, invoice.issued) naming the topic on each wire; orange solid arrow = event delivery into the bus.
- White rects = compute/storage components; the orange Event Bus box is the central hub the note refers to.

UNCERTAIN:
- The event wiring shares a single vertical dashed trunk (running just right of the port column) that four topic chips hang on ("order.created", "stock.changed", "order.created", "invoice.issued" from top to bottom). Multiple publish/consume wires merge into this trunk before reaching the Event Bus, so exact port→topic pairing is partly inferred from vertical adjacency rather than continuously traceable wires. In particular: whether the Orders-level PUBLISH carries the upper "order.created" chip while the solid arrow into the bus carries the lower "order.created" chip, and where exactly "stock.changed" attaches into the bus, cannot be traced unambiguously.
- Only ONE orange arrowhead visibly enters the Event Bus (at the order.created solid segment). The stock.changed and invoice.issued publish wires appear to join the same trunk without their own visible arrowheads into the bus — direction for those is inferred from PUBLISH port semantics, not from drawn arrows.
- Postgres has NO visible wire attached to it. The teal ORDERS I/O and INVENTORY I/O pills sit in the Data section (I/O pills presumably front Postgres given placement — ORDERS I/O above it, INVENTORY I/O below it), but the picture never draws pill→Postgres edges; that association is pure inference.
- A dashed wire descends from the Event Bus's underside and another from near the CACHE pill region toward the Notifications CONSUME pills; around the "invoice.issued"/"order.created" chips at Billing/Notifications level, two dashed wires run parallel and cross the teal session-cache wire — I cannot fully disentangle which dashed segment feeds which CONSUME pill; the top-to-top / bottom-to-bottom pairing I reported is the cleanest reading.
- The dashed wire between the two Notifications CONSUME pills (a short dashed hook connecting the upper and lower pill area) is ambiguous — it may be one wire splitting to both pills rather than two independent deliveries.
- Inventory Service has no REST wire from the API Gateway, and Notifications Service has no inbound wire other than its CONSUME ports — the picture supports "bus-only" access for those two, but the gateway wire fork is drawn tightly and a third branch could plausibly be hidden behind the Services section border (I did not see one).
- Port-chip ownership is by proximity only; no wires connect the pills to their parent service boxes.
