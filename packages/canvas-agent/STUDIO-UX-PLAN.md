# Studio agent UX — phase 4 plan (v2: annotation queue)

Status: **implemented 2026-07-21** (approved by Ford same day; built as nine
Codex tasks T1–T9 — §8's slices plus a protocol cleanup and a harness
render-crash fix — all landed in the working tree, uncommitted). The
sections below are the as-built design; deviations were none of substance.
Companion to HARNESS-SETUP-PLAN.md (§5 phase 4) and KERNEL-PROPOSAL.md §3.

v2 (2026-07-21, per Ford): the agent lives in the **top-right sidebar** as
an AI mode, annotations are the **primary channel** (a pending queue the
agent processes), the per-thing entry is the **right-click menu** (Notion
style, including section export), and the top bar simplifies — no back
button, no View toggle. v1's selection-toolbar sparkle entry + `E`
instruction popover are cut. v1's run-time machinery — camera lock, ghost
preview, SSE panel internals, accept semantics — carries over unchanged
(§5–§7).

v3 (2026-07-21, per Ford): **`E` returns as an annotate mode** — a
click-to-comment tool, not v1's instruction popover. Entering it opens
the AI sidebar; clicking a thing pops an autofocused comment box that
pins a note (§2.4). §8 is now the concrete file tree, laid out as
vertical slices matching the house feature-directory style.

Grounded facts this leans on: the Inspector's "+ Annotate" box already
creates `agent-request` annotations targeted at the selected object
(`Inspector.tsx:57-66`); a context menu with section-specific items
exists (`features/context-menu/CanvasContextMenu.tsx`); the renderer
already crops to a section (`sectionId` render option, `/preview.svg?section=`);
the create-session payload already carries annotations
(`protocol.ts` `CreateAgentSessionRequest.annotations`).

---

## 1. Storyboard

### Frame 1 — drop notes where you want work

```
┌──────────────────────────────────────────────────────────────────┐
│ ⟲ ⟳                                     Export ▾   ◫ Inspector   │
│                                             ✦ AI (1)             │
│   ┌ Auth ─────────────────┐    ┌ Billing ────────────────┐       │
│   │ [Login]  [Token]◉1    │    │ [Plan]   [Invoice]      │       │
│   │ [DB]                  │    │      ┌──────────────────┴─┐     │
│   └───────────────────────┘    │      │ Note to AI…        │     │
│                                │      │ Export section…    │     │
│                                └──────│ ────────────────── │     │
│                                       │ Fit children       │     │
│                                       │ Tidy membership    │     │
│                                       │ Delete             │     │
│                                       └────────────────────┘     │
└──────────────────────────────────────────────────────────────────┘
  Right-click anything → "Note to AI…" pins a request ◉ to it.
  The Inspector's Annotate box does the same for the selection.
  Each open note = one pending item; the AI button counts them.
```

### Frame 2 — AI mode: the pending queue

```
┌───────────────────────────────────────────────┬──────────────────┐
│ ⟲ ⟳                     Export ▾  ✦ AI (2)   │ AGENT            │
│                                               │ ─ Pending (2) ── │
│   ┌ Auth ─────────────────┐                   │ ◉1 Token card    │
│   │ [Login]  [Token]◉1    │                   │    "split into   │
│   │ [DB]                  │                   │     two rows"    │
│   └───────────────────────┘                   │ ◉2 Billing sect. │
│   ┌ Billing ──────────◉2──┐                   │    "align plan   │
│   │ [Plan]   [Invoice]    │                   │     w/ invoice"  │
│   └───────────────────────┘                   │ ─ Or globally ── │
│                                               │ ┌──────────────┐ │
│                                               │ │ Ask about the│ │
│                                               │ │ whole board… │ │
│                                               │ └──────────────┘ │
│                                               │ [ Apply 2 notes ]│
└───────────────────────────────────────────────┴──────────────────┘
  Click a pending item → the canvas pans to its pin. ✕ deletes it.
  A global comment runs against the whole board instead of pins.
```

### Frame 3 — running: read-only camera

