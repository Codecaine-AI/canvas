# SF blind system reconstruction

## SYSTEM PURPOSE
A retrieval-augmented generation system covering source ingestion, normalization and versioning, chunking and embedding, version-consistent publication, permission-aware retrieval and grounded answering, failure repair, index-generation rebuilds, and a feedback loop that reprioritizes ingestion.

## COMPONENTS
- RAG ingestion, retrieval & lifecycle: Names the overall system boundary. [The outer frame is labeled “RAG ingestion, retrieval & lifecycle”.]
- 1 · Sources & arrivals: Groups source adapters, arrival controls, schedules, and change notifications. [The upper-left blue section is labeled “1 · Sources & arrivals”.]
- Source adapters: Connect to incoming source systems. [A cloud icon is labeled “Source adapters” and points toward “Arrival + ACLs”.]
- Schedules + change notifications: Drive source arrival activity for supported content types. [A blue box reads “Schedules + change notifications” and “Docs · wikis · tickets · code”, with an orange dashed arrow pointing upward toward the source-adapter area.]
- Arrival + ACLs: Handles arriving content together with access-control information. [A gray process box labeled “Arrival + ACLs” follows Source adapters; its outgoing flow is labeled “content + ACLs”.]
- 2 · Normalize & classify: Groups extraction, normalization, hashing, and version action. [The upper-middle teal section is labeled “2 · Normalize & classify”.]
- Extract & normalize: Extracts and normalizes arriving content. [A teal box labeled “Extract & normalize” receives the “content + ACLs” flow.]
- Content hash: Computes or represents a hash of normalized content. [An amber box labeled “Content hash” is placed after “Extract & normalize”.]
- Version action: Applies a version-related action and emits versioned content. [A teal box labeled “Version action” follows “Content hash”; its outgoing connector is labeled “versioned content”.]
- 3 · Chunk & embed: Groups chunking, metadata attachment, embedding, and completion of a version. [The upper-right purple section is labeled “3 · Chunk & embed”.]
- Chunk + metadata: Chunks versioned content and associates metadata. [A purple box labeled “Chunk + metadata” receives the “versioned content” flow.]
- Rate-limited embed: Produces embeddings under a rate limit. [A purple box labeled “Rate-limited embed” follows “Chunk + metadata”.]
- Completed version: Represents a version that has completed the chunk-and-embed pipeline. [A green rounded terminal labeled “Completed version” follows “Rate-limited embed”.]
- 4 · Version-consistent publication: Groups publication artifacts and a same-version consistency check. [The middle-left green section is labeled “4 · Version-consistent publication”.]
- Vector index: Stores or represents the vector index used by publication/retrieval. [A blue box in the publication section is labeled “Vector index”.]
- Fragments + metadata: Stores or represents content fragments and their metadata. [A teal box in the publication section is labeled “Fragments + metadata”.]
- Keyword index: Stores or represents the keyword index. [A purple box in the publication section is labeled “Keyword index”.]
- Same version?: Checks version consistency before publication is considered usable. [A green-outlined box labeled “Same version?” receives a green line originating from “Completed version”.]
- Failure handling & repair: Groups parse quarantine, transient-error retries, dead-letter handling, and publication repair policy. [The orange-tinted middle-right section is labeled “Failure handling & repair”.]
- Parse quarantine: Quarantines failures originating from extraction or parsing. [A red box labeled “Parse quarantine” receives a red downward failure line originating at “Extract & normalize”.]
- Retry transient errors: Retries transient failures from embedding. [An orange box labeled “Retry transient errors” receives an orange downward line from “Rate-limited embed”.]
- Dead-letter store: Stores work that proceeds out of transient-error retry handling. [A red box labeled “Dead-letter store” receives a rightward red arrow from “Retry transient errors”.]
- Failure-handling policy note: States the policy for inconsistent publication and dead-letter preservation. [A note reads: “Partial publication is never served. Repair or roll back inconsistent writes; DLQ preserves inputs + attempt history.”]
- 5 · Permission-aware query & grounded answer: Groups query rewriting, hybrid retrieval, fusion/reranking, ACL enforcement, evidence checking, and answer or abstention outcomes. [The lower-left blue section is labeled “5 · Permission-aware query & grounded answer”.]
- User question: Represents the incoming user query. [The query flow starts at a document-shaped element labeled “User question”.]
- Rewrite searches: Rewrites the user question into searches. [A blue box labeled “Rewrite searches” follows “User question”.]
- Vector + keyword: Performs or represents combined vector and keyword retrieval. [A purple box labeled “Vector + keyword” follows “Rewrite searches”.]
- Fuse · rerank · ACL: Fuses and reranks retrieval results while applying ACL controls. [A teal box labeled “Fuse · rerank · ACL” follows “Vector + keyword”.]
- Enough evidence?: Determines whether retrieved evidence is sufficient to answer. [An amber decision box labeled “Enough evidence?” follows “Fuse · rerank · ACL”.]
- Grounded answer + citations: Returns a grounded answer accompanied by citations. [A green box labeled “Grounded answer + citations” is connected to the evidence decision by a green branch.]
- I don't know: Returns an abstention when evidence is insufficient. [A gray rounded terminal labeled “I don't know” receives a downward gray arrow from “Enough evidence?”.]
- Index generation rebuild: Groups rebuilding a new index generation and atomically promoting it. [The lower-right purple section is labeled “Index generation rebuild”.]
- Rebuild coordinator: Coordinates an index-generation rebuild. [A purple box labeled “Rebuild coordinator” starts the rebuild sequence.]
- New index generation: Builds or represents the replacement index generation. [A purple box labeled “New index generation” follows “Rebuild coordinator”.]
- Atomic promote: Atomically promotes the completed new index generation. [A green box labeled “Atomic promote” follows “New index generation”.]
- Index-generation operational note: States how live queries and rollback behave during rebuilds. [A note reads: “Live queries stay on current generation until complete + consistent. Prior generation remains available for rollback.”]
- 6 · Feedback loop: Turns user-answer signals and coverage gaps into ingestion priorities. [The bottom amber section is labeled “6 · Feedback loop”.]
- Thumbs · citations · unanswered: Collects feedback signals consisting of thumbs, citations, and unanswered questions. [An amber box is labeled “Thumbs · citations · unanswered”.]
- Coverage gaps → priorities: Converts coverage gaps into priorities. [A large orange arrow is labeled “Coverage gaps → priorities” and follows the feedback-signals box.]
- reprioritize ingestion: Labels the feedback control that changes ingestion priority. [A label reading “reprioritize ingestion” sits on the orange dashed loop returning from the feedback area toward Sources & arrivals.]

