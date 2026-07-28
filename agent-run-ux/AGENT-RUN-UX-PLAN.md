# Agent Run UX — background runs, live playback, step replay

**Status:** proposal (not yet built) · **Date:** 2026-07-23 ·
**Design round 2026-07-24:** open questions resolved (see Decision log);
playback feel spec added to C; rail anatomy + live-follow model added to E
**Scope:** `packages/studio`, `packages/canvas-agent`, `packages/canvas`

The experience target, in one paragraph: you kick off an agent run, and the board
stays alive instead of freezing behind a scrim until one big reveal. Objects
appear as the agent places them — each one spawning and sliding into position at
a readable pace, like watching a colleague work. You can leave for another board
mid-run; the home grid shows a "working" badge on the busy canvas, and coming
back resumes the live view exactly where the run is. After (or during) a run, a
step rail lets you scrub through every edit the agent made, one operation at a
time, to understand how it got to the result.

This plan is five pieces (A–E). A is independent and fixes a real defect today.
B is the structural enabler. C and E both sit on B. D is nearly free.

---

## 0. Current architecture (facts this plan builds on)

Line references are as of 2026-07-23 and will drift.

- **Trigger + client state.** Studio starts runs from the AI sidebar
  (`packages/studio/src/App.tsx:608`); the client state machine is
  `packages/studio/src/agent/use-agent-session.ts` (status
  `idle | running | proposal-ready | accepted | rejected | failed`), HTTP/SSE
  plumbing in `packages/studio/src/agent/session-client.ts`. Studio never talks
  to the harness directly — `packages/studio/server/agent-proxy.ts` fronts
  `:4820`.
- **Server session state.** `packages/canvas-agent/src/service/session/store.ts`
  (`LayoutSessionStore`, `Map<sessionId, LayoutSession>`); status enum in
  `packages/canvas-agent/src/protocol.ts`
  (`running | proposal-ready | accepted | rejected | abandoned | error`).
  Sessions are keyed **globally by sessionId**; each records its `canvasId` but
  there is **no per-board index and no list route** — the client cannot ask "is
  a run active on canvas X".
- **Transport.** One SSE stream per session
  (`packages/canvas-agent/src/service/routes/sessions.ts:75`). On (re)subscribe
  the server **replays all buffered events** before attaching the live listener
  (`store.ts:358`) — the stream is already resumable. Event union
  `AgentSessionEvent` in `protocol.ts`: `fitted`, `proposal`, `delta`,
  `rendering` (reserved, unused), `proposal-ready`, `abandoned`, `error`,
  `status`.
- **No operations mid-run.** The client receives plain-language progress only;
  the actual `AgentPatchOperation[]` arrives once, at `proposal-ready` (and
  again, possibly rebased, from `POST .../accept`). The mid-run visual is a
  full `draft.svg` snapshot re-fetched by
  `packages/studio/src/agent/GhostPreviewLayer.tsx` on each progress event.
- **Per-operation state exists server-side.** Every applied mutator already
  assembles its own delta; `look` assembles whole-board perception. The shared
  operation factory's final pipeline stage is the emission seam. The granular
  feed this plan needs is produced and simply not wired to studio — Piece B is
  wiring, not new computation.
- **Lockout.** `cameraLocked = running || proposal-ready` (`App.tsx:589`) →
  `cameraOnly` on `InteractiveCanvasEditor` (tool forced to hand, all mutation
  gated off), plus scrim (`GhostPreviewLayer.tsx`) and
  `CameraLockPill` ("Agent is arranging — board is view-only").
- **Leaving the board kills the run.** Navigating away **rejects** the session
  (`App.tsx:441`). This is the defect Piece A removes.
- **Board switcher.** Home route grid of canvas cards
  (`App.tsx:939–1014`, item shape `{id, title, updated_at}`) plus
  `ProjectBoardsSection.tsx`. No status field on cards today.
