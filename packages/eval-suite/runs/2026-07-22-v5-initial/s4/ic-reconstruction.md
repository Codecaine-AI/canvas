TOPIC: An asynchronous swimlane pipeline accepts and validates a form submission, hands work through a queue to workers, persists and serves results, updates frontend progress, and emits tracing and metrics.

NODES:
- Board title: `Eval Suite S4 — Swimlane Pipeline`.
- Explanatory callout: `Solid edges are synchronous calls. Dashed edges are async handoffs.`
- Explanatory callout: `Submit returns immediately; the real work flows through the queue; status streams back to the browser.`
- `Frontend` lane: `Submit Form`, `Validate Input`, `Show Progress`, `Render Result`.
- Purple lane with an unreadable/garbled badge: `Parse Request`, `Auth Check`, `Enqueue Job`, `Serve Result`.
- `Data` lane: `Job Queue`, `Results DB`.
- `Observability` lane: `Trace Requests`, `Collect Metrics`.
- `Workers` lane: `Pick Up Job`, `Process Data`, `Write Results`.

EDGES:
- `Submit Form` → `Validate Input` (solid gray, unlabeled).
- `Validate Input` → `Show Progress` (solid gray, unlabeled).
- `Validate Input` → `Parse Request` (solid gray, `submit`).
- `Parse Request` → `Auth Check` (solid gray, unlabeled).
- `Parse Request` → `Trace Requests` (gray dashed, unlabeled).
- `Auth Check` → `Enqueue Job` (solid gray, unlabeled).
- `Auth Check` → `Render Result` (gray dashed, `cache hit`; the routed line merges into the left-entry connector immediately before `Render Result`).
- `Enqueue Job` → `Serve Result` (solid gray, unlabeled).
- `Enqueue Job` → `Job Queue` (orange dashed, `enqueue`).
- `Job Queue` → `Pick Up Job` (orange dashed, `pull`).
- `Pick Up Job` → `Process Data` (solid gray, unlabeled).
- `Process Data` → `Write Results` (solid gray, unlabeled).
- `Process Data` → `Collect Metrics` (gray dashed, unlabeled).
- `Process Data` → `Show Progress` (gray dashed, `status`).
- `Write Results` → `Results DB` (solid gray, `persist`).
- `Results DB` → `Serve Result` (solid gray, `read`).
- `Serve Result` → `Render Result` (solid gray, `response`).
- `Show Progress` → `Render Result` (solid gray, unlabeled).

GROUPS:
- `Frontend` groups the browser-facing form, validation, progress display, and result rendering.
- The purple lane groups request parsing, authorization, job enqueueing, and result serving; its function appears to be backend request/API handling, but that description is inferred from its member labels because the lane badge is not legible.
- `Data` groups the asynchronous `Job Queue` and stored `Results DB`.
- `Observability` groups request tracing and metric collection, fed asynchronously from `Parse Request` and `Process Data` respectively.
- `Workers` groups job pickup, data processing, and result writing.
- The two amber callouts form a legend/narrative area above the swimlanes rather than part of the process flow.

ORDER:
- A reader starts at the title and the two callouts, then at `Submit Form` in the upper-left of `Frontend`.
- The initial frontend path is `Submit Form` → `Validate Input`; validation starts `Show Progress` and also sends `submit` downward to `Parse Request`.
- The request path continues `Parse Request` → `Auth Check` → `Enqueue Job`. `Parse Request` also asynchronously hands off to `Trace Requests`.
- After authorization, a `cache hit` provides a dashed shortcut toward `Render Result`; otherwise the normal request path continues through `Enqueue Job`.
- `Enqueue Job` has two visible outcomes: a solid path to `Serve Result`, consistent with the note that submit returns immediately, and an asynchronous `enqueue` handoff to `Job Queue` for the real work.
- The work path is `Job Queue` → `Pick Up Job` → `Process Data` → `Write Results` → `Results DB`. Processing also sends asynchronous `status` updates back to `Show Progress` and metrics to `Collect Metrics`.
- The result path is `Results DB` → `Serve Result` → `Render Result`, labeled `read` and `response`; `Show Progress` also points to `Render Result`.
- No closed directed loop is explicitly drawn. The visual narrative instead branches at validation, parsing, authorization, enqueueing, and processing, then converges on progress/result display.

CONVENTIONS:
- The legend explicitly defines solid edges as synchronous calls and dashed edges as asynchronous handoffs.
- Arrowheads establish direction; small light-gray pill labels name selected relationships (`submit`, `cache hit`, `enqueue`, `response`, `read`, `status`, `pull`, `persist`).
- Pale full-width colored swimlanes encode ownership or subsystem: cyan frontend, purple request-handling, peach data, light gray observability, and green workers.
- White rounded rectangles represent both actions/services and named infrastructure entities; lane placement and labels distinguish processes from `Job Queue` and `Results DB`.
- Orange dashes visually emphasize the queue-mediated asynchronous path, while gray dashes carry the cache, status, tracing, and metrics handoffs.

UNCERTAIN:
- The purple lane badge is not confidently readable. Its visible glyphs resemble a left brace/bracket followed by slashes or strokes, so no verbatim lane name can be asserted.
- The `cache hit` dashed route originates from the outgoing side of `Auth Check` and reaches the left-entry junction at `Render Result`, but it shares the final connector/arrowhead with `Show Progress` → `Render Result`; the picture does not distinguish a separate direct terminal arrow from a merge into that connector.
- `Serve Result` receives both a direct solid edge from `Enqueue Job` and a later `read` from `Results DB`. The callout suggests the first is an immediate submit response and the latter is the completed-result response, but those two response semantics are not separately labeled.
- Orange versus gray is not defined by the written legend beyond both being dashed/asynchronous; orange appears to mark the queue path, but that extra color meaning is inferred.
- `Job Queue` and `Results DB` use the same rounded-rectangle shape as processing steps, so their storage/infrastructure role comes from their labels and the `Data` lane rather than a distinct database/queue shape.