## FLOWS
- data · Primary ingestion and version-completion flow: Source adapters → Arrival + ACLs → content + ACLs → Extract & normalize → Content hash → Version action → versioned content → Chunk + metadata → Rate-limited embed → Completed version [Continuous left-to-right gray arrows connect these elements in this order; the inter-section connectors are explicitly labeled “content + ACLs” and “versioned content”.]
- control · Arrival scheduling and notification flow: Schedules + change notifications → Source adapters [An orange dashed connector rises from the schedules/change-notifications box and has an arrowhead at the Source adapters area.]
- control · Completed-version consistency flow: Completed version → Same version? [A green line descends from “Completed version”, runs left, and terminates with a downward arrowhead at “Same version?”.]
- data · Permission-aware retrieval and evidence evaluation: User question → Rewrite searches → Vector + keyword → Fuse · rerank · ACL → Enough evidence? [Gray arrows connect the query components from left to right in exactly this order.]
- data · Grounded-answer branch: Enough evidence? → Grounded answer + citations [A green branch leaves the decision area, runs downward and left, and points into “Grounded answer + citations”.]
- failure · Insufficient-evidence branch: Enough evidence? → I don't know [A gray downward arrow directly connects “Enough evidence?” to the rounded “I don't know” outcome.]
- control · Index generation rebuild and promotion: Rebuild coordinator → New index generation → Atomic promote [A purple arrow connects the coordinator to the new generation, followed by a green arrow into “Atomic promote”.]
- data · Feedback prioritization: Thumbs · citations · unanswered → Coverage gaps → priorities [A rightward gray arrow connects the feedback-signals box to the orange arrow labeled “Coverage gaps → priorities”.]
- control · Ingestion reprioritization loop: Coverage gaps → priorities → reprioritize ingestion → Schedules + change notifications / Source adapters [An orange dashed line runs from the coverage-priorities area leftward and upward along the diagram edge; it is labeled “reprioritize ingestion” and returns to the Sources & arrivals area.]
- failure · Parse-failure routing: Extract & normalize → Parse quarantine [A red line descends from “Extract & normalize”, runs to the failure section, and ends with a downward arrow at “Parse quarantine”.]
- failure · Embedding transient-error handling: Rate-limited embed → Retry transient errors → Dead-letter store [An orange line descends from “Rate-limited embed” into “Retry transient errors”; a red rightward arrow then leads to “Dead-letter store”.]