```
┌───────────────────────────────────────────────┬──────────────────┐
│      ⦿ Agent is arranging — view-only  [Stop] │ AGENT  ● working │
│                                               │                  │
│   ╔═ working here ═══════════╗                │ You: apply 2     │
│   ║ ┌ Auth ────────────────┐ ║                │      notes       │
│   ║ │ ▒▒▒▒▒▒  ▒▒▒▒▒▒       │ ║                │ ✓ Read the scope │
│   ║ │ ▒▒▒▒▒▒  (draft 1)    │ ║                │   — 6 objects, 1 │
│   ║ └──────────────────────┘ ║                │   boundary conn. │
│   ║ ┌ Billing ─────────────┐ ║                │ … Draft 1        │
│   ║ │ ▒▒▒▒▒  ▒▒▒▒▒▒        │ ║                │ … Looking at the │
│   ╚══════════════════════════╝                │   result         │
│        (rest of board dimmed)                 │                  │
└───────────────────────────────────────────────┴──────────────────┘
  Board pans/zooms but nothing edits; nothing touches disk.
  The ghost draft renders live over the scope as the agent works.
```

### Frame 4 — proposal ready: review

```
┌───────────────────────────────────────────────┬──────────────────┐
│      ⦿ Proposal ready — view-only             │ AGENT  ● ready   │
│                                               │ ────────────────│
│   ╔══════════════════════════╗                │ Moved 3 · New 1  │
│   ║ ┌ Auth ────────────────┐ ║                │ Resized 2        │
│   ║ │ [Login] [Token a]    │ ║                │                  │
│   ║ │ ┈old┈┈  [Token b]new │ ║                │ "Split the token │
│   ║ └──────────────────────┘ ║                │  card, aligned   │
│   ║ ┌ Billing ─────────────┐ ║                │  plan/invoice."  │
│   ║ │ [Plan]  [Invoice]    │ ║                │ ▸ 2 layout notes │
│   ╚══════════════════════════╝                │ ────────────────│
│    ┈┈┈ = where movers were                    │ ┌──────────────┐ │
│    new  = created badge                       │ │ Refine…      │ │
│                                               │ └──────────────┘ │
│                                               │ [Accept] [Reject]│
└───────────────────────────────────────────────┴──────────────────┘
```

### Frame 5 — accepted

```
┌───────────────────────────────────────────────┬──────────────────┐
│ ⟲ ⟳                     Export ▾  ✦ AI       │ AGENT            │
│                                               │ ✓ Applied: moved │
│   ┌ Auth ─────────────────┐                   │   3, created 1.  │
│   │ ⟬Login⟭ ⟬Token a⟭     │ ← halo            │   ⌘Z undoes.     │
│   │ ⟬DB⟭    ⟬Token b⟭     │                   │                  │
│   └───────────────────────┘                   │ ─ Pending (0) ── │
│   ┌ Billing ──────────────┐                   │   All clear.     │
│   │ ⟬Plan⟭  ⟬Invoice⟭     │                   │                  │
│   └───────────────────────┘                   │                  │
└───────────────────────────────────────────────┴──────────────────┘
  One undo step. The consumed pins are cleared in the same step —
  undo restores the layout AND the notes.
```

---

## 2. Entry points

### 2.1 Top bar: the AI button (and the simplification)

The canvas top bar drops the **back button** and the **View toggle**
(studio's `topBarLeading`/`topBarActions` wiring — view mode stays
reachable by URL/route, nothing is deleted from the router). The right
cluster becomes: `Export ▾ · Inspector · ✦ AI`, where **✦ AI** toggles the
agent sidebar and wears a badge with the count of open `agent-request`
annotations — pending work is visible before you ever open the panel.

Consequence to confirm: with the back button gone, returning to the
canvas list is route-only (⌘-left/menu in Electron). Flagged, not
designed here.

### 2.2 Right-click: the per-thing menu

The existing context menu gains, for any object:

- **Note to AI…** — inline mini-input right in the menu position (type,
  Enter): creates an `agent-request` annotation targeted at that object,
  exactly what the Inspector's Annotate box does today. The AI badge
  increments; a pin ◉ appears on the object.

and for sections additionally:

- **Export section…** — Notion-style block export: the same output
  options as the top-bar Export, cropped to the section (the renderer's
  `sectionId` crop already exists; `/preview.svg?section=` is the saved-file
  variant).

No separate "Arrange with AI" item — pinning a note to the section *is*
that gesture, and one channel beats two.

### 2.3 Inspector: already built

The Annotate box already creates object-targeted `agent-request`
annotations. It stays the selection-driven authoring path; no changes
except that created pins now render on the stage (§4.1).

### 2.4 `E` — annotate mode

The fast lane for queueing notes. Press `E` (free key, left hand, above
the home row; not a dock tool, so the positional dock scheme is
untouched) or click "Add note" in the AI sidebar:

- The editor switches to the **annotate tool** (the stale `"annotation"`
  member of the `CanvasTool` union comes back to life properly). Cursor
  becomes a comment cursor; the AI sidebar opens automatically so the
  queue is visible while you work.
