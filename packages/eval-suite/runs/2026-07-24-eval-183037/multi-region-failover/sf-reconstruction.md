# SF blind system reconstruction

## SYSTEM PURPOSE
A multi-region, multi-availability-zone commerce system designed to route customers to healthy regional stacks, process checkout/orders/payments with idempotency and replication, detect regional failure, promote a replica, change DNS/edge routing, and later fail back through validation and controlled writer return.

## COMPONENTS
- Diagram/run identifier: Identifies the depicted multi-region failover evaluation. [Top label reads "2026-07-24-eval-183037 · multi-region-failover".]
- Global traffic edge: Contains customer resolution, global DNS health routing, anycast ingress, capacity protection, and regional eligibility checks. [Top blue container is labeled "Global traffic edge".]
- Customers: Originate requests that are resolved through global routing. [Person icon labeled "Customers" appears at the left of the global traffic edge, followed by an arrow labeled "resolve".]
- Global DNS health routing: Routes resolved customer traffic toward the nearest healthy destination. [Globe icon labeled "Global DNS health routing" has an outgoing arrow labeled "nearest healthy".]
- Anycast edge nearest healthy ingress: Acts as the anycast edge and selects the nearest healthy regional ingress. [Blue box reads "Anycast edge / nearest healthy ingress" and blue branches descend from it to Regions A, B, and C.]
- Capacity guard + load shedding: Applies capacity admission protection and load shedding before regional eligibility is accepted. [Orange box labeled "Capacity guard + load shedding" is reached over an arrow labeled "admit".]
- Region eligible?: Represents the eligibility decision after capacity checks and tested limits. [Orange decision box reads "Region eligible?" and is preceded by an arrow labeled "tested limits".]
- Region A · multi-AZ: Hosts a complete regional application stack distributed across multiple availability zones. [Left aqua regional container is labeled "Region A · multi-AZ".]
- Region B · multi-AZ: Hosts a complete regional application stack distributed across multiple availability zones. [Center aqua regional container is labeled "Region B · multi-AZ".]
- Region C · multi-AZ: Hosts a complete regional application stack distributed across multiple availability zones. [Right aqua regional container is labeled "Region C · multi-AZ".]
- Regional ingress instances: Receive edge-routed traffic inside each region. [Each of Regions A, B, and C contains a globe icon labeled "Ingress"; blue routing branches terminate at the three regional containers.]
- Regional Web app instances: Serve the web application and pass web requests toward the API. [Each region contains a gray box labeled "Web app"; Region A visibly connects toward its API gateway with the label "web → API".]
- Regional API gateway instances: Receive application API traffic and initiate checkout. [Each region contains a blue box labeled "API gateway"; in Region A a downward arrow labeled "checkout" leads to Checkout.]
- Regional Identity cache instances: Provide regional identity caching. [Each region contains a gray box labeled "Identity cache".]
- Regional Catalog instances: Provide catalog functionality that remains available during checkout pause. [Each region contains a gray box labeled "Catalog"; the operations flow says "Pause checkout / carts + catalog remain available".]
- Regional Cart instances: Provide cart functionality that remains available during checkout pause. [Each region contains a gray box labeled "Cart"; the operations flow says "carts + catalog remain available".]
- Regional Checkout instances: Process checkout and hand work to the order coordination path. [Each region contains an orange box labeled "Checkout"; Region A receives the API gateway arrow labeled "checkout".]
- Regional Order coordinator instances: Coordinate orders, with a visible home-region relationship in Region A. [Each region contains an orange box labeled "Order coordinator"; Region A has an incoming line from Checkout labeled "home region".]
- Regional Worker pool instances: Provide regional background worker capacity. [Each region contains a gray box labeled "Worker pool".]
- Regional Event bus instances: Provide regional event transport. [Each region contains a purple icon labeled "Event bus".]
- Regional Redis cluster instances: Provide regional Redis storage or caching. [Each region contains a gray box labeled "Redis cluster".]
- Regional Independent collector instances: Independently collect regional signals or telemetry. [Each region contains a green waveform icon labeled "Independent collector".]
- Regional resilience layer: Provides service discovery and circuit breakers within each region. [The bottom band in every regional container reads "**Regional resilience** / - service discovery / - circuit breakers...".]
- Global data, events & payments: Contains globally shared persistence, replication, payment adaptation, payment providers, and dead-letter handling. [Lower-left purple container is labeled "Global data, events & payments".]
- Globally replicated document store: Stores documents with global replication. [Purple box is labeled "Globally replicated document store".]
- Multi-region KV: Stores cart ownership and conditional data across regions. [Purple box reads "Multi-region KV / cart owner + conditional...".]
- Regional SQL: Stores orders and outbox records atomically in a regional SQL system. [Orange box reads "Regional SQL / order + outbox atomic...".]
- CDC to warm replicas: Propagates change-data-capture updates to warm replicas. [Purple box is labeled "CDC to warm replicas".]
- Replication bridge: Provides deduplication, quarantine, and replay for replicated data/events. [Purple box reads "Replication bridge / dedupe · quarantine · replay".]
- Global payment adapter: Submits payment operations globally using an idempotency key. [Blue box reads "Global payment adapter / idempotency key" and is fed by a blue line labeled "idempotent request".]
- Payment provider 1: Acts as one external payment-processing destination. [First gray provider icon is labeled "Payment provider 1" and receives a solid gray arrow from the payment adapter.]
- Payment provider 2: Acts as an alternate external payment-processing destination. [Second gray provider icon is labeled "Payment provider 2" and is reached by a dashed gray path from the adapter area.]
- Regional DLQ: Holds regional dead-letter metadata associated with the operations account. [Gray bin icon is labeled "Regional DLQ / metadata → ops account".]
- Global control plane & safety gates: Monitors health, scopes failures, removes unhealthy regions from new traffic, checks recovery lag, coordinates replica promotion, records audit, and emits operational status. [Lower-right orange container is labeled "Global control plane & safety gates".]
- Global control plane: Owns the global monitoring and failover-control sequence. [Orange gear icon is labeled "Global control plane" beside the monitoring and failure-scope path.]
- Probes · collectors · DB lag · bus lag: Aggregates probe, collector, database-lag, and bus-lag signals for failure evaluation. [Gray box reads "Probes · collectors · DB lag · bus lag".]
- Failure scope: Determines the scope of a detected failure and drives traffic removal and recovery gating. [Orange box labeled "Failure scope" has outgoing paths toward "Remove region from new traffic" and "Lag within RPO?".]
- Remove region from new traffic: Stops sending new traffic to an unhealthy region. [Orange box reads "Remove region from new traffic"; its incoming connector includes the readable fragment "region unheal...".]
- Quorum writer lease single holder: Constrains write ownership to one lease holder. [Orange key icon is labeled "Quorum writer lease / single holder".]
- Lag within RPO?: Gates promotion based on whether replication lag is within the recovery point objective. [Orange decision box reads "Lag within / RPO?".]
- Promote replica then change DNS / edge: Promotes a replica and only then changes DNS or edge routing. [Green box explicitly reads "Promote replica / then change DNS / edge".]
- Immutable global audit: Records failover/control activity in an immutable global audit trail. [Purple box is labeled "Immutable global audit" and is connected bidirectionally with the promotion box.]
- Paging · incident · status: Provides paging, incident, and status operational outputs. [Orange lightning icon is labeled "Paging · incident · status".]
- Failover, failback & operations: Defines the ordered operational process from home-region loss through service continuation, promotion, recovery, validation, shadow traffic, and possible writer return. [Bottom gray container is labeled "Failover, failback & operations".]
- Detect + classify home-region loss: Detects and classifies complete loss of the home region. [Red box reads "Detect + classify / home-region loss".]
- Pause checkout; carts + catalog remain available: Pauses checkout during full loss while preserving cart and catalog access. [Orange box reads "Pause checkout / carts + catalog remain available".]
- Move writer lease; promote + resume outbox: Moves write ownership, promotes the replacement, and resumes outbox processing. [Green box reads "Move writer lease / promote + resume outbox".]
- Rejoin as read replica; catch up + checksums + offsets: Returns a recovered region as a read replica and verifies catch-up state, checksums, and offsets. [Blue box reads "Rejoin as read replica / catch up + checksums + offsets".]
- Shadow traffic before serving users: Tests the recovered region with shadow traffic before it serves users. [Blue box reads "Shadow traffic / before serving users".]
- Controlled writer return?: Represents a separate decision or operation for returning writer ownership. [Orange box reads "Controlled / writer return?" and is reached over a connector labeled "separate operation".]
- Safety invariants: States explicit safeguards for recovery ordering, retry safety, identity expiry, and original-region health. [Yellow note is headed "### Safety invariants" and lists four invariant statements.]