## FAILURE PATHS
- A parse or extraction problem at “Extract & normalize”.: Extract & normalize → Parse quarantine → The affected input is placed in parse quarantine. [The red failure connector originates beneath “Extract & normalize” and terminates at the red “Parse quarantine” box.]
- A transient error during “Rate-limited embed”.: Rate-limited embed → Retry transient errors → The transient error is sent to retry handling. [An orange connector originates beneath “Rate-limited embed” and points into “Retry transient errors”.]
- Work proceeds out of transient-error retry handling without successful completion.: Retry transient errors → Dead-letter store → The input and attempt history are preserved in the dead-letter store. [A red arrow connects “Retry transient errors” to “Dead-letter store”; the policy note states “DLQ preserves inputs + attempt history.”]
- Publication writes are inconsistent or only partially published.: Same version? → Repair or roll back inconsistent writes → Partial publication is never served. [The publication section contains “Same version?”, and the failure-policy note explicitly says: “Partial publication is never served. Repair or roll back inconsistent writes”.]
- The “Enough evidence?” check determines that evidence is insufficient.: Enough evidence? → I don't know → The system returns “I don't know” instead of a grounded answer. [A downward gray arrow runs from “Enough evidence?” to the gray rounded “I don't know” terminal.]
- A newly rebuilt index generation is not yet complete and consistent, or rollback is needed.: Live queries remain on current generation → Prior generation remains available for rollback → The incomplete new generation is not used for live queries, and rollback remains possible. [The rebuild note states: “Live queries stay on current generation until complete + consistent. Prior generation remains available for rollback.”]

## CONSTRAINTS & BOUNDARIES
- Content and access-control information travel together into normalization. [The connector from “Arrival + ACLs” into “Extract & normalize” is labeled “content + ACLs”.]
- Embedding is rate-limited. [The embedding component is explicitly labeled “Rate-limited embed”.]
- Publication is version-consistent and includes a “Same version?” check. [The section title is “4 · Version-consistent publication”, and it contains the check “Same version?”.]
- Partial publication is never served. [The failure-handling note explicitly states “Partial publication is never served.”]
- Inconsistent writes must be repaired or rolled back. [The failure-handling note states “Repair or roll back inconsistent writes”.]
- The dead-letter queue preserves inputs and attempt history. [The failure-handling note states “DLQ preserves inputs + attempt history.”]
- Query processing is permission-aware and applies ACLs during result fusion/reranking. [The query section is titled “Permission-aware query & grounded answer”, and a process is labeled “Fuse · rerank · ACL”.]
- Answers require enough evidence; otherwise the system abstains with “I don't know”. [The “Enough evidence?” decision branches to “Grounded answer + citations” and downward to “I don't know”.]
- A successful answer is grounded and includes citations. [The successful query outcome is labeled “Grounded answer + citations”.]
- A new index generation is promoted atomically. [The final rebuild component is labeled “Atomic promote”.]
- Live queries remain on the current index generation until the new generation is complete and consistent. [The rebuild note explicitly states “Live queries stay on current generation until complete + consistent.”]
- The prior index generation remains available for rollback. [The rebuild note explicitly states “Prior generation remains available for rollback.”]
- Supported source categories shown are docs, wikis, tickets, and code. [The source-arrival box lists “Docs · wikis · tickets · code”.]

## UNCERTAIN
- The publication section shows “Vector index”, “Fragments + metadata”, and “Keyword index” beside “Same version?”, but no explicit arrows connect the three stores to the check or to one another.: The image does not specify the write order, ownership, or exact per-store publication flow.
- The green line from “Completed version” goes to “Same version?”.: The diagram does not explicitly show the outcomes of the same-version decision or direct arrows from that check into the three publication stores.
- The green branch from “Enough evidence?” leads to “Grounded answer + citations”, while the gray branch leads to “I don't know”.: The branches are not explicitly labeled yes/no; their meaning is inferred only from the destination labels.
- The orange dashed feedback loop returns to the Sources & arrivals area and points near Source adapters.: Its exact target could be Source adapters, schedules/change notifications, or the broader ingestion stage; only the label “reprioritize ingestion” is explicit.
- The dead-letter path is shown after “Retry transient errors”.: The number of retries, retry policy, and exact condition for transfer to the dead-letter store are not shown.
- “Content hash” precedes “Version action”.: The image does not state which classifications or version actions are possible, nor how the hash determines them.
- No explicit connectors are drawn between the published indexes and the “Vector + keyword” query component.: The intended use of the vector and keyword indexes by query retrieval is suggested by matching labels but not explicitly connected.
