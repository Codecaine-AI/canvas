# SF blind system reconstruction

## SYSTEM PURPOSE
A staged RAG ingestion-and-retrieval system that ingests source arrivals with ACLs, normalizes and versions content, embeds and publishes indexes, rewrites and retrieves user questions, applies permission/grounding checks, generates grounded answers with citations/outcomes, and supports embedding-model rebuild with atomic switchover.

## COMPONENTS
- Overall system: 2026-07-28-eval-164042 · rag-ingestion-retrieval: Frames the diagram as a RAG ingestion and retrieval system. [The top-left header reads "2026-07-28-eval-164042 · rag-ingestion-retrieval".]
- 1 · Sources & arrivals: Receives source arrivals and emits them together with ACLs. [The first upper container is titled "1 · Sources & arrivals" and its outgoing connection is labeled "arrivals + ACLs".]
- Adapters...: Acts as the visible internal element for the sources-and-arrivals stage. [A yellow note inside stage 1 is visibly labeled "Adapters...".]
- 2 · Extract & classify: Processes incoming arrivals and ACLs, producing normalized content with a hash. [The second upper container is titled "2 · Extract & classify"; it receives "arrivals + ACLs" and its outgoing connection is labeled "normalized + hash".]
- Normaliz...: Performs an internal normalization-related operation in the extract-and-classify stage. [A yellow note inside stage 2 is visibly labeled "Normaliz...".]
- 3 · Version & chunk: Takes normalized, hashed material and produces versioned fragments. [The third upper container is titled "3 · Version & chunk"; it receives "normalized + hash" and sends "versioned fragments".]
- Version ...: Performs an internal version-related operation within the version-and-chunk stage. [A yellow note inside stage 3 is visibly labeled "Version ...".]
- 4 · Embed & retry: Processes versioned fragments through embedding and retry behavior, then emits a completed version. [The fourth upper container is titled "4 · Embed & retry"; it receives "versioned fragments" and has an outgoing blue connection labeled "completed version".]
- Embeddi...: Performs an internal embedding-related operation within the embed-and-retry stage. [A yellow note inside stage 4 is visibly labeled "Embeddi...".]
- 5 · Version-consistent...: Receives a completed version and makes published indexes available to retrieval. [The fifth upper container is titled "5 · Version-consistent..."; a blue arrow labeled "completed version" enters it, and a dashed teal path labeled "published indexes" descends from it toward stage 7.]
- Three ...: Acts as the visible internal element of the version-consistent stage. [A yellow note inside stage 5 is visibly labeled "Three ...".]
- 6 · Question & rewrite: Accepts a user question and produces rewritten searches for retrieval. [The sixth container is titled "6 · Question & rewrite" and its outgoing purple connection is labeled "rewritten searches".]
- User ...: Represents the user-related input or operation within the question-and-rewrite stage. [A yellow note inside stage 6 is visibly labeled "User ...".]
- 7 · Hybrid retrieval: Uses rewritten searches and published indexes, performs parallel retrieval, and emits fused and reranked results. [The seventh container is titled "7 · Hybrid retrieval"; it receives the purple "rewritten searches" path and the dashed teal "published indexes" path, and sends a purple path labeled "fused + reranked".]
- Parallel ...: Performs a parallel operation inside hybrid retrieval. [A yellow note inside stage 7 is visibly labeled "Parallel ...".]
- 8 · Permission & grounding: Receives fused and reranked retrieval results, applies permission and grounding processing, and emits permitted evidence. [The eighth container is titled "8 · Permission & grounding"; it receives "fused + reranked" and its outgoing connection is labeled "permitted evidence".]
- Permissi...: Performs an internal permission-related operation within the permission-and-grounding stage. [A yellow note inside stage 8 is visibly labeled "Permissi...".]
- 9 · Grounded answer: Uses permitted evidence to generate a grounded answer and sends citations plus outcome onward. [The ninth container is titled "9 · Grounded answer"; it receives "permitted evidence" and its outgoing connection is labeled "citations + outcome".]
- Generati...: Performs an internal generation-related operation within the grounded-answer stage. [A yellow note inside stage 9 is visibly labeled "Generati...".]
- 10 · Feedback & coverage: Receives citations and outcome for feedback and coverage processing. [The tenth container is titled "10 · Feedback & coverage" and receives the connection labeled "citations + outcome".]
- Signals...: Handles an internal signals-related operation within feedback and coverage. [A yellow note inside stage 10 is visibly labeled "Signals...".]
- 11 · Embedding-model rebuild & atomic switchover: Coordinates creation of a new embedding-model generation, checks that it is complete and consistent, and performs an atomic switchover. [The lower container is titled "11 · Embedding-model rebuild & atomic switchover" and contains a left-to-right orange sequence labeled "new generation" and "complete + consistent".]
- Model ...: Initiates or represents the model-related part of the embedding-model rebuild sequence. [The left yellow note in stage 11 is visibly labeled "Model ..." and sends the orange path labeled "new generation".]
- Consiste...: Performs a consistency-related operation on the new generation before switchover. [The middle yellow note in stage 11 is visibly labeled "Consiste..."; it receives "new generation" and sends "complete + consistent".]
- Atomic ...: Performs the final atomic operation after the generation is complete and consistent. [The right yellow note in stage 11 is visibly labeled "Atomic ..." and receives the orange arrow labeled "complete + consistent".]