- **Click an object or section** → a comment popup appears at the click
  point, textarea **already focused** — click, type, Enter. Enter pins
  the note (`canvas.addAnnotation`, `agent-request`, targeted at the
  clicked object), the ◉ pin and the queue update, and the popup closes
  — but the mode persists, so you can keep clicking and typing across
  the board. Shift+Enter for a newline; Escape closes the popup without
  saving.
- Click on empty canvas: nothing in v1 (a quiet "click an object to pin
  a note" hint near the cursor); region pins are a later item (§9).
- `E` again or Escape (with no popup open) returns to the select tool.
  The sidebar stays open.

The popup is dark floating trim — it gets the measured FigJam recipe
(ring + key + ambient shadow, 140ms enter, instant exit).

### 2.5 The global comment

For "I don't want to point at things": a free-text box in the AI sidebar
("Ask about the whole board…"). Running it scopes the session to the
entire board and sends the comment as the instruction. Pins and the
global comment are alternatives per run, not layers: if both exist, the
run takes the pins and the comment together (comment as the instruction,
pins as annotations — the harness payload carries both).

---

## 3. The AI sidebar

Right-docked, the Inspector's geometry family (`right-4 top-20 bottom-24`,
~320–384px). Opening AI closes Inspector and vice versa — one right
sidebar at a time. Idle layout:

1. **Pending list** — every open `agent-request` annotation: target label
   ("Token card", "Section 'Billing'"), body text, ✕ to delete. Click →
   canvas pans/zooms to the pin. Empty state: "Right-click anything and
   choose 'Note to AI' to queue a request."
2. **Global comment box** (§2.5), plus an **"Add note"** button that
   enters annotate mode (§2.4).
3. **Run button** — "Apply N notes" / "Ask" (global). Disabled with
   nothing queued and no comment. A run always takes the whole open
   queue (§4.0) — no per-note selection.

On run, the sidebar becomes the session surface (v1's panel internals,
unchanged): plain-language SSE stream grouped per attempt, delta card
computed from the structured operations (chips: Moved · Created ·
Removed · Resized — resizes always called out, the S/M/L solver quirk
must never be a post-accept surprise), lint behind a disclosure, footer
with Accept / Refine input / Reject.

### 3.1 Scope rules (pins → Ring 0)

- Each pinned object contributes its **enclosing top-level section**
  (whole-section scope; section trim/growth rules apply). A pin on a
  section contributes that section. A pin on an orphan object
  contributes the object itself.
- The run's scope = the union of contributions; Ring 0's frame is the
  union bbox (distant sections mean a large frame — accepted for v1,
  noted as a loop-quality watch item).
- Global comment (no pins): scope = every top-level object on the board.
- All pending pins process in **one session** ("do all the updates"),
  riding the payload as annotations. When there is no global comment the
  instruction is the constant "Apply the pinned notes." (the create route
  400s on an empty instruction; the notes themselves carry the content).

---

## 4. Annotations: pins on the stage

### 4.0 Lifecycle rule (settled 2026-07-21, Ford)

**Annotations are the agent's inbox, not a comment system.** They are
short-lived by design:

- A run always processes **the entire open queue** — there is no
  per-note selection, no partial run. "Apply N notes" means all N.
- When the turn lands (**accept**), every note that rode the session is
  **removed from the document** in the same atomic patch. They go off
  the system; nothing lingers. The schema's `status` values
  (`applied`/`resolved`) go unused — removal *is* the lifecycle.
- **Reject/Stop/abandon**: the work didn't happen, so the notes stay
  open — the queue is preserved, not half-consumed.
- Notes do persist in the saved document until processed (build a queue,
  come back tomorrow, run it) — "short-lived" means they never outlive
  processing, not that they can't survive a reload.
- No threads, no replies, no resolved-history. The only other exits are
  manual: ✕ in the queue or Delete on a selected pin.
- The `note` intent stays schema-valid but gets no UI — this surface
  authors `agent-request` only.

### 4.1 Rendering

Open `agent-request` annotations render as small pin chips ◉ at their
target's top-right corner (world overlay component, editor only — never
in viewer/export). Click selects the annotation (`selection.kind ===
"annotation"` exists today); Delete removes it; hover shows the body.

### 4.2 Lifecycle

Created via right-click or Inspector (`canvas.addAnnotation`,
`intent: "agent-request"` — exists). Deleted via ✕ in the sidebar or
Delete on a selected pin — **needs the new `canvas.removeAnnotation`
action; today annotations only die by target-cascade.** Consumed on
accept: the accept patch appends `removeAnnotation` ops for every pin
that rode the session, so apply-and-clear is one undo step.

