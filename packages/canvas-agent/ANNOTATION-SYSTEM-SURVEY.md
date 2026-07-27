# Annotation system survey — 2026-07-25

Ground-truth map of the current annotation / user-request system, taken ahead of the two-way thread work (W2 in AGENT-NORTH-STAR.md). Read-only findings with file references; nothing here is a design decision.

## Data model

- Stored on the board document itself (persisted in `.canvas.json`), not a session store: `packages/canvas/src/state/schema/document.ts:27` (`annotations?: InteractiveCanvasAnnotation[]`).
- Record shape (`packages/canvas/src/state/schema/annotations.ts:14-22`): `id`, `target`, `intent ("note" | "agent-request")`, `body` (single flat string), `status ("open" | "applied" | "resolved")`, `createdBy ("human" | "agent" | "system")`, `createdAt?`.
- Targets (`annotations.ts:9-12`): `{kind:"object", objectId}` | `{kind:"connection", connectionId}` | `{kind:"region", region}`. Anchoring is by id; only `region` is positional. Pins derive position from target geometry at render time (`AnnotationPins.tsx:66-67`).
- No `parentId`/`replies`/`threadId`/ordering — no thread structure anywhere.
- Validator: `packages/canvas/src/state/schema/validate.ts:552-566` (unknown `status` → `open`, unknown `createdBy` → `human`).
- Agent-side mirror: `packages/canvas-agent/src/protocol.ts:22-34` (`AgentSessionAnnotation`; has an index signature that would carry extra fields).

## Lifecycle

Creation (all hardcode `intent: "agent-request"`; reducer hardcodes `status: "open"`, `createdBy: "human"` — `packages/canvas/src/state/actions/annotations.ts:16-24`):
- Annotate-mode pin popup: `packages/canvas/src/stage/editor/features/annotate/use-annotate-mode.ts:95-100` + `AnnotationPopup.tsx:37`
- Right-click "Note to AI": `.../context-menu/use-canvas-context-menu.ts:260`, `CanvasContextMenu.tsx:89,148`
- Inspector: `.../inspector/Inspector.tsx:57-67`

Agent visibility:
- Studio collects open agent-requests (`packages/studio/src/agent/pending-notes.ts:48-57`), converts via `sessionAnnotations` (`packages/studio/src/App.tsx:169-190`; connection targets flattened to `region`), passes on session create (`App.tsx:587-597`).
- Harness merges doc + invoke annotations into the session queue: `syncSessionRequests`, `packages/canvas-agent/src/service/session/context.ts:340-367` (document wins on id collision; aliases `R1, R2…`).
- Queue entry + formatters: `packages/canvas-agent/src/agent/loaders/user-requests.ts:23-34,67,75,91,100`; REQUESTS block re-rendered into every tool result (`service/session/perception.ts:594,635`).
- Annotations deliberately excluded from the board digest: `packages/canvas-agent/src/board/digest.ts:7`.

Disposal (`resolve_request`):
- `packages/canvas-agent/src/service/session/tools.ts:71-120` — sets `status`/`note` on the in-memory queue entry only. Documented session-only at `user-requests.ts:5-7`. Tool schema: `agent/catalog/layout-editor/tools.ts:76-96`. `toolFinalize` blocks `committed` while any entry is open (`tools.ts:157-170`).
- **Consequence:** dispositions never reach the board or operator UI. No request-related `AgentSessionEvent` (`protocol.ts:131-187`); accept path doesn't touch annotations (`store.ts:280-341`). Document annotation stays `open` forever; pin + sidebar entry persist after a successful run. Only removals: manual sidebar X (`App.tsx:627-640`) and cascade on target deletion (`state/actions/agent-patch.ts:145-153`).

## Latent hooks (exist, never written)

- `createdBy: "agent" | "system"` — schema/validator/protocol support it; no writer.
- `status: "applied" | "resolved"` — round-trips validation; `pendingNotes` filters on it; no writer.
- `RequestQueueEntry.note` (`user-requests.ts:33`) — closest thing to an agent reply; single-valued, session-scoped, never persisted.

## UI

- Pins: `AnnotationPins.tsx:24-30` — renders only `open` + `agent-request` + object-targeted; single `◉`, body as tooltip, click selects. Connection/region annotations get no pin.
- Composer: `AnnotationPopup.tsx` — one textarea, create-only.
- Sidebar: `packages/studio/src/agent/QueueView.tsx:73-102` — flat list, body + remove button (wired via `AgentSidebar.tsx:97`).
- Inspector annotation box is write-only (`Inspector.tsx:210-233`).
- No component renders conversation, author, status, or timestamp. Selection model supports annotation selections (`state/actions/types.ts:71`) but nothing renders a detail view.

## Draft / commit

- `diffDocuments` explicitly omits annotations (`packages/canvas-agent/src/board/doc-diff.ts:12-14,141-146`).
- `AgentPatchOperation` has no annotation variant (`protocol.ts:69-75`) — the agent physically cannot propose an annotation change; anything written to `session.draft.annotations` is dropped at commit.
- Patch path only touches annotations defensively: cascade cleanup (`agent-patch.ts:145-153`), dead-selection pruning (`agent-patch.ts:188-191`).

## Gap list

### (a) Thread-based annotations (root + ordered replies)

- `schema/annotations.ts` — reply container or parent/root link + ordering; flat `body: string` is the blocker.
- `schema/validate.ts:530-566` — parse new shape + migrate existing flat records.
- `state/actions/annotations.ts` + `actions/types.ts:208-213` + `actions/reducer.ts:209` — no append-to-thread action exists.
- `state/actions/agent-patch.ts:145-153` — cascade delete must handle whole threads.
- `canvas-agent/src/protocol.ts:22-34` — mirror type.
- `agent/loaders/user-requests.ts` — single-line-per-entry formatters need multi-turn rendering.
- `service/session/context.ts:340-367` — sync a transcript, not `target/intent/body`.
- `studio/src/agent/pending-notes.ts:48-57`, `App.tsx:169-190` — both flatten to a single body.
- `QueueView.tsx:73-102`, `AnnotationPins.tsx`, `AnnotationPopup.tsx` — flat renderers; thread view has no home.

### (b) Agent-authored annotations + agent replies

- `state/actions/annotations.ts:22` — `createdBy` hardcoded `"human"`; parameterize.
- `board/doc-diff.ts:141-146` + `protocol.ts:69-75` — **hard blocker**: diff omits annotations, patch union has no annotation variant. Both need an annotation channel.
- `agent/catalog/layout-editor/tools.ts` + `service/session/operations/` — no annotation-authoring tool; `resolve_request`'s session-only `note` is the natural thing to promote into a persisted reply.
- `service/session/tools.ts:114-115` — where a document-side write would originate.
- `store.ts:280-341` (accept) + `protocol.ts:131-187` (events) — no channel returns dispositions/replies to studio.
- `AnnotationPins.tsx:24-30` + `pending-notes.ts:50` — filter to `status === "open"`; an agent-set `applied`/`resolved` would vanish from every surface; neither displays `createdBy`.
- `board/digest.ts:7` — decide whether agent-authored annotations become digest-visible.

## Cross-cutting decision

Document owns the annotation; session owns the status — the two-worlds split is why disposals are invisible. Threads and agent authorship force the call: move status + replies into the document (so disposal is an ordinary board mutation riding the draft), or keep session-side status and build a separate return channel. AGENT-NORTH-STAR.md records the recommendation: into the document.