- **Animation infra.** Exactly one tween in the codebase:
  `packages/canvas/src/stage/editor/features/section-fit/animate-section-fit.ts`
  — rAF loop, easeOutCubic, 180ms, per-frame non-history dispatches with a
  single undoable commit at the end, `prefers-reduced-motion` degrades to
  instant. The camera (`packages/canvas/src/navigation/use-canvas-viewport.ts`)
  is not animated at all.
- **Patch application seam.** `dispatchAgentPatch` →
  `packages/canvas/src/state/actions/agent-patch.ts` (`handleApplyAgentPatch`),
  one history entry stamped `source:"agent"`, emits
  `changedObjectIds`/`changedConnectionIds` which already drive the
  agent-change halo. Client-side diff classification in
  `packages/studio/src/agent/classify-changes.ts`.

---

## Piece A — Runs survive navigation; boards know their run state

**What changes.** Leaving a board detaches from the session instead of
rejecting it. The store gains a per-canvas index and a list route. The home
grid shows a status chip per card: pulsing "Agent working" while `running`,
"Ready to review" at `proposal-ready`. Re-entering a board with a live session
resubscribes (replay rebuilds client state) and re-enters the locked view.
Abandoning a run becomes an explicit action only (pill/sidebar button).

**Re-entry camera (decided 2026-07-24).** Entry intent splits the behavior:

- **Entering via the "Ready to review" chip** on a card is declared review
  intent: the board opens with the camera fitted to the work frame (animated
  via Piece C's reveal tween once it exists; instant fit before then) and the
  sidebar open on the proposal. Fitting is the fulfilment of that click, not
  a hijack.
- **Any other entry** (title click, recents, deep link) lands exactly where
  the user left the camera. If the work frame is off-screen, the edge
  indicator (the Piece C component, here labeled "Review") points at it, and
  the pill reads "Ready to review · Show me" — "Show me" runs the camera
  reveal. If this client has no stored camera (new window), fall back to
  fitting the work frame, since "where you left" doesn't exist.

The camera is never moved by a navigation that wasn't about the run.

**Touched files.**

| File | Change |
| --- | --- |
| `packages/studio/src/App.tsx` | Route-leave handler: detach, don't reject (~line 441). On board open: query for an active session on this canvas and re-attach. Home grid: render status chips from the new list endpoint. |
| `packages/studio/src/agent/use-agent-session.ts` | New entry path: `resume(sessionId)` alongside `start(...)`; teardown that closes the EventSource without a reject call. |
| `packages/studio/src/agent/session-client.ts` | `listSessions(canvasId?)` fetch; make unsubscribe side-effect-free. |
| `packages/canvas-agent/src/service/session/store.ts` | Secondary index `canvasId → Set<sessionId>`; maintain on create/terminal-status; retention policy for detached-but-running sessions (see risks). |
| `packages/canvas-agent/src/service/routes/sessions.ts` | New `GET /api/canvases/:id/agent/sessions?status=…` (and/or a global `GET /api/agent/sessions`) returning `{sessionId, canvasId, status, startedAt, instruction}`. |
| `packages/studio/server/agent-proxy.ts` | Ensure new route shape is proxied (likely already covered by the `/api/canvases/:id/agent/*` prefix). |
| `packages/studio/src/ProjectBoardsSection.tsx` | Same chip treatment for linked project boards, if their ids can carry sessions. |

**Home-grid freshness:** simplest is polling the list route every few seconds
while the home route is mounted. A dedicated status SSE is not worth it yet.

**Blast radius: small-to-medium, but it changes a lifecycle invariant.**
Today the server can assume at most one client per session and that sessions
end when the UI leaves. After A, sessions outlive their subscribers:

- Store retention needs a policy — a run that finishes with nobody attached
  must park at `proposal-ready` (that's the feature), but an *abandoned-looking*
  session should eventually expire (suggest: TTL from terminal status, no TTL
  while `running`).
- Two-clients-one-session becomes reachable (two windows). Replay-on-subscribe
  already makes this safe for reads; accept/reject should stay
  last-writer-wins with a clear error for the loser.
- The "one live session per board" assumption in studio (`hasLiveAgentSession`)
  becomes "at most one *attached* session". Starting a new run on a board with
  a parked proposal **routes, doesn't block** (decided 2026-07-24): the
  composer stays enabled; submitting a fresh instruction surfaces the parked
  proposal with three exits — **Review now** (accept/reject as usual),
  **Refine instead** (feed the new instruction to the parked session's
  existing refine path), or **Discard & start new** (reject, then start). A
  dead-end "review first" error would throw away the instruction the user
  just typed. Concurrent runs on one board stay unsupported — two shadow docs
  on one board is complexity with no user story. Revisit only if pinned-note
  queues make queued sequential runs common, and then as a per-board FIFO
  queue, still never concurrent.

Tests touched: session-store lifecycle and studio navigation tests, plus any
studio test asserting step/event counts — one emitted APPLIED operation is one
step; NO-OP, ERROR, and `look` calls contribute none.

---

## Piece B — Stream operations; render the draft with real objects

**What changes.** The harness emits one new SSE event per applied mutator
operation, carrying its lowered `AgentPatchOperation`, its one-line delta, and
its changed ids. Studio folds these events into a **client-side shadow
document** — a draft copy of the board — and the ghost layer renders that
shadow doc with the real stage components instead of re-fetching `draft.svg`.
Accept/reject semantics are untouched: the real document is only mutated at
accept, exactly as today (rebase logic at `store.ts:270` stays authoritative).

**Event contract.** Every mutator call resolves as APPLIED, NO-OP, or ERROR.
Only APPLIED changed the draft, so only APPLIED emits an operation event and
produces a rail row. NO-OP is legal but has nothing to do; ERROR leaves the
draft untouched; neither emits a step event. `look` is read-only perception,
not a step — it changes nothing, folds nothing, and gets no rail row. This
keeps the fold sequence total: every emitted operation is a real document
change. The event preserves `tool`, `targetKind`, and `targetId` beside the
lowered operation: lowering can erase the typed call identity the rail needs,
and neither Studio nor the trace viewer should infer it back from patch shape.

Why not apply operations to the real document live: reject needs clean rollback,
accept already rebases against concurrent edits, and after Piece A a run can
finish while you're on a different board — it must not mutate a document
nothing is rendering. The shadow doc gives the "live" feel with none of that.

**Touched files.**

| File | Change |
| --- | --- |
| `packages/canvas-agent/src/protocol.ts` | New event variant, e.g. `{type:"operation", n, tool, targetKind, targetId, operation, changedObjectIds, changedConnectionIds, delta}`. Additive union change. |
| `packages/canvas-agent/src/service/session/operation-tool.ts`, `operations/` | Emit at stage 11 of the shared operation-factory pipeline, one event per APPLIED operation. Each applied operation already assembles its own delta, and whole-board state comes from `look` — this is a wiring change, not new computation. |
| `packages/canvas-agent/src/service/session/store.ts` | Buffer the new events (replay-on-subscribe then covers resume and Piece E for free). |
| `packages/studio/src/agent/session-client.ts` | Parse the new event. |
| `packages/studio/src/agent/use-agent-session.ts` | Hold `draftDoc` state: on run start, clone the board doc; fold each operation via the same reducer logic as `agent-patch.ts` (extract the folding core so studio can run it without history/halo side effects). On replay, fold the buffered operation sequence to reconstruct mid-run state. |
| `packages/studio/src/agent/GhostPreviewLayer.tsx` | Replace SVG-refetch rendering with a read-only stage render of `draftDoc` (reuse the static/read-only render path; keep the scrim + work-rect crop). |
| `packages/canvas/src/state/actions/agent-patch.ts` | Extract a pure `foldAgentOps(doc, operations)` used by both the real accept path and the studio shadow doc, so the two can't drift. |
| `packages/studio/src/agent/classify-changes.ts` | Classify each operation's incremental created/moved/removed sets instead of only the whole proposal. |

**The wire-format landmine (the open clear-only-patch caveat).** The reducer
merges update patches by object spread, so *clearing* a field requires an
explicit own property set to `undefined` (`packages/canvas-agent/src/board/doc-diff.ts:130`,
e.g. `waypoints: undefined`). **JSON serialization silently drops
`undefined` own-properties.** The proposal path survives today only by
whatever encoding it already uses; a new SSE operation event must not
reintroduce the bug. The event schema must encode clears explicitly — either
`null` as a wire sentinel decoded back to an explicit-`undefined` own
property, or a `clearedFields: string[]` sidecar per update operation. Decide
once, in `protocol.ts`, and add a round-trip test
(`serialize → parse → fold` clears a waypoint). This resolves the standing
transport caveat rather than working around it.

**Blast radius: medium.** The protocol change is additive (old clients ignore
unknown event types). The risky part is the extracted fold: `agent-patch.ts`
currently interleaves folding with history/halo bookkeeping; the extraction
must be behavior-preserving for accept (covered by existing agent-patch tests)
while giving studio the pure version. Event buffers grow by one event per
applied operation — plan for hundreds of operation events in a real run, and
treat the §Cross-cutting bound as launch work rather than cleanup.
`GhostPreviewLayer` changes rendering technology entirely; its crop, scrim,
and outline decorations need re-verification against the same fixtures.

---

## Piece C — Playback queue, entrance animation, agent cursor

**What changes.** Streamed operations don't render the instant they arrive.
They enter a **playback queue** that folds them into the shadow doc at a
readable pace. Consecutive nearby operations coalesce into an animated group,
so a burst of twelve placements reads as deliberate work, not a glitch,
without charging every operation a complete cursor-and-rest cycle. A small
**agent cursor** glyph glides to the group's target area before its operations
land — the "someone is doing this" cue. Work outside the viewport folds
instantly and is pointed at by an edge indicator; clicking it animates the
camera over (no auto-panning — the user owns the camera even when it's all
they own).

### Playback feel (decided 2026-07-24)

**What it should feel like.** Glancing at a colleague across the table: their
hand moves, things appear where the hand is, at conversation pace. Look away
and back and the board is simply current, the hand wherever the work is. It
must never feel like a cutscene — playback is presentation lag, never state
lag, and the user's camera is never taken.

**Motion vocabulary** — reuses the two measured recipes already in the
codebase rather than inventing a third:

| Motion | Recipe |
| --- | --- |
| Entrance (created object) | Pop at final position: scale 0.92→1 + fade-in, 140ms `cubic-bezier(0.22, 1, 0.36, 1)` — the selection-toolbar/FigJam enter recipe. **No fly-in from the cursor**: cursor proximity supplies causality; flying objects read as chaos. |
| Move | Geometry tween from→to, 180ms easeOutCubic — the section-fit constants. Connector endpoints track per frame; elbow waypoints recompute once at tween end; connector opacity dips to ~50% mid-tween to declutter transient crossings. |
| Removal | Fade + scale to 0.95, 120ms; the existing "removed" outline chip persists after. |
| Section resize | `animate-section-fit`, as-is. |
| Camera reveal (only ever user-invoked) | `revealRect` tween ~320ms, same easing — deliberately slower than object motion because it moves the whole world. |

**Scheduling.** The operation is the atomic fold unit: operations fold in
arrival order, always, with no inner ordering layer. Animation scheduling
coalesces consecutive visible operations when their events arrive no more
than 300ms apart and each operation's before/after work rect intersects the
group rect expanded by 240 canvas units. The group closes after 300ms of
silence, at 600ms from its first event, on a region or visibility break, or
when the run reaches `proposal-ready`. That bounded temporal-and-spatial rule
is deliberate: it gives a burst in one work area one cursor visit, while
geographic jumps remain legible and the group cannot hold live work
indefinitely.

The cursor travels once to the group's work-rect centroid (160–240ms scaled by
distance, capped) and arrives ≥80ms before the first entrance. Operations in
the group enter in absolute arrival order, staggered 50ms; total group spread
is capped at ~600ms, compressing the stagger for a large group. After the
group's last entrance there is ≥220ms rest before the next cursor trip. The
group is a presentation decision only — the shadow document still folds one
operation at a time.

**The cursor.** A small `AGENT_COLOR` glyph in world coordinates. Shows an
"Agent" label chip on first appearance, decays to a bare dot after ~2s. Idle
between groups: subtle ~1.5s breathing pulse at the last work site. Never a
pointer-events target; z above objects, below trim. It is the causality cue:
every entrance is preceded by cursor arrival, so motion always answers "who
did this, where."

**Off-screen work: fold instantly, indicate — never perform to an empty
house.** When an entirely off-viewport operation reaches the queue head, it
folds at once without entrance animation; it never overtakes an earlier
visible operation. A visibility break closes the current animated group.
Off-screen operations feed an **edge indicator**: a chip at the viewport
boundary along the ray to their accumulated work-rect centroid, arrow +
accruing operation count ("+4"), pulse on new activity. Clicking it runs the
camera reveal to the accumulated off-screen work rect; already-folded objects
get a one-shot settle halo on arrival, not replayed entrances — same principle
as resume fast-forward: **never re-animate state that already landed.** This
also keeps the queue from backing up while nobody's watching. The same
indicator component serves parked-proposal re-entry (Piece A).

**Backpressure ladder.** Depth means unapplied operations, not animated
groups. Depth 1–8: full pacing. Depth 9–24: stagger and rest scale linearly
down to floors (20ms / 60ms). Depth >24, or `document.hidden` (rAF throttling
would back the queue up into refocus theater), or `proposal-ready`: drain
instantly in arrival order — fold with halos only, so the final state is never
withheld. These thresholds budget roughly one ordinary group at full fidelity
and compress across the next two; counting operations makes pressure visible
even when grouping varies. `prefers-reduced-motion`: everything instant
always; halos still mark change; indicators don't pulse. The pill reads
"catching up…" while above depth 8 (Piece D).

No sound. No auto-pan, ever.

**Touched files.**

| File | Change |
| --- | --- |
| `packages/canvas/src/stage/editor/features/…` (new) | Generalize the `animate-section-fit` tween into a small shared utility: `tween(from, to, ms, easing, onFrame, onDone)` with reduced-motion + cancellation semantics lifted as-is. |
| `packages/canvas/src/navigation/use-canvas-viewport.ts` | Add an animated `revealRect` variant using the same tween (first camera animation in the codebase; keep it opt-in per call site). |
| `packages/studio/src/agent/playback-queue.ts` (new) | Queue of operation events; temporal/spatial grouping, pacing, compression, drain-on-ready, reduced-motion bypass. Owns the ordering guarantee: operations fold in arrival order, always. |
| `packages/studio/src/agent/use-agent-session.ts` | Route incoming operation events through the queue instead of folding directly; expose unapplied-operation depth so the pill can say "catching up…". |
| `packages/studio/src/agent/GhostPreviewLayer.tsx` | Entrance/move animations driven by each group's ordered per-operation changed ids (the same ids that light the halo today); agent-cursor glyph + edge indicator rendering. |

**Resume behavior (decided, flagged as reversible):** when re-entering a
mid-flight board, replayed operations **fast-forward silently** to current
state; only operations arriving after attach animate. Replaying minutes of
animation is theater; the step rail (Piece E) is the right place to review
history.

**Blast radius: small and additive.** Everything lives in studio + one new
shared tween; nothing touches documents, protocol, or accept semantics. The
main risks are aesthetic (pacing constants want hand-tuning) and the usual
animation hygiene: cancellation on detach/reject, no tween outliving its
session, no per-frame history entries (the section-fit pattern already models
all three).

---

## Piece D — The pill narrates

**What changes.** `CameraLockPill` grows a live activity line cycling the
plain-language descriptions that already exist
(`packages/studio/src/agent/stream-copy.ts` — "Placing the retrieval
section…", "Draft 2…"), next to the existing stop control. The sidebar keeps
the full transcript; the pill is the glanceable version. During queue
catch-up (Piece C) it reads "catching up…"; at `proposal-ready` it flips to
review affordances.

**Touched files:** `CameraLockPill.tsx`, `stream-copy.ts` (per-operation copy
for operation events), `App.tsx` (pass current activity line). Keep
`aria-live` on the sidebar transcript, not the pill, to avoid double
announcements.

**Blast radius: trivial.** Pure presentational; no state or protocol changes.

---

## Piece E — Step replay / debug rail

**What this is.** A debugging pane that shows every edit the agent made, one
operation at a time, with the board state at each step — for understanding
*how* the agent got to a result, live or after the fact.

**Why it's nearly free after B:** the session event buffer becomes a complete,
ordered operation log, and replay-on-subscribe already serves it to any
client. The shadow-doc fold (`foldAgentOps`) reconstructs board state at step
*k* as `fold(base, operations 0..k)`. The debug pane is a scrubber over data
structures B already creates.

**Rail anatomy (decided 2026-07-24).**

```
┌──────────────────────────────────┐
│ Steps                     ● Live │  header: live-follow chip (running only)
├──────────────────────────────────┤
│ ○ Draft 1                        │  thin marker: run event, unnumbered
│ ● 1 place_section [§ retrieval]  │  operation row: tool + typed target
│ ● 2 connect [↗ in-parse]         │
│ ▌● 3 move_to [□ parser]          │  ▌ selected — board renders step 3
│   ▾ x: 420→448 · y: 160→192      │  ▾ parameters + one-line delta
│     Δ ~ parser moved 28,32       │
│ ○ Draft 2                        │  thin marker: attempt boundary
│ ● 4 fit_section [§ retrieval]    │
│ ⚠ Session retrying               │  thin marker: run-level error
├──────────────────────────────────┤
│ ⏮  ◀  3 / 7  ▶  ⏭    Live · +2 │  transport row; "+2" = accrued while paused
└──────────────────────────────────┘
```

- **Rows.** One compact row per applied operation: monotonic step number,
  tool name, and a typed target-id chip (`§ retrieval`, `□ parser`,
  `↗ in-parse`). The operation's one-line delta moves into the expansion, so
  the collapsed rail is shorter without losing detail. Run-level events
  (fitted, draft boundaries, session errors, abandoned) render as thin
  unnumbered markers so the timeline reads as the full run, not just the
  mutations. Mutator NO-OP/ERROR calls and `look` are absent by the Piece B
  event contract.
- **Selection model.** Exactly one selection: a step *k*, or **Live** — a
  distinguished selection at the tail, present only while `running`.
  Selecting step *k* renders `fold(base, operations 0..k)` read-only (same
  renderer as the ghost layer) with *that step's* changed ids haloed — the
  existing halo treatment, reused; earlier steps' ids are not haloed.
- **Live-follow.** While Live is selected, new operations auto-advance the
  rail and drive Piece C playback. Selecting any historical step pauses
  follow — never the run — and the transport row accrues "Live · +N" as
  operations keep arriving; clicking it (or pressing L) jumps to the tail
  and resumes follow, visibly.
- **Scrub × playback: jumps are instant, single steps animate.** Selecting an
  arbitrary step renders its fold immediately — no animation; replaying
  minutes of motion is theater. Stepping ▶ by exactly one, or invoking
  **Replay this step**, plays only that operation's animation once. That is
  the one-operation-at-a-time comprehension tool, and the only place a
  historical operation ever re-animates.
- **Keys** (active while the rail has focus — the sidebar shares space with
  the composer input): ↑/↓ or j/k step, Home/End jump to first/last, L for
  Live.
- **Per-step diff.** The row already is one operation, so its expansion shows
  that operation's parameters and one-line delta, not a nested list. The
  target id is clickable and flashes a halo in the step render; changed fields
  show before→after values. Field clears display explicitly
  ("waypoints: cleared"): the Piece B wire encoding surfacing honestly in the
  debugger.
- **After the run** (parked or accepted): no Live chip; the transport row
  shows position only; the last step is the proposal state.
- **Compaction.** Above 200 retained operations, the rail keeps the latest 200
  rows visible by default and folds the rest under an expandable "… N earlier
  steps" marker; selecting a hidden step opens the relevant virtualized
  window. Hundreds of operations make this a normal rail path, not an edge
  case. When the replay-buffer cap (§Cross-cutting) has replaced early events
  with a checkpoint, the marker reads "… earlier steps compacted" and is not
  expandable.
- **Default state:** collapsed in the sidebar (playback is the primary live
  surface; the rail is opt-in comprehension); open/closed remembered per
  session.

**Run provenance after accept (decided 2026-07-24).** At accept, stamp run
identity into what survives: the accepted history entry (already
`source:"agent"`) and the board doc's metadata gain
`{sessionId, traceRef, acceptedAt, summary}`. The in-memory session store
TTLs out, so the durable replay source is the kernel trace store the `:4830`
viewer already reads — `traceRef` is the primary key, `sessionId` secondary.
The stamp ships alongside B even though its UI doesn't: it is a data write at
the only moment the linkage exists; unrecorded provenance is gone forever.
The surface comes later — a board-history row ("Arranged by agent · date ·
View steps") that mounts the rail against kernel-sourced operations or
deep-links into the trace viewer. Not v1 UI scope; the stamp is.

**Two homes, one component.**

1. **Studio** — a collapsible rail inside the agent sidebar
   (`SessionView.tsx`), scoped to the current/parked session. This is the
   "what is it doing / what did it just do" surface.
2. **Trace viewer (`:4830`)** — the same component mounted in
   `packages/canvas-agent/src/viewer/` for post-mortem debugging against the
   kernel's durable trace store (`viewer/lib/kernel-api.ts`), where sessions
   from any run — including CLI runs studio never saw — can be scrubbed.
   Conventions there hold: renders are canvas renders; captured images stay
   behind explicit clicks, never inlined under rows. Bonus of this home: each
   operation row can link to its originating turn in the trace tree, putting
   the step render one click from the turn's captured context window.

**Touched files.**

| File | Change |
| --- | --- |
| `packages/studio/src/agent/StepRail.tsx` (new, shared) | The rail + scrubber + step render; takes `(baseDoc, operations[], selection)` — no transport knowledge, so both homes can feed it. |
| `packages/studio/src/agent/SessionView.tsx` | Mount the rail; wire selection to the ghost layer's render (scrubbing while `running` pauses live-follow). |
| `packages/canvas-agent/src/viewer/…` (SessionPage or TraceDetailView) | Mount the rail against kernel-sourced operations; adapter that maps stored tool-call records to the operation-event shape. |
| `packages/canvas-agent/src/service/routes/` | Only if the kernel read routes don't already expose per-turn operation payloads in a convenient shape — otherwise no server change. |

**Performance note:** folding `0..k` from scratch per scrub step is fine at
real run sizes (hundreds of operations) and within the 1,000-event replay cap.
If profiling shows a scrub fold crossing a 16ms frame budget, memoize prefix
snapshots every 50 operations. Don't build that first; rail virtualization and
the 200-row default window address rendering cost independently.

**Blast radius: small, almost purely additive.** New components; the only
shared-code dependency is `foldAgentOps` from B. The one behavioral wrinkle is
scrub-while-running (live follow must pause and visibly resume), contained in
`SessionView`/`StepRail` state.

---

## Cross-cutting risks

- **Event-buffer growth.** Buffers retain full operation payloads for replay;
  hundreds of applied operations per run is the working assumption. Cap the
  replay ring at 1,000 operation events or 8 MiB, whichever comes first, and
  past the cap replace the oldest events with one synthetic snapshot
  checkpoint (base doc folded forward). The finer event grain makes the cap
  and the rail's 200-row collapse behavior launch requirements. The step rail
  degrades explicitly — unavailable early steps collapse into "… earlier
  steps compacted".
- **The clear-encoding decision (Piece B) is load-bearing for E too:** the
  step rail shows "what the agent wrote", so a lossy wire format would lie in
  the debugger of all places. One encoding, one round-trip test, used by both.
- **Line-ref drift.** All `path:line` refs here are 2026-07-23; treat the
  paths as stable and the lines as hints.
- **Testing.** A: store lifecycle + navigation tests. B: fold-extraction
  parity tests (accept path unchanged), wire round-trip test for clears, and
  factory-pipeline tests proving APPLIED emits exactly one operation event
  while NO-OP, ERROR, and `look` emit none. C: arrival-order, grouping,
  reduced-motion, cancellation, and off-screen instant-fold tests. E: rail
  state tests count operations (scrub-while-live, follow pause/resume
  accrual, single-operation replay). The suite has known pre-existing
  failures — never gate on "suite green"; gate on the tests named here.

## Sequencing

```
A (lifecycle + badges)          — independent, fixes a real defect, ship first
        │
B (operation stream + shadow doc) — the structural piece
        ├── C (playback + animation)   — additive on B
        └── E (step rail, both homes)  — additive on B, parallel with C
D (pill narration)              — anytime; trivially small
```

A ships user-visible value alone. B ships value alone too (the ghost preview
stops being a re-fetched bitmap and starts being real objects — crisper at
every zoom, and the SVG-refetch fragility goes away). C and E are independent
of each other and can be built in parallel.

## Decision log (2026-07-24)

Each decision is specified in its piece.

1. **Parked-proposal re-entry camera → resolved in Piece A.** Entry intent
   splits it: the "Ready to review" chip fits the camera to the work frame
   (that click *is* review intent); every other entry lands where you left
   off, with the edge indicator + a "Show me" pill affordance. The camera is
   never moved by a navigation that wasn't about the run.
2. **Multiple runs per board → resolved in Piece A (blast radius).** Still
   one run per board, but route instead of block: a fresh instruction on a
   parked board offers Review now / Refine instead / Discard & start new.
   Future shape, if pinned-note queues demand it, is a per-board FIFO queue —
   never concurrent runs.
3. **Step rail from accepted history → resolved in Piece E (run
   provenance).** Stamp `{sessionId, traceRef, acceptedAt, summary}` at
   accept — ships with B because the data only exists at that moment; the
   board-history "View steps" surface comes later, backed by the durable
   kernel trace store rather than the TTL'd session store.

Playback and rail decisions (details in their pieces): playback paces only
visible work — off-screen operations fold instantly behind an edge indicator
without overtaking the fold sequence (C); nearby operations coalesce under a
bounded temporal-and-spatial rule, but operations always fold in arrival
order (C); state that already landed never re-animates, in playback, resume,
or scrubbing — the single exception is stepping the rail forward by exactly
one operation (C, E); entrances pop in place using the measured FigJam
recipe, no fly-ins (C); rail follow pauses on scrub, never the run (E).
