# SF blind system reconstruction

## SYSTEM PURPOSE
A multi-region, multi-availability-zone commerce architecture designed for health-based regional routing and failover, with regional application and order-processing stacks, global data and payment services, replication safeguards, and a monitored failover control plane.

## COMPONENTS
- Multi-region commerce failover: Names the overall system boundary and its failover purpose. [The outer diagram is labeled "Multi-region commerce failover".]
- Global traffic edge: Contains the global DNS, anycast edge, and health-based selection of a destination region. [The top blue container is labeled "Global traffic edge" and encloses "Global DNS", "Anycast edge", and "Nearest healthy region".]
- Global DNS: Begins the depicted global traffic-resolution path. [A globe icon labeled "Global DNS" has a right-pointing line labeled "resolve" toward the anycast edge.]
- Anycast edge: Receives the resolved traffic path and forwards it through health-based regional routing. [A cloud icon labeled "Anycast edge" sits between the "resolve" arrow and a right-pointing arrow labeled "route by health".]
- Nearest healthy region: Represents the health-selected regional destination and distributes traffic toward the regional ingress endpoints. [The blue box is labeled "Nearest healthy region"; it receives the "route by health" arrow and has a blue line descending and branching toward Regions A, B, and C.]
- Region A · multi-AZ: Hosts one multi-availability-zone regional commerce stack. [The left cyan regional container is explicitly labeled "Region A · multi-AZ".]
- Region B · multi-AZ: Hosts one multi-availability-zone regional commerce stack. [The center cyan regional container is explicitly labeled "Region B · multi-AZ".]
- Region C · multi-AZ: Hosts one multi-availability-zone regional commerce stack. [The right cyan regional container is explicitly labeled "Region C · multi-AZ".]
- Ingress · API gateway (Regions A, B, and C): Provides the depicted regional entry point for traffic routed from the global edge. [Each regional container has a blue box labeled "Ingress · API gateway", and each receives a downward blue arrow from the global routing branch.]
- Web app + identity cache (Regions A, B, and C): Provides a regional web application and identity-cache capability. [Each regional container includes a gray box labeled "Web app + identity cache".]
- Catalog · cart · checkout (Regions A, B, and C): Provides regional catalog, cart, and checkout functionality. [Each regional container includes a gray box labeled "Catalog · cart · checkout".]
- Order service · workers (Regions A, B, and C): Provides regional order-service worker processing. [Each regional container includes an orange box labeled "Order service · workers".]
- Event bus + DLQ (Regions A, B, and C): Provides a regional event bus and dead-letter queue. [Each regional container includes a purple messaging icon labeled "Event bus + DLQ".]
- Redis cluster (Regions A, B, and C): Provides a regional Redis cluster. [Each regional container includes a teal box labeled "Redis cluster".]
- Regional order DB (Regions A, B, and C): Stores regional order data. [Each regional container includes an orange box labeled "Regional order DB".]
- Regional collector (Regions A, B, and C): Provides regional collection or monitoring capability. [Each regional container includes a monitor-style icon labeled "Regional collector".]
- Discovery · circuit breakers (Regions A, B, and C): Provides regional discovery and circuit-breaker capability. [Each regional container includes a green shield icon labeled "Discovery · circuit breakers".]
- Global data & payments: Groups global storage, cross-region cart state, replication controls, payment integration, and audit storage. [The lower-left purple container is labeled "Global data & payments".]
- Global document store: Provides a global document-storage capability. [A purple-outlined box inside "Global data & payments" is labeled "Global document store".]
- Multi-region cart KV · conditional writes: Provides a multi-region cart key-value store using conditional writes. [A purple-outlined box is labeled "Multi-region cart KV · conditional writes".]
- Replication bridge · dedupe · quarantine: Bridges replication while applying deduplication and quarantine. [A purple-outlined box is labeled "Replication bridge · dedupe · quarantine" and receives a purple arrow from the regional layer.]
- Payment adapter · idempotency key: Adapts payment requests and applies an idempotency key before payment-provider handling. [An orange-outlined box labeled "Payment adapter · idempotency key" points by an orange arrow to "Payment providers A / B".]
- Payment providers A / B: Represents two payment-provider options used after the payment adapter. [A wallet icon is labeled "Payment providers A / B" and receives the arrow from the payment adapter.]
- Immutable audit store: Stores immutable audit information and receives the depicted decisions-and-overrides control path. [A purple-outlined box is labeled "Immutable audit store"; a dashed purple line labeled "decisions + overrides" terminates above it with a downward arrow.]
- Failover control plane: Groups monitoring, failure classification, quorum-controlled action, promotion criteria, paging/status, capacity protection, and recovery validation. [The lower-right orange container is labeled "Failover control plane".]
- Probes · collectors · DB / bus monitors: Monitors probes, collectors, databases, and buses and feeds the failover decision sequence. [A monitor icon is labeled "Probes · collectors · DB / bus monitors" and points right toward the incident-classification box.]
- Instance · AZ · service · DB · ...: Represents classification or assessment at instance, availability-zone, service, and database scopes, with additional truncated scope text. [The orange box reads "Instance · AZ · service · DB · ..." and lies between incoming monitoring and outgoing quorum flow.]
- Quorum writer lease · one holder: Constrains the writer lease to a quorum-controlled single holder. [A key icon is labeled "Quorum writer lease · one holder" and is reached by an orange arrow from the classification box.]
- Lag ≤ RPO → promote replica: Defines the shown replica-promotion condition: promotion occurs when lag is at or below the recovery point objective. [A red-outlined box reads "Lag ≤ RPO → promote replica" and is reached by a red arrow from the quorum writer-lease stage.]
- Paging · incident · status milestones: Provides paging, incident handling, and status milestones. [A gray box in the failover control plane is labeled "Paging · incident · status milestones".]
- Capacity guard + load shedding: Protects capacity and supports load shedding. [A green shield icon is labeled "Capacity guard + load shedding".]
- Read replica → catch up → checksums → shadow traffic: Defines a staged replica recovery or validation sequence: catch-up, checksums, then shadow traffic. [A green-outlined box explicitly reads "Read replica → catch up → checksums → shadow traffic".]
- Separate controlle...: Represents a separate control-related destination after the read-replica validation sequence; the full label is not visible. [An orange-outlined box at the end of a green arrow displays the truncated text "Separate controlle...".]