---

## 5. During the run (carried from v1)

**Camera mode.** While a session is `running`/`proposal-ready` the editor
locks to a read-only camera: pan/zoom/scroll live; selection, drags,
typing, tools, undo/redo inert. A slim pill: "Agent is arranging — board
is view-only" + **Stop**. Implemented as an editor prop (`cameraOnly`),
not an event shield. Locking makes hash drift an edge case instead of a
routine accept-conflict. Studio flushes pending autosave *before*
creating the session — the harness fits from the saved file.

**Ghost preview.** Fetch `draft.svg` as text, read its `viewBox` (world
coordinates: solved frame + 128px ring), inline it in the stage's
`worldOverlay` slot (z4, pointer-events none) at exactly that rect — it
pans/zooms with the world transform for free and covers the baseline
objects beneath; unchanged context aligns pixel-perfect, so only real
motion reads as difference. Re-fetched per `proposal`/`rendering` event.
A tinted work frame surrounds it; a light screen-space scrim dims the
rest of the board (the "unchanged is dimmed" reading, delivered outside
the flat image).

**Decorations on `proposal-ready`,** computed from `proposal.operations`
against the baseline document:

| Class | Source | Visual |
|---|---|---|
| Rearranged | `updateObject` geometry change | dashed outline at old rect, agent-tint wash at new |
| Displaced | made-room set | same in a cooler blue — collateral motion reads instantly |
| New | `addObject` | "new" badge chip |
| Removed | `removeObject` | dashed old rect + "removed" chip |

Honest degradation: the store never populates `madeRoomIds` today, so v1
classifies every mover as rearranged; the displaced class is specced and
styled now and lights up when the harness wires it.

**Stop** = reject; known gap surfaced honestly: the harness has no
run-abort, so the server-side run finishes on its own while the UI
detaches. (Hardening item, §8.3.)

---

## 6. Accept / refine / reject (carried from v1)

**Accept.** POST accept → `{ operations, summary, rebased }`; append
`removeAnnotation` ops for consumed pins; one
`editorRef.dispatchAgentPatch(operations, summary)` — one undo step,
`source: "agent"`, existing halo. Ghost clears as the patch lands; camera
unlocks; autosave resumes. Sidebar shows "Applied: moved 3, created 1.
⌘Z undoes." and returns to the (now empty) queue. `rebased: true` adds
"The board had changed, so the layout was refit onto the current
arrangement."

**Refine.** Footer input → flush autosave, recapture snapshot, POST
message into the same session; new attempt group in the stream; accept
bar re-arms on the next `proposal-ready`. Known loop issue designed
around: refine refits into the previous solution's frame, so
re-orientations grind and abandon — the abandoned banner offers **"Start
over with this instruction"** (reject + fresh session, prefilled), the
actual remedy until the solver improves.

**Reject / Stop.** POST reject; ghost and decorations clear; camera
unlocks; pins **survive** (they were not consumed — the queue is still
pending). Leaving the route with a live session sends a best-effort
reject; an orphaned session is harmless (the harness never writes canvas
files).

**Committed-then-abandoned — settled as UX behavior.** The last good
proposal survives an abandoned follow-up, explicitly labeled: "Draft 2
was abandoned. Proposal 1 is still available." — ghost reverts to it,
Accept applies it. Matching harness hardening (in scope): `accept` gains
a status gate — allowed from `proposal-ready`, from `abandoned` only when
a proposal exists, refused with a plain 409 after `accepted`/`rejected`
(today it gates only on proposal presence, so double-accept is
possible). `abandon` keeps the proposal by design.

**Hard 409 on accept** (scope object hand-moved/deleted — second window
or external edit, given camera mode): in-panel, not a modal — "The board
changed while the agent was working, and the proposal no longer fits.
Nothing was applied." Actions: **Discard** / **Try again on the current
board** (new session, same pins).

---

## 7. Failure and degraded states

1. **Abandoned, no prior proposal** — reason verbatim + "The agent
   couldn't find an arrangement that fit. Try fewer notes or a smaller
   ask." Queue intact.
2. **Error / stream drop** — "Something failed" + message; one silent
   SSE resubscribe first (the route replays the full event buffer, so
   reconnects are lossless); then Retry (new session, same payload) /
   Close.
3. **Harness down** — the run button's failure state: "The agent service
   isn't running — start it with `make studio` (or `make harness`)." No
   health polling; the AI button never hides.
4. **Solver resized things** — not a failure; the delta card leads with
   resize counts whenever present.

---

## 8. The file tree

