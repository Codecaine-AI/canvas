# Retrieval-augmented generation ingestion and query

We need a diagram of how our retrieval-augmented generation system carries knowledge from ingestion through grounded answers. Source adapters pull from document stores, wikis, ticket systems, and code repositories on schedules and change notifications. An arrival may be a first import or an update, and each source's access rules travel with it. Extraction normalizes formats and removes boilerplate. Unparseable documents enter quarantine with failure context while the rest of the batch continues.

A content hash classifies each document as new, changed, or unchanged. Unchanged content bypasses expensive processing. A changed document supersedes its previous version, whose stale derived records are deleted. The chunker splits normalized content with overlap and preserves headings, source identity, permissions, and a version stamp on every fragment. The embedding service accepts rate-limited batches. Workers retry transient failures, then send persistently failing batches to a dead-letter store with inputs and attempt history for reprocessing.

Each completed version writes vectors to a vector index, fragment text and metadata to a document store, and terms to a keyword index. Publication succeeds only when all three reflect the same version; partial writes remain unavailable and are repaired or rolled back before serving.

When a user asks a question, the retrieval service rewrites it into one or more searches, runs vector and keyword lookups in parallel, fuses and reranks candidates, and applies the asking user's permissions before context reaches the generation service. Generation answers only from retrieved evidence and returns citations. If context is thin or every reranker score is low, it says it does not know. Feedback records thumb signals, the usefulness of cited fragments, and unanswered questions; the resulting coverage gaps return to ingestion priorities.

When the embedding model changes, a rebuild coordinator re-embeds the corpus in the background into a new index generation. Live queries remain on the current generation until the rebuild is complete and consistent. Switchover atomically promotes the new generation, while the prior generation remains available for rollback.

The diagram should make clear how version-consistent content moves from ingestion through permission-aware retrieval to grounded answers, and how failed processing, index rebuilds, and low-confidence queries are handled.