## FLOWS
- control · Global health-based traffic routing: Global DNS initiates the path. → The request is sent right on the line labeled "resolve". → Anycast edge receives the resolved path. → Anycast edge sends traffic right on the line labeled "route by health". → The path reaches "Nearest healthy region". → A blue distribution line descends and branches to the ingress/API gateway of Region A, Region B, or Region C. [Across the "Global traffic edge" container, arrows run from "Global DNS" through "resolve" to "Anycast edge", then through "route by health" to "Nearest healthy region"; a blue line branches downward to all three regional ingress boxes.]
- data · Regional order database to replication bridge: A purple solid line leaves the bottom of Region B at the position of its Regional order DB. → The line travels downward, bends left, and then descends. → A purple arrow terminates at "Replication bridge · dedupe · quarantine" in the global data and payments area. [The only solid purple cross-container line originates beneath Region B's "Regional order DB" and ends with a downward arrow on "Replication bridge · dedupe · quarantine".]
- data · Payment-provider request path: The path starts at "Payment adapter · idempotency key". → An orange right-pointing arrow sends the request to "Payment providers A / B". [Inside "Global data & payments", the payment adapter box is connected by an orange arrow to the wallet icon labeled "Payment providers A / B".]
- failure · Failover detection and promotion decision: "Probes · collectors · DB / bus monitors" provides monitoring input. → An orange arrow sends that input to "Instance · AZ · service · DB · ...". → An orange arrow continues to "Quorum writer lease · one holder". → A red arrow continues to the condition "Lag ≤ RPO → promote replica". → When the displayed lag condition is satisfied, the stated action is to promote the replica. [The top row of the failover control plane is a left-to-right arrow sequence from monitors, through the instance/AZ/service/DB box and quorum writer lease, to the red promotion-condition box.]
- control · Decisions and overrides audit path: A dashed purple line descends from the "Instance · AZ · service · DB · ..." box. → The line turns left and is labeled "decisions + overrides". → It enters the global data and payments area. → A downward arrow terminates at "Immutable audit store". [A dashed purple connector visibly links the failover classification box to the immutable audit store and carries the label "decisions + overrides".]
- control · Replica recovery and validation sequence: Begin with a read replica. → Allow the replica to catch up. → Perform checksums. → Send shadow traffic. → Continue by a green arrow to the truncated destination "Separate controlle...". [The green box explicitly orders "Read replica → catch up → checksums → shadow traffic" and points right to "Separate controlle...".]

## FAILURE PATHS
- The monitoring path identifies an issue at an instance, availability-zone, service, database, or another scope represented by the trailing ellipsis.: Probes · collectors · DB / bus monitors → Instance · AZ · service · DB · ... → Quorum writer lease · one holder → Evaluate "Lag ≤ RPO" → Promote replica when lag is at or below RPO. [The failover control-plane arrows end at the explicit box "Lag ≤ RPO → promote replica".]
- A region is not selected as healthy by the global routing layer.: Global DNS → resolve → Anycast edge → route by health → Nearest healthy region → Selected regional ingress/API gateway → Traffic is directed to a nearest healthy region rather than to a region not selected by the health-routing decision. [The top path is explicitly labeled "route by health" and terminates at "Nearest healthy region", which branches to regional ingress endpoints.]

## CONSTRAINTS & BOUNDARIES
- The regional deployments are multi-AZ. [All three regional boundaries are labeled "Region A · multi-AZ", "Region B · multi-AZ", and "Region C · multi-AZ".]
- Global traffic routing is health-based and targets the nearest healthy region. [The global edge path is labeled "route by health" and terminates at "Nearest healthy region".]
- The writer lease has one holder and is quorum-controlled. [The control-plane key is labeled "Quorum writer lease · one holder".]
- Replica promotion is allowed under the displayed condition only when lag is less than or equal to RPO. [The red box states "Lag ≤ RPO → promote replica".]
- Cart key-value writes are conditional. [The global data component is labeled "Multi-region cart KV · conditional writes".]
- Payment adaptation uses an idempotency key. [The payment component is labeled "Payment adapter · idempotency key".]
- Replication includes deduplication and quarantine. [The replication component is labeled "Replication bridge · dedupe · quarantine".]
- An event dead-letter queue exists in every depicted region. [Regions A, B, and C each contain "Event bus + DLQ".]
- Regional discovery is paired with circuit breakers. [Each region contains "Discovery · circuit breakers".]
- Replica validation is ordered as catch-up, then checksums, then shadow traffic. [The green control-plane box reads "Read replica → catch up → checksums → shadow traffic".]
- The control plane includes capacity guarding and load shedding. [A shield in the failover control plane is labeled "Capacity guard + load shedding".]
- The audit store is immutable. [The destination of the decisions-and-overrides path is labeled "Immutable audit store".]

## UNCERTAIN
- The solid purple regional-to-global replication line appears to originate from Region B's Regional order DB.: The line is attached to the lower boundary beneath that box, but no textual connector label explicitly names the source or the replicated payload.
- The global blue routing line branches to all three regional ingress boxes.: The drawing shows possible branches but does not state whether traffic is sent to exactly one region at a time, multiple healthy regions, or according to another distribution policy.
- No internal arrows connect ingress, web app, catalog/cart/checkout, order workers, event bus, Redis, regional DB, collector, or discovery components inside a region.: Their detailed request, data, event, cache, and monitoring interactions are not specified by the picture.
- The classification box reads "Instance · AZ · service · DB · ...".: The scopes represented after "DB" are omitted by the visible ellipsis.
- The final orange box reads "Separate controlle...".: The label is visibly truncated, so its complete name and exact responsibility cannot be recovered.
- The diagram shows the condition "Lag ≤ RPO → promote replica".: It does not show the explicit outcome when lag is greater than RPO.
- Paging, incident/status milestones, and capacity guard/load shedding are present in the failover control plane.: No arrows connect these components to the main failover sequence, so their exact trigger order and downstream effects are not shown.
- The global document store and multi-region cart KV are present in the global data and payments boundary.: No visible arrows identify their producers, consumers, or synchronization paths.
- The diagram includes payment providers A / B.: It does not show provider-selection rules, fallback ordering, responses, or provider failure outcomes.