Two vertical slices — one per package — plus surgical edits to existing
files. The rule that keeps the cut clean: **everything in
`packages/canvas` is annotation/editor mechanics and knows nothing about
sessions or the harness; everything session-shaped lives in studio's one
`src/agent/` slice** and talks over the proxy with types from
`@codecaine-ai/canvas-agent/protocol`.

### 8.1 `packages/canvas` — one new feature slice + edits

```
packages/canvas/src/
├── stage/editor/features/annotate/          NEW SLICE — the whole authoring feature
│   ├── AnnotationPins.tsx                   ◉ pin chips, world overlay (editor-only);
│   │                                          click-to-select, hover shows body
│   ├── AnnotationPopup.tsx                  the click→comment popup (autofocused
│   │                                          textarea, FigJam popup recipe)
│   ├── use-annotate-mode.ts                 mode state: click targeting, popup
│   │                                          anchor, save (addAnnotation) / cancel
│   └── __tests__/
│       └── annotate-mode.test.tsx
│
├── stage/editor/
│   ├── InteractiveCanvasEditor.tsx          EDIT: `cameraOnly` prop; mounts the
│   │                                          annotate slice; `tool` added to the
│   │                                          onEditorStateChange payload (studio
│   │                                          opens the sidebar on mode entry)
│   ├── use-canvas-hotkeys.ts                EDIT: E ⇄ annotate tool
│   └── features/context-menu/
│       └── CanvasContextMenu.tsx            EDIT: "Note to AI…" (all objects,
│                                              inline input) + "Export section…"
│                                              (sections; sectionId render crop)
│
└── state/
    ├── actions/types.ts                     EDIT: revive `"annotation"` tool id;
    │                                          +canvas.removeAnnotation action;
    │                                          +removeAnnotation patch-op member
    ├── actions/annotations.ts               EDIT: removeAnnotation handler
    └── actions/agent-patch.ts               EDIT: apply removeAnnotation ops in
                                               the same withHistory entry
```

### 8.2 `packages/studio` — one new slice

```
packages/studio/src/
├── agent/                                   NEW SLICE — the whole session surface
│   ├── index.ts                             barrel: what App.tsx mounts
│   ├── session-client.ts                    HTTP + SSE over the studio proxy
│   │                                          (one silent resubscribe; protocol types)
│   ├── use-agent-session.ts                 the state machine: idle → running →
│   │                                          proposal-ready → accepted/rejected/
│   │                                          abandoned; flush-before-invoke;
│   │                                          snapshot capture
│   ├── pending-notes.ts                     document → queue items (open
│   │                                          agent-request annotations, labeled)
│   ├── scope.ts                             §3.1: pins → scopeObjectIds
│   ├── classify-changes.ts                  proposal.operations + baseline →
│   │                                          rearranged/displaced/new/removed
│   │                                          (shared by ghost + delta card)
│   ├── stream-copy.ts                       SSE event → plain-language line
│   ├── AgentSidebar.tsx                     shell: queue view ⇄ session view;
│   │                                          swaps with Inspector; NOT dev-gated
│   ├── QueueView.tsx                        pending list + global comment + run
│   ├── SessionView.tsx                      stream + accept bar + refine input
│   ├── DeltaCard.tsx                        chips + delta text + lint disclosure
│   ├── GhostPreviewLayer.tsx                worldOverlay composite: draft.svg at
│   │                                          its viewBox rect + work frame +
│   │                                          decorations; screen-space scrim
│   ├── CameraLockPill.tsx                   "view-only" pill + Stop
│   └── __tests__/
│       ├── scope.test.ts
│       ├── classify-changes.test.ts
│       └── use-agent-session.test.tsx
│
└── App.tsx                                  EDIT: drop back button + View action;
                                               add ✦ AI toggle w/ pending badge;
                                               session hook beside editorRef; pass
                                               cameraOnly + overlays + agent props
```

### 8.3 `packages/canvas-agent` (small hardening)

- Accept status gate + keep-proposal-on-abandon semantics (§6).
- Deferred, noted: run-abort on reject; `madeRoomIds` wired into the
  store's diff calls (lights up the displaced class).

---

## 9. Open items / later

- Back-to-list navigation once the back button is gone (§2.1) — confirm
  the Electron/menu path.
- Batch semantics beyond one-session-for-all-pins (per-section batches
  when pins span distant sections).
- Region-targeted notes (drag a region → pin, empty-canvas clicks in
  annotate mode); today's authoring paths are object-targeted.
- Selection-toolbar shortcut entry (v1's sparkle) if the queue model
  wants another lane later.
- Run-abort on Stop; displaced-class wiring (§8.3).
