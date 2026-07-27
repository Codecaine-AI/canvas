# SF blind system reconstruction

## SYSTEM PURPOSE
A backpressured analytics data pipeline that securely ingests application events and partner batches, validates and durably admits records, performs ordered transformations with repair/replay handling, delivers data to object storage and a warehouse, serves tenant queries, and controls overload while preserving replay and deduplication guarantees.

## COMPONENTS
- Backpressured analytics data pipeline: Names the overall depicted system. [The title at the top of the enclosing diagram reads “Backpressured analytics data pipeline”.]
- 1 · Event sources: Groups the upstream producers and upload source that submit events or batches. [A blue section labeled “1 · Event sources” contains “Application producers” and “Partner batch uploads”.]
- Application producers: Produce application events for ingestion. [A producer icon labeled “Application producers” connects to the ingest gateway through a blue path labeled “events”.]
- Partner batch uploads: Supply batches for ingestion. [A box labeled “Partner batch uploads” connects to the ingest gateway through a blue arrow labeled “batches”.]
- 2 · Secure ingest: Groups event intake, producer authentication, and attachment of tenant and receipt metadata. [A blue section labeled “2 · Secure ingest” contains the ingest gateway, authenticated producer, and metadata attachment boxes.]
- Ingest gateway: Receives event and batch traffic and participates in producer authentication. [Both source paths terminate at the box “Ingest gateway”; a connection from it toward “Authenticated producer” is labeled with partially visible text beginning “authenticat…”.]
- Authenticated producer: Represents the successful producer-authentication state. [A gray box labeled “Authenticated producer” has an outgoing gray path labeled “accepted”.]
- Attach tenant + receipt metadata: Adds tenant and receipt metadata to accepted input. [The “accepted” path from “Authenticated producer” points to “Attach tenant + receipt metadata”.]
- 3 · Validate & classify: Validates records against schema information and classifies invalid input. [An orange section labeled “3 · Validate & classify” contains a schema registry, validity decision, and rejection box.]
- Schema registry: Provides schema information for validation. [An orange arrow connects “Schema registry” to “Schema + record valid?”.]
- Schema + record valid?: Decides whether the schema and record are valid. [The orange decision box is explicitly labeled “Schema + record valid?” and has normal and malformed outgoing paths.]
- Reject with reason: Rejects malformed records and supplies a reason. [A red-orange path labeled “malformed” points from the validity decision to “Reject with reason”.]
- 4 · Durable admission: Durably admits valid data, separates unknown-schema material, and imposes a retention safety limit. [A teal section labeled “4 · Durable admission” contains “Partitioned durable log”, “Unknown-schema quarantine”, and “Retention safety limit”.]
- Partitioned durable log: Stores admitted records durably in partitions. [The valid path from “Schema + record valid?” points into the box “Partitioned durable log”.]
- Unknown-schema quarantine: Quarantines material with an unknown schema. [An orange routed arrow points into the box labeled “Unknown-schema quarantine”.]
- Retention safety limit: Represents a safety boundary on retained data. [A red box in durable admission is explicitly labeled “Retention safety limit”.]
- 5 · Ordered transform: Consumes admitted data, transforms it, removes sensitive fields, and enriches it using versioned reference data. [A purple section labeled “5 · Ordered transform” contains transform workers, normalization/sensitive-field removal, and versioned reference data.]
- Stateless transform workers: Run stateless transformation work. [A purple box is labeled “Stateless transform workers” and connects toward normalization through a path labeled “consume”.]
- Normalize + remove sensitive fields: Normalizes records and removes sensitive fields. [A gray box is explicitly labeled “Normalize + remove sensitive fields”.]
- Versioned reference data: Supplies versioned data used to enrich transformed records. [A purple box labeled “Versioned reference data” connects upward to normalization through a path labeled “enrich”.]
- 6 · Repair lanes: Captures failed transformations with context, repairs and replays them, and preserves identity. [An orange section labeled “6 · Repair lanes” contains dead-letter, repair/replay, and identity-preservation boxes.]
- Dead-letter stream + context: Stores failed items together with context. [A path labeled “failure” points into “Dead-letter stream + context”.]
- Repair + replay: Repairs dead-lettered records and replays them. [A path labeled “repair” connects “Dead-letter stream + context” to “Repair + replay”.]
- Preserve tenant + event identity: Preserves tenant and event identity during repair and replay. [A gray path labeled “preserve IDs” points from “Repair + replay” to “Preserve tenant + event identity”.]
- 7 · Dual delivery: Delivers transformed data to low-cost object storage and to a warehouse loading queue, while retaining a replay source. [A teal section labeled “7 · Dual delivery” contains object storage, a warehouse loading queue, and a replay instruction.]
- Low-cost object storage: Stores a low-cost copy of delivered data and acts as a replay source. [The box “Low-cost object storage” has a downward path labeled “replay source”.]
- Warehouse loading queue: Queues idempotent batches for warehouse loading. [A teal box labeled “Warehouse loading queue” connects to warehouse loaders through a path labeled “idempotent batches”.]
- Replay when transform logic changes: Requires replay when transformation logic changes. [The “replay source” path from object storage points to a gray box labeled “Replay when transform logic changes”.]
- 8 · Warehouse commit: Loads idempotent batches, records a checkpoint, and publishes completed partitions. [A blue section labeled “8 · Warehouse commit” contains idempotent loaders, a load checkpoint, and completed-partition publication.]
- Idempotent batch loaders: Load queued batches idempotently into the warehouse-side commit process. [The box “Idempotent batch loaders” receives a path labeled “idempotent batches”.]
- Load checkpoint: Records the loading commit/checkpoint state. [A gray box labeled “Load checkpoint” follows the batch loaders on a connector whose readable portion says “commit + upd…”.]
- Publish completed partitions: Publishes partitions after loading completes. [A green path labeled “complete” points from “Load checkpoint” to “Publish completed partitions”.]
- 9 · Query serving: Serves tenant queries and uses a result cache for common queries. [A green section labeled “9 · Query serving” contains “Tenant query service” and “Result cache”, joined by a connector labeled “common quer…”.]
- Tenant query service: Provides tenant-facing query service. [A green box is labeled “Tenant query service”.]
- Result cache: Caches query results, including common-query results. [A green box labeled “Result cache” is connected to the tenant query service by a line whose label begins “common quer…”.]
- 10 · Backpressure control: Responds to loading-queue expansion by reducing transform consumption and returning an explicit ingest throttle. [A red section labeled “10 · Backpressure control” contains three explicitly numbered boxes.]
- 1 · Loading queue expands: Defines the initial overload condition. [The first backpressure box reads “1 · Loading queue expands”.]
- 2 · Reduce transform consumption: Reduces transformation consumption after queue expansion. [A connector labeled “then” leads from step 1 to “2 · Reduce transform consumption”.]
- 3 · Ingest returns explicit throttle: Returns an explicit throttle at ingest as the final backpressure action. [A connector labeled “finally” leads to “3 · Ingest returns explicit throttle”.]
- 11 · Operations: Turns lag, rejection, quarantine, retry, and throughput information into operational alerts. [A yellow section labeled “11 · Operations” contains two signal boxes feeding an “Operational alerts” icon.]
- Lag · rejection · quarantine: Provides operational signals about lag, rejected records, and quarantined records. [A yellow box is labeled “Lag · rejection · quarantine” and connects to alerts through a path labeled “signals”.]
- Retry · throughput: Provides operational signals about retries and throughput. [A yellow box is labeled “Retry · throughput” and connects to alerts through a path labeled “signals”.]
- Operational alerts: Receives operational signals and represents alert generation. [Both “signals” paths converge on a lightning icon labeled “Operational alerts”.]
- 12 · Replay guarantees: States the identity and delivery guarantees associated with replay. [A gray section labeled “12 · Replay guarantees” contains an identity key, downstream deduplication, and a delivery-guarantees note.]
- Original tenant + event identity: Provides the stable identity retained across replay. [A key icon is captioned “Original tenant + event identity”; the nearby connector is labeled “stable key”.]
- Downstream deduplication: Deduplicates downstream data using a stable key. [A green box labeled “Downstream deduplication” appears beside the “stable key” label.]
- Delivery guarantees: Declares the pipeline’s explicit delivery, ordering, and replay guarantees. [A yellow note reads “### Delivery guarantees”, followed by “- No loss under slowdown”, “- Partition order preserved”, and “- Repairable, identity-safe replay”.]

## FLOWS
- data · Application-event ingestion: Application producers emit application events. → The blue path labeled “events” carries them to the Ingest gateway. [A blue routed connector runs from “Application producers” to “Ingest gateway” and is labeled “events”.]
- data · Partner-batch ingestion: Partner batch uploads supply batches. → The blue arrow labeled “batches” carries them to the Ingest gateway. [A straight blue arrow from “Partner batch uploads” enters “Ingest gateway” and is labeled “batches”.]
- control · Secure acceptance and metadata attachment: The Ingest gateway passes input toward producer authentication. → The producer reaches the “Authenticated producer” state. → An “accepted” path leads to “Attach tenant + receipt metadata”. → The metadata-enriched record is routed toward validation. [The ingest gateway is connected to “Authenticated producer”; its outgoing path is labeled “accepted” and points to the metadata box, whose output continues into the validation section.]
- data · Schema validation and durable admission: Schema registry information is supplied to “Schema + record valid?”. → Metadata-enriched records reach the same validation decision. → The normal outgoing path enters the Partitioned durable log. [An orange arrow connects the schema registry to the decision; a gray routed line from metadata reaches the decision; an outgoing arrow points into “Partitioned durable log”.]
- failure · Unknown-schema quarantine routing: A routed orange branch associated with admission bypasses or leaves the normal validity path. → The branch terminates at “Unknown-schema quarantine”. [An orange line loops above the durable-log area and ends with an arrow into “Unknown-schema quarantine”.]
- data · Ordered transformation and enrichment: Stateless transform workers consume records. → Records go to “Normalize + remove sensitive fields”. → Versioned reference data enriches the normalization step. [The worker-to-normalization connector is labeled “consume”; the reference-data-to-normalization connector is labeled “enrich”.]
- failure · Transform failure repair and replay: A transformation failure is emitted from the normalization path. → The “failure” path enters “Dead-letter stream + context”. → The “repair” path enters “Repair + replay”. → The replay process follows “preserve IDs” to “Preserve tenant + event identity”. [The ordered-transform output has an orange branch labeled “failure”; subsequent connectors are labeled “repair” and “preserve IDs”.]
- data · Dual delivery: A teal delivery route supplies Low-cost object storage. → A parallel or continuing teal route supplies the Warehouse loading queue. → The queue emits “idempotent batches” to Idempotent batch loaders. [Teal arrowheads enter both delivery boxes, and the connector from the queue to the loaders is labeled “idempotent batches”.]
- control · Object-storage replay: Low-cost object storage serves as a “replay source”. → Replay is performed when transform logic changes. [A gray downward connector labeled “replay source” points to “Replay when transform logic changes”.]
- data · Warehouse commit and publication: Warehouse loading queue supplies idempotent batches. → Idempotent batch loaders process the batches. → The loaders connect to Load checkpoint through a connector whose visible label begins “commit + upd…”. → On “complete”, Publish completed partitions is invoked. [The warehouse section shows the boxes in this order, with labels “idempotent batches”, partial “commit + upd…”, and “complete”.]
- control · Backpressure response: 1 · Loading queue expands. → Then, 2 · Reduce transform consumption. → Finally, 3 · Ingest returns explicit throttle. [The backpressure section explicitly numbers these three steps; inter-step labels read “then” and “finally”.]
- control · Operational signaling: Lag, rejection, and quarantine produce signals. → Retry and throughput produce signals. → Both signal paths converge on Operational alerts. [Two orange connectors labeled “signals” run from the two operations boxes to the alert icon.]
- data · Stable-key downstream deduplication: Original tenant + event identity supplies a stable key. → The stable key is associated with Downstream deduplication. [The replay-guarantees section places “Original tenant + event identity”, the label “stable key”, and “Downstream deduplication” in left-to-right order.]

## FAILURE PATHS
- The schema or record is malformed.: Schema + record valid? → malformed → Reject with reason → The record is rejected with a reason. [A red-orange arrow labeled “malformed” points from the validity decision to “Reject with reason”.]
- An unknown schema is encountered during admission.: Validation/admission branch → Unknown-schema quarantine → The item is quarantined rather than admitted to the normal durable-log path. [A separate orange routed arrow terminates at “Unknown-schema quarantine”; the box itself names the triggering class.]
- A transformation fails.: Normalize + remove sensitive fields → failure → Dead-letter stream + context → repair → Repair + replay → preserve IDs → Preserve tenant + event identity → The failed item is retained with context, repaired and replayed while preserving tenant and event identity. [The connected repair-lane path is explicitly labeled “failure”, “repair”, and “preserve IDs”.]
- The warehouse loading queue expands.: 1 · Loading queue expands → then → 2 · Reduce transform consumption → finally → 3 · Ingest returns explicit throttle → Transform consumption is reduced and ingest explicitly throttles producers. [The backpressure-control section displays this exact numbered sequence and connector ordering.]
- Transform logic changes.: Low-cost object storage → replay source → Replay when transform logic changes → Stored data is replayed from object storage. [A path labeled “replay source” links object storage to the instruction “Replay when transform logic changes”.]
- Lag, rejection, quarantine, retry, or throughput conditions generate signals.: Lag · rejection · quarantine and/or Retry · throughput → signals → Operational alerts → Operational alerts are raised. [Both operations boxes feed the alert icon through connectors labeled “signals”.]

## CONSTRAINTS & BOUNDARIES
- Ingest is secure and producers must reach an authenticated/accepted state before tenant and receipt metadata are attached. [The secure-ingest section orders “Ingest gateway”, “Authenticated producer”, the “accepted” connector, and “Attach tenant + receipt metadata”.]
- Valid records are admitted to a partitioned durable log. [The normal output of “Schema + record valid?” points to “Partitioned durable log”.]
- Malformed records are rejected with a reason. [The “malformed” branch terminates at “Reject with reason”.]
- Unknown-schema records are quarantined. [The durable-admission section contains the explicitly labeled “Unknown-schema quarantine” destination.]
- Durable admission is subject to a retention safety limit. [The durable-admission section contains a red box labeled “Retention safety limit”.]
- Transformation is ordered, uses stateless workers, normalizes records, and removes sensitive fields. [The section is titled “Ordered transform” and contains “Stateless transform workers” and “Normalize + remove sensitive fields”.]
- Reference data used for enrichment is versioned. [The enrichment source is labeled “Versioned reference data”.]
- Repair and replay preserve tenant and event identity. [The repair path is labeled “preserve IDs” and terminates at “Preserve tenant + event identity”.]
- Warehouse batches and loaders are idempotent. [The queue-to-loader path is labeled “idempotent batches”, and the loader box is “Idempotent batch loaders”.]
- Completed partitions are published only after the load checkpoint reaches “complete”. [The green “complete” path runs from “Load checkpoint” to “Publish completed partitions”.]
- When the loading queue expands, transform consumption is reduced before ingest returns an explicit throttle. [The backpressure-control section explicitly numbers and orders these actions as 1, 2, and 3.]
- The declared delivery guarantee is no loss under slowdown. [The delivery-guarantees note explicitly says “- No loss under slowdown”.]
- Partition order is preserved. [The delivery-guarantees note explicitly says “- Partition order preserved”.]
- Replay is repairable and identity-safe. [The delivery-guarantees note explicitly says “- Repairable, identity-safe replay”.]
- Downstream deduplication uses a stable key based on the original tenant and event identity. [The replay-guarantees section shows “Original tenant + event identity”, “stable key”, and “Downstream deduplication”.]

## UNCERTAIN
- The connector text between Ingest gateway and Authenticated producer is partially obscured and only “authenticat…” is readable.: The exact connector label and whether it denotes an action, request, or state transition cannot be recovered from the image.
- The orange route into Unknown-schema quarantine visually branches around the valid-admission area.: The exact branch origin and whether it leaves the validation decision directly or the durable-log admission path are not unambiguously visible.
- A long teal route links the durable-admission/transform/delivery regions and has arrowheads entering delivery components.: The precise split points and whether the partitioned durable log feeds transform workers, both delivery targets directly, or a combination are not fully clear from overlapping routed lines.
- The connector from Idempotent batch loaders to Load checkpoint has a clipped label visible as “commit + upd…”.: The complete wording cannot be read.
- Tenant query service and Result cache are connected by a label visible only as “common quer…”.: The complete label and arrow direction are not visibly recoverable.
- The replay-guarantees section places “stable key” between the identity icon and downstream deduplication.: A definite arrowhead or complete connecting line is not clearly visible, so the exact control/data direction is inferred only from layout and labels.
- Retention safety limit is present inside durable admission without a visible connector.: Its exact enforcement point, trigger, and failure outcome are not shown.