## FLOWS
- data · Ingestion, versioning, embedding, and publication: 1 · Sources & arrivals sends "arrivals + ACLs" to 2 · Extract & classify. → 2 · Extract & classify sends "normalized + hash" to 3 · Version & chunk. → 3 · Version & chunk sends "versioned fragments" to 4 · Embed & retry. → 4 · Embed & retry sends "completed version" to 5 · Version-consistent.... → 5 · Version-consistent... sends "published indexes" along a dashed teal path to 7 · Hybrid retrieval. [The upper row is connected left-to-right by labels "arrivals + ACLs", "normalized + hash", "versioned fragments", and "completed version"; a dashed teal line labeled "published indexes" runs from stage 5 down and left into stage 7.]
- data · Question rewriting and hybrid retrieval: 6 · Question & rewrite processes the visible "User ..." element. → 6 · Question & rewrite sends "rewritten searches" to 7 · Hybrid retrieval. → 7 · Hybrid retrieval also receives "published indexes" from stage 5. → The "Parallel ..." element operates inside 7 · Hybrid retrieval. → 7 · Hybrid retrieval sends "fused + reranked" results to 8 · Permission & grounding. [A purple arrow labeled "rewritten searches" enters stage 7 from stage 6; a dashed teal arrow labeled "published indexes" also enters stage 7; a purple arrow labeled "fused + reranked" enters stage 8.]
- data · Permission, grounded answer, and feedback: 8 · Permission & grounding receives "fused + reranked" results. → 8 · Permission & grounding sends "permitted evidence" to 9 · Grounded answer. → 9 · Grounded answer sends "citations + outcome" to 10 · Feedback & coverage. [The middle-row connections are labeled in order "fused + reranked", "permitted evidence", and "citations + outcome" between stages 7 through 10.]
- control · Embedding-model rebuild and atomic switchover: "Model ..." sends a "new generation" to "Consiste...". → "Consiste..." sends the generation onward only in the depicted state "complete + consistent". → "Atomic ..." receives the "complete + consistent" result as the final step. [Inside stage 11, orange arrows run left-to-right from "Model ..." to "Consiste..." with label "new generation", then to "Atomic ..." with label "complete + consistent".]

## FAILURE PATHS

## CONSTRAINTS & BOUNDARIES
- Source arrivals are carried with ACLs. [The stage 1 to stage 2 connection is explicitly labeled "arrivals + ACLs".]
- Content passed into versioning/chunking is normalized and accompanied by a hash. [The stage 2 to stage 3 connection is explicitly labeled "normalized + hash".]
- Embedding operates on versioned fragments. [The stage 3 to stage 4 connection is explicitly labeled "versioned fragments".]
- The version-consistent stage receives a completed version before publishing indexes. [The blue incoming path to stage 5 is labeled "completed version", while its dashed teal outgoing path is labeled "published indexes".]
- Retrieved material is permission-checked before it is used as evidence for the grounded answer. [Stage 8 is titled "Permission & grounding" and sends only "permitted evidence" to stage 9.]
- The grounded-answer output includes citations and an outcome. [The connection from stage 9 to stage 10 is labeled "citations + outcome".]
- Atomic switchover follows a complete and consistent state. [In stage 11, the arrow entering "Atomic ..." is labeled "complete + consistent".]
- The main process is explicitly ordered into numbered stages 1 through 11. [The containers are visibly numbered and titled from "1 · Sources & arrivals" through "11 · Embedding-model rebuild & atomic switchover".]

## UNCERTAIN
- Several internal yellow-note labels and the stage 5 title end in ellipses.: Their complete text is not readable in the image. The visible forms are "Adapters...", "Normaliz...", "Version ...", "Embeddi...", "Three ...", "User ...", "Parallel ...", "Permissi...", "Generati...", "Signals...", "Model ...", "Consiste...", "Atomic ...", and "5 · Version-consistent...".
- The title "4 · Embed & retry" explicitly mentions retry.: No retry loop, retry trigger, exhausted-retry outcome, or other failure path is visibly drawn.
- The top-row first three connections are light gray and their arrowheads are not clearly distinguishable at the displayed resolution.: Their left-to-right direction is communicated by stage ordering and labels, but explicit arrowhead visibility is weaker than for the blue, teal, purple, and orange paths.
- The connections labeled "permitted evidence" and "citations + outcome" are very light.: Their association with adjacent ordered stages is visible, but arrowheads are not clearly distinguishable at the displayed resolution.
- Stage 11 is visually separate from the numbered ingestion/retrieval paths.: No visible connector shows what triggers the rebuild sequence or how "Atomic ..." reconnects to the published-index or retrieval paths.
- No explicit ownership labels, teams, external systems, protocols, storage technologies, timing limits, capacities, or service boundaries are shown.: Ownership and implementation details cannot be determined from the picture.
