# Distributed trace ingestion

We need a diagram of our distributed tracing and observability ingestion pipeline. Instrumented services send spans to a collector agent on every host. Each agent batches and compresses spans before forwarding them to the regional ingest tier. If that tier becomes unreachable, the agent buffers batches on local disk and drains the backlog after recovery. The buffer is bounded and discards its oldest data first when full.

The ingest tier authenticates the sending service, enforces its tenant rate limit, and validates the span schema. It rejects malformed batches with a reason the sender can act on. Accepted spans enter a durable partitioned log keyed by trace identity, keeping every span for a trace in the same partition. Traces arrive incomplete and out of order, so an assembler holds spans by trace identity for a completion window, restores parent-child relationships, and emits when the root appears or the window expires. A trace without a root is emitted as incomplete. Late spans attach to the stored trace after emission instead of creating a duplicate.

A tail-based sampler makes the retention decision only after assembly. It keeps every trace containing an error, every trace slower than its service's latency objective, and a small share of ordinary traffic. Per-tenant retention floors stop a noisy service from crowding out quiet tenants. Retained traces enter hot storage for recent interactive queries and eventually age into cheaper cold storage. In parallel, a metrics extractor processes every trace, whether retained or discarded, to calculate request-rate, error-rate, and latency series without sampling bias.

Cardinality control watches attribute values before indexing and quarantines keys whose value sets explode, preserving the rest of the searchable data. The query service provides trace search, service dependency views, and the derived series. Alerting evaluates rules against those series and links each alert to exemplar traces.

The pipeline measures its own ingest lag, assembler buffer occupancy, sampling rates, and drop counts. When saturation persists, load shedding follows a defined priority: ordinary trace retention yields before error traces or metrics extraction, protecting the derived series and diagnostic evidence needed during an incident.

The diagram should make clear how spans survive regional ingest outages, become complete or incomplete traces, feed unbiased metrics, and preserve diagnostic evidence under saturation.