## FLOWS
- control · Global customer admission and eligibility evaluation: Customers → resolve → Global DNS health routing → nearest healthy → Anycast edge nearest healthy ingress → admit → Capacity guard + load shedding → tested limits → Region eligible? [The top row shows a left-to-right arrow sequence with the labels "resolve", "nearest healthy", "admit", and "tested limits" between the named components.]
- data · Edge distribution to regional ingress: Anycast edge nearest healthy ingress → Branch to Region A · multi-AZ → Branch to Region B · multi-AZ → Branch to Region C · multi-AZ → Regional Ingress [A blue line descends from the anycast edge and splits into three branches terminating with downward arrowheads at Regions A, B, and C.]
- data · Visible Region A request and checkout path: Ingress → Web app → web → API → API gateway → checkout → Checkout → home region → Order coordinator [Region A contains connected lines among Ingress, Web app, API gateway, Checkout, and Order coordinator, with readable labels "web → API", "checkout", and "home region".]
- data · Idempotent payment request path: Regional order/checkout path → idempotent request → Global payment adapter idempotency key → Payment provider 1 [A blue route leaves the regional area with the label "idempotent request", enters "Global payment adapter / idempotency key", and a solid gray arrow points to Payment provider 1.]
- data · Alternate payment-provider path: Global payment adapter area → Dashed alternate route → Payment provider 2 [A dashed gray path arches from the adapter/provider-1 area and terminates with an arrow at Payment provider 2.]
- data · Regional order and outbox persistence/replication: Order coordinator → order + outbox → Regional SQL order + outbox atomic... → CDC to warm replicas → Replication bridge dedupe · quarantine · replay [An orange line descends from Region A's Order coordinator to Regional SQL with the label "order + outbox"; adjacent boxes are ordered "CDC to warm replicas" and "Replication bridge dedupe · quarantine · replay".]
- control · Health-signal evaluation: Probes · collectors · DB lag · bus lag → Global control plane → Failure scope [Within the control-plane container, the monitoring box is connected leftward toward the Global control plane and rightward/downstream toward Failure scope.]
- failure · Unhealthy-region traffic removal: Failure scope → Region unhealthy condition → Remove region from new traffic [A connector from "Failure scope" leads to "Remove region from new traffic"; the intervening label is partly visible as "region unheal...".]
- failure · Failover promotion safety-gate path: Failure scope → Lag within RPO? → Promote replica then change DNS / edge → Coordinate with Quorum writer lease single holder [An orange line descends from Failure scope to "Lag within RPO?" and continues to the promotion box; a green line runs from promotion toward the key labeled "Quorum writer lease / single holder".]
- control · Promotion audit exchange: Promote replica then change DNS / edge → Immutable global audit → Return/control exchange [Opposing green and purple arrowheads appear on the connector between the promotion box and "Immutable global audit".]
- control · Operational notification/status path: Immutable global audit/control activity → Paging · incident · status [A horizontal connector runs from the audit area toward the lightning icon labeled "Paging · incident · status"; part of its label is occluded.]
- failure · Ordered failover and failback operations: Detect + classify home-region loss → full loss → Pause checkout; carts + catalog remain available → RPO + quorum → Move writer lease; promote + resume outbox → region recovers → Rejoin as read replica; catch up + checksums + offsets → validated → Shadow traffic before serving users → separate operation → Controlled writer return? [The bottom operations band presents these boxes left-to-right with arrows and the labels "full loss", "RPO + quorum", "region recovers", "validated", and "separate operation".]

## FAILURE PATHS
- A region is judged unhealthy from probes, collectors, DB lag, or bus lag.: Probes · collectors · DB lag · bus lag → Global control plane → Failure scope → Remove region from new traffic → The unhealthy region is removed from new traffic. [The control-plane sequence connects the monitoring box and Failure scope to the box explicitly labeled "Remove region from new traffic".]
- Failure scope requires failover and lag is within RPO.: Failure scope → Lag within RPO? → Promote replica then change DNS / edge → Quorum writer lease single holder → A replica is promoted before DNS/edge is changed, while write ownership remains governed by a single-holder quorum lease. [The decision "Lag within RPO?" precedes the green box "Promote replica then change DNS / edge", which connects to "Quorum writer lease / single holder".]
- Full home-region loss.: Detect + classify home-region loss → full loss → Pause checkout → Checkout is paused, but carts and catalog remain available. [A red arrow labeled "full loss" leads from detection/classification to the box reading "Pause checkout / carts + catalog remain available".]
- The RPO and quorum gate is satisfied after checkout has been paused.: Pause checkout; carts + catalog remain available → RPO + quorum → Move writer lease → Promote → Resume outbox → Writer ownership moves, the replacement is promoted, and outbox processing resumes. [The operations arrow labeled "RPO + quorum" enters "Move writer lease / promote + resume outbox".]
- The failed region recovers.: Move writer lease; promote + resume outbox → region recovers → Rejoin as read replica → Catch up → Verify checksums and offsets → validated → Shadow traffic before serving users → The recovered region rejoins only as a read replica, catches up, is validated, and receives shadow traffic before serving users. [The bottom sequence explicitly labels "region recovers" and "validated" between the rejoin/check and shadow-traffic boxes.]
- Shadow testing is complete and writer return is being considered.: Shadow traffic before serving users → separate operation → Controlled writer return? → Writer return is treated as a separate controlled decision rather than an automatic part of recovery. [The connector from "Shadow traffic before serving users" to "Controlled writer return?" is labeled "separate operation".]
- Lag is not within RPO.: Failure scope → Lag within RPO? → No explicit negative branch or resulting action is shown. [The diagram shows the "Lag within RPO?" decision and a promotion route, but no visibly labeled negative branch.]
- A region fails the "Region eligible?" decision.: Capacity guard + load shedding → tested limits → Region eligible? → No explicit ineligible branch or final action is shown. [The top path ends at the "Region eligible?" decision box without a visible negative branch.]

## CONSTRAINTS & BOUNDARIES
- All three application regions are multi-AZ. [The regional headers read "Region A · multi-AZ", "Region B · multi-AZ", and "Region C · multi-AZ".]
- Traffic should be directed to the nearest healthy ingress. [The DNS-to-anycast connector is labeled "nearest healthy", and the anycast box says "nearest healthy ingress".]
- Admission is subject to capacity guarding, load shedding, tested limits, and regional eligibility. [The top routing chain contains "admit", "Capacity guard + load shedding", "tested limits", and "Region eligible?".]
- Regional service operation includes service discovery and circuit breakers. [Every regional resilience band lists "service discovery" and "circuit breakers...".]
- Payment requests use an idempotency key. [The request route is labeled "idempotent request" and the adapter reads "Global payment adapter / idempotency key".]
- Regional SQL couples order and outbox atomically. [The SQL box reads "Regional SQL / order + outbox atomic...".]
- Replication processing includes deduplication, quarantine, and replay. [The Replication bridge box explicitly lists "dedupe · quarantine · replay".]
- Replica promotion is gated by lag being within RPO. [The control-plane decision immediately before promotion reads "Lag within RPO?".]
- Replica promotion occurs before DNS/edge changes. [The green action box explicitly says "Promote replica / then change DNS / edge".]
- The quorum writer lease has a single holder. [The key label reads "Quorum writer lease / single holder".]
- Failover control activity is recorded in an immutable global audit. [The control plane contains a connected box labeled "Immutable global audit".]
- During full home-region loss, checkout is paused while carts and catalog remain available. [The failover sequence contains the explicit action "Pause checkout / carts + catalog remain available".]
- Promotion and writer-lease movement require RPO plus quorum. [The connector into "Move writer lease / promote + resume outbox" is labeled "RPO + quorum".]
- A recovered region rejoins as a read replica and must catch up with checksums and offsets. [The recovery box reads "Rejoin as read replica / catch up + checksums + offsets".]
- Validation precedes shadow traffic, and shadow traffic precedes serving users. [The connector into the shadow box is labeled "validated", and the box says "Shadow traffic / before serving users".]
- Writer return is a separate controlled operation. [The final connector is labeled "separate operation" and ends at "Controlled writer return?".]
- Checkout/order recovery outranks catalog personalization. [The Safety invariants note states "Checkout/order recovery outrank catalog personalization."]
- Existing order IDs may retry safely, and payment idempotency prevents duplicates. [The Safety invariants note states "Existing order IDs retry safely; payment idempotency prevents duplicates."]
- Expired identity material blocks privileged writes but not public health checks. [The Safety invariants note states "Expired identity material blocks privileged writes, not public health checks."]
- Original-region health alone does not imply writer failback. [The Safety invariants note states "Original-region health **never** implies writer failback; operator...".]

## UNCERTAIN
- Several labels end in ellipses, including "Multi-region KV / cart owner + conditional...", "Regional SQL / order + outbox atomic...", and each region's "circuit breakers...".: The omitted text is not readable and cannot be reconstructed from the image.
- The connector labels around Regional SQL, CDC, and Replication bridge are partly hidden by boxes and crossing lines.: The exact wording and arrow direction for every inter-box replication connector are not fully legible, although the components are visibly arranged in that order.
- The Region A ingress-to-web/API connector has a complex bent shape.: The visible labels establish "web → API", but the exact direction of every unlabeled segment between Ingress and Web app is not completely clear.
- The orange line from Region A's Order coordinator descends through the regional boundary and global-data area.: The label "order + outbox" is readable, but portions of the route are occluded and its precise attachment to neighboring global-data boxes is not fully visible.
- The control-plane connector into "Remove region from new traffic" has only a partial label, visible as approximately "region unheal...".: The full trigger wording cannot be read.
- A label on the line near Immutable global audit and Paging · incident · status is partially occluded.: Only fragments resembling operational terms such as incident/status are visible; the complete connector label is unknown.
- The final Safety invariants bullet ends with "operator..." after saying original-region health never implies writer failback.: The remainder of the operator-related requirement is truncated and cannot be stated.
- No explicit negative outcomes are drawn for "Region eligible?", "Lag within RPO?", or "Controlled writer return?".: The behavior for negative decisions is not communicated by visible branches.
- Regions B and C show the same component inventory as Region A but do not show the same internal request arrows.: The image supports identical visible component presence, but not an explicit claim that every Region A internal arrow is duplicated in Regions B and C.
- The Regional DLQ is shown without a clearly visible incoming failure connector.: Its label indicates dead-letter handling and metadata transfer to an operations account, but the precise producer and trigger are not shown.
