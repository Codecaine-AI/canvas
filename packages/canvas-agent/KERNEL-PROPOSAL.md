# Agent Kernel — integration proposal

Status: **draft for sign-off — no implementation yet.**
Scope: how the layout-lab pipeline becomes a real AI editing loop inside the
canvas product. Covers the kernel, scoped-editing UX, the agent's camera, and
the docs migration. Written 2026-07-20 from a survey of the current tree
(uncommitted state included).

Settled and assumed, not re-argued here: the canvas document is the single
source of truth; the program is fitted fresh per edit and thrown away; fit,
solve, and routing are deterministic; the AI is the only judgment in the loop;
layout intent eventually persists in the document with a reconcile pass.

---

## 1. The shape of the whole thing

Four pieces, three of which already exist in some form:

```
packages/layout            NEW — the graduated sketch pipeline (pure library)
  fit / serialize / expand / route / program-diff / lint

packages/canvas            EXISTS — gains one action + small extensions
  canvas.applyAgentPatch action (consumes CanvasAgentPatchOperation[])
  renderDocumentToSvg: add arbitrary-rect crop

layout harness             NEW — Agent Kernel harness (@agent-kernel/kernel,
  Pi Agent SDK) owning the layout tools + sessions; fronted through
  /api/canvases/:id/agent/* with SSE progress; calls packages/layout +
  the renderer in-process (topology settled at harness setup, see §2.1)

packages/studio (UI)       EXISTS — gains the invoke/preview surface
  selection-toolbar entry, instruction popover, ghost preview layer,
  accept/reject, refine
```

The first concrete move is **promoting `apps/layout-lab/src/sketch/` to a
workspace package** (`packages/layout`). The kernel, the studio server, and
the docs-sidecar generator all need it; layout-lab keeps importing it and
stays alive as the playground/verification harness. `mapping/to-canvas.ts` is
prototype-era (it maps the old `CompileResult`, and it is unmounted); the new
program-diff described in §2.3 replaces it rather than extending it.

---

## 2. The agent kernel

### 2.1 Where it runs

Three candidates were considered:

- **Client-side loop in the editor.** Rejected: the LLM call needs a key and
  a Node context; the editor is deliberately uncontrolled with no imperative
  surface; and a browser-resident loop dies with the tab.
- **External process (separate service).** Talks to studio over HTTP; must
  respect the save-path rules in §2.4 from the outside.
- **Studio's shared server handler** (`packages/studio/server/canvas-file-api.ts`).
  Already mounted identically in Vite dev middleware and the Electron
  packaged server, already imports canvas source directly (schema +
  `renderDocumentToSvg`), and is where `/preview.svg` lives.

Decided (D5, 2026-07-20): the loop is an **Agent Kernel harness** —
`Codecaine/agent-kernel` (`@agent-kernel/kernel` on the Pi Agent SDK). The
harness layer owns the layout tool surface below, session/workflow semantics,
and editor-state context; the kernel platform owns spawning, context
assembly, model routing, and trace observability. Whether the harness runs
inside studio's server process or as a sibling bun service the studio fronts
is settled during harness setup against agent-kernel's harness-adapter docs
(the deterministic layout library stays process-agnostic either way — given a
document, a scope, and a program, everything except the model call is a pure
function). The browser remains only the invoke/review surface. (Studio dev runs on **:3999**, not :4000 — worth correcting in
memory/notes.)

### 2.2 The session and its tools

A session is created from `{canvasId, scopeObjectIds, instruction,
annotations, baselineHash}` and holds a **draft document** in memory — the
board as it would be if the current proposal were accepted. Nothing touches
disk until accept.

The loop's tool surface (what the model sees):

| Tool | In | Out |
|---|---|---|
| `fit_scope` | — | program text; legend (number ↔ id/type/full text, sizes); boundary report (arrows crossing the scope edge, nearest outside neighbors, frame rect) |
| `propose_program` | full program text | parse/validate result (line-numbered errors verbatim from `parseSketch`), or: solved draft + **delta report** + **lint report** |
| `render_draft` | optional crop/zoom | image of the current draft with a margin ring of outside context |
| `inspect` | object refs | full text/body, exact geometry, occupancy ASCII (`canvasDocumentToOccupancyAscii` already exists) |
| `commit` / `abandon` | summary line | ends the loop; commit hands the proposal to the UI |

The **delta report** is text and free: objects moved (with before/after
compass-and-band description, not raw coordinates), objects created, spacing
ladder violations, overflow beyond the scope frame, connector/box crossings
(`countPathBoxViolations`), off-grid values. Most iterations should be
steerable from this alone; the image is for judgment calls (see §4).

The model rewrites the **whole program** each proposal — programs are small
(76–177 decisions on the corpus), and whole-text proposals keep the
byte-exact serializer as the single parser path. No patch-DSL to invent.

### 2.3 Program diff → patch operations

After a `commit`, the kernel diffs the accepted draft against the baseline
document and emits `CanvasAgentPatchOperation[]`:

- moved/resized object → `updateObject {geometry}`
- new number in the program → `addObject` (real canvas id minted via
  `draftPlacedObject`; the program's number was session identity only)
- new arrow → `addConnection`
- section growth from `growSections` → `updateObject` on the section
  (geometry only — membership stays derived, see below)

Two deliberate restrictions, following the section-membership precedent:

- **Never emit `parentId`.** Geometry is written; the reducer's
  `reconcileSectionMembership` choke point derives membership. The prototype
  mapper already did this correctly.
- **Never emit waypoints.** The kernel's corridor router is the *preview*
  approximation; the product's live router owns real connector paths.
  Connectors whose endpoints moved get their waypoints cleared so the live
  router re-routes. (Fidelity gap acknowledged: preview elbows and product
  elbows can differ. R9 constants came from the corpus, so divergence should
  be small; revisit if it isn't.)

**Deletion (D1 — decided 2026-07-20).** Omission is deletion: a number
missing from a proposed program removes that object, its neighbors flow into
the freed space, and the delta report + preview surface the removal loudly
("2 objects deleted") so accidents are caught at review. This needs new
`removeObject`/`removeConnection` patch ops in the union. When a deletion or
push leaves the board messy, the loop runs a **cleanup pass** — the agent
reviews the post-change render and issues a follow-up proposal to repair
spacing, alignment, and routing before commit.

### 2.4 Applying — one atomic save, and why not `PUT`

The obvious server-side route — mutate JSON, `PUT /api/canvases/:id` — is
wrong while an editor is open: the editor is uncontrolled (the document prop
only seeds state), so it would neither see the change nor stop its own 800ms
debounced autosave from clobbering it. Last-writer-wins, no `If-Match`.

**Recommended apply path: through the editor.**

1. New reducer action `canvas.applyAgentPatch { operations, summary }` in
   `packages/canvas` — maps the patch ops onto existing handlers, wrapped in
   **one** `withHistory` entry, stamped `source: "agent"`.
2. `InteractiveCanvasEditor` exposes a narrow imperative handle (or prop) to
   dispatch it — today its only channels are the initial `document` prop and
   `onDocumentChange`.
3. Studio receives the committed proposal over the session API and dispatches.

Everything downstream is then free and correct: a single undo step (⌘Z
reverts the whole agent edit), waypoint + section-membership reconciliation,
the already-built agent-change halo (`lastChange.source === "agent"` →
`changedObjectIds` — currently dead code because nothing ever produces
`"agent"`), and autosave persisting the result through the normal path.

Headless mode (no editor open — CLI, batch, future automation) may use a
server-side apply that runs the same patch applier + reconcile functions and
writes with a hash precondition. Same kernel, second entrance; not v1.

### 2.5 Concurrency: rebase = refit

If the user keeps editing while a session is open, the draft goes stale. The
derived-program architecture makes this cheap: on accept (and optionally per
iteration), compare `baselineHash` to the live document; if changed, **refit
the scope from the live document and re-solve the accepted program against
it**. Deterministic, milliseconds. If a scope object was itself hand-moved or
deleted mid-session, stop and tell the user instead of silently merging.
No locks, no freeze on the editor.

One real bug to note independently: the disk write in `canvas-file-api.ts` is
a bare `fs.writeFile` — no temp-file+rename. Worth fixing while we are in
this file (docs-server's applier already does atomic persist).

---

## 3. Scoped editing UX

### 3.1 The scope model

Three rings, mechanically distinct:

- **Ring 0 — the selection.** Fitted into the program; the agent may
  rearrange freely. Fit runs on a sub-document (selected objects + arrows
  among them), solving into the selection's bounding frame instead of a
  default canvas. If the user selects a whole section, the section is in
  scope and its trim/growth rules apply.
- **Ring 1 — the boundary.** Arrows with one endpoint outside, near
  neighbors, and the frame itself. The grammar already supports this with no
  new syntax: **JSON-quoted raw-id references** put outside endpoints in the
  `arrows` block without putting the objects in the tree. The legend
  describes each quoted id (type, text, which side of the frame it sits on)
  so the agent routes toward reality.
- **Ring 2 — coupled outsiders.** Objects outside the scope that share a
  fitted tier/fan with inside members. v1 rule: **outside members are pinned
  constraints, never movables** — their register is where the tier lives;
  inside members solve onto it. The agent cannot move anything it did not
  select, with one exception below.

**Making room (D2 — decided 2026-07-20).** Solve at natural size; on
overflow, the kernel pushes neighbors: a deterministic single-axis minimal
displacement of outside content (the same push discipline as
`separateOverlaps`/`growSections`, snapped to the ladder), reported as a
distinct "moved to make room" set. The agent never chooses who moves. If the
push wrecks the surroundings, the same **cleanup pass** as D1 applies — the
agent reviews the render and repairs before commit, and a cleanup can also be
invoked standalone on any area.

### 3.2 Invocation, progress, review

**Invoke.** With a selection active: a selection-toolbar entry (respecting
the usage-ordered toolbar design) plus a hotkey. A popover takes the
instruction; scope chips show what's in Ring 0 and how many boundary arrows
exist. **Annotations:** the schema's `agent-request` annotation intent
(already validated, currently unused) is the point-at-things channel — drop a
marker on an object/region, type an instruction fragment; any `agent-request`
annotations inside the scope are gathered into the prompt and consumed
(cleared) on accept. v1 treats them as input only.

**Progress.** The session API streams (SSE): fitted → proposal n → lint/delta
summary → reviewing render → proposal n+1… Each accepted-so-far draft renders
on the canvas as a **ghost preview layer** — the browser stays a read-only
camera; nothing is dispatched, nothing autosaves, per the no-clicking rule.

**Preview vocabulary — what moved vs stayed.** Three visual classes:
unchanged (dimmed slightly), **rearranged** (Ring 0 movers: ghost outline at
the old spot, solid at the new, agent-halo tint), **displaced** (Ring 1/2
make-room movers: a distinct cooler tint — the user should instantly see
collateral motion). New objects get a "new" badge. A side panel lists the
delta in plain language ("moved 3, created 2, made room by shifting 4 objects
96px east").

**Accept / refine / reject.** Accept = the single atomic apply of §2.4 —
halo pulse, one undo step, done. Refine = a follow-up instruction into the
same session (the draft and conversation persist). Reject = session discarded,
board untouched.

---

## 4. Rendering for the agent (the camera)

**Not the HTTP endpoint.** `/preview.svg` reads only saved files; drafts must
never touch disk. The kernel calls `renderDocumentToSvg` (pure, Node-safe,
deterministic, already faithful: real shape outlines, routed connectors, icon
glyphs, section trim) **in-process on the draft document**. One renderer
extension needed: an arbitrary-rect crop (today: whole board or
`sectionId`) so the camera can frame "scope + one gutter of context."

**Raster (open decision D3).** Models consume PNG, not SVG-as-image. There is
no server-side rasterizer in the repo. Recommendation: add
**`@resvg/resvg-js`** (pure native Node, no headless browser) with the Inter
font files bundled, giving byte-stable PNGs of the already-deterministic SVG.
Alternative: skip raster in v1 and feed the model the SVG *as text* — genuinely
workable for structure checks but weak for visual judgment (overlap
salience, balance), and boards are large. resvg is a small dependency for a
large capability; I recommend taking it.

**Fidelity per iteration.** Cheap-first: every proposal gets the free text
channels (delta report, lint, occupancy ASCII); the agent is prompted to
request `render_draft` when it is about to commit or when the lint is clean
but judgment is needed. Known renderer gaps that are fine for this purpose:
char-width-heuristic text wrapping (not real font metrics), no markdown in
stickies, a few flowchart silhouettes fall back to rounded rects. None affect
layout judgment. Default camera: scope rect + 128px context ring at ~1400px
wide; `inspect`/crop for close-ups.

---

## 5. Docs migration

Target: the real docs system (`docs/` as id-keyed `doc.json` block trees,
14-block vocabulary, viewer via `make canvas` on :4801). No arbitrary React
blocks exist, but the `canvas` embed block (34 already in use, `.canvas.json`
sidecars) and `mermaid` cover most of the interactive content honestly.

Placement (D4 — decided 2026-07-20): a new numbered section framed as the
agent-implementation home, keeping the approved structure pass intact:
**`docs/30-agent-layout/`**, with the kernel architecture (this document's
§1–§4) migrating in as its own sub-doc alongside the language material.

- `00-overview` — how it works: the FlowView sequence diagram becomes a
  `mermaid` sequence diagram (the one clean 1:1 upgrade); the settled
  architecture prose; pointer to layout-lab as the live playground.
- `10-language` — LANGUAGE.md content as blocks: prose → paragraphs/callouts,
  field tables → `structured-table`, programs → `code` blocks (generic
  highlighting; the custom tokenizer stays a lab luxury), each worked program
  **pre-solved through the real pipeline into a `.canvas.json` sidecar and
  embedded as a live `canvas` block** — pan/zoom/selectable, matching the 34
  existing embeds. Loses live re-solve-on-edit; keeps everything else.
- `20-rulebook` — R1–R10 with corpus evidence; each rule's mini-scene either
  pre-rendered to an `image` block or, where a rule demo is expressible as a
  board, a pre-solved canvas embed. Before/after toggles become before and
  after side by side.
- `30-worked-example` — the 7-step stepper flattened to seven step headings,
  each with its pre-solved canvas embed and the step's move/pin notes as
  prose.

Rules with provenance: block spans carry inline `reference` marks to
`packages/layout` symbols and the rulebook constants, matching the existing
backlinks convention; rebuild with `bun run docs backlinks rescan`.

What does **not** migrate: R11–R22 candidates (unreviewed — they stay in the
lab until promoted), the live DSL editor, the metrics panel. The lab remains
the interactive playground and the docs link to it. If we later want true
live-solving demos in docs, that is a new `docs-viewer` block type hosting
`packages/layout` — deliberately out of scope now.

Sidecars are generated by a small script (DSL → parse → expand → route →
document) so they can be regenerated whenever the solver changes — never
hand-edited.

---

## 6. Gaps and hazards found during the survey

- **`CanvasAgentPatchOperation` has no consumer in `packages/canvas`** — the
  type exists, the halo exists, nothing produces or applies them. §2.4 is
  that missing consumer.
- **The only existing patch applier speaks a stale schema.** docs-server's
  `canvas_apply_patch` runs against a vendored fork
  (`tools/docs-framework/external/canvas`) with pre-P1 ops
  (`fitContainerToChildren`, `label`/`tone`). The kernel must not build on
  it; the fork needs a refresh eventually regardless (tracked, not v1).
- **Non-atomic saves** in `canvas-file-api.ts` (bare `writeFile`) — fix
  opportunistically.
- **No delete/reparent/waypoint story in the patch union** — v1 sidesteps all
  three by design (D1, derived membership, cleared waypoints).
- **Port note:** studio dev is :3999, not :4000.

---

## 7. Phasing

1. **Graduate the pipeline** — `packages/layout`; layout-lab imports it;
   round-trip + no-crossing dev assertions become package tests. Scoped fit
   (sub-document, frame, boundary quoted-ids) and program-diff→patch-ops land
   here.
2. **The apply path** — `canvas.applyAgentPatch` (one history entry,
   `source:"agent"`), editor dispatch handle, halo goes live.
3. **The layout harness** — an Agent Kernel harness wiring the tools of
   §2.2; session endpoints + SSE fronted via the shared handler; renderer
   crop; resvg (per D3); editor-state context feed (selection, viewport,
   annotations).
4. **Invoke/review UX** — toolbar entry, popover, ghost preview with the
   three-class vocabulary, accept/refine/reject.
5. **Annotations + make-room** — `agent-request` gathering; the D2
   displacement pass with its distinct preview tint.
6. **Intent persistence** — grids/aligns/fans/hugs saved into the document
   next to geometry with a reconcile pass (the section-membership pattern:
   derived, validated, choke-pointed). Design doc first; separate sign-off.

Docs migration (§5) is independent of all of the above except step 1's
package, and can run in parallel.

---

## 8. Decisions (settled 2026-07-20)

| # | Question | Decision |
|---|---|---|
| D1 | Program omits a fitted object | **Omission = deletion**; neighbors flow in; loud delta/preview surfacing; cleanup pass if the result is messy |
| D2 | Scope overflow | **Push neighbors** — deterministic single-axis kernel displacement; cleanup pass when the push degrades surroundings |
| D3 | Agent camera raster | Add `@resvg/resvg-js` + bundled Inter (unchallenged recommendation) |
| D4 | Docs placement | New **`docs/30-agent-layout/`** section — the agent-implementation home; kernel architecture doc migrates into it |
| D5 | LLM loop host | **An Agent Kernel harness** — built on `Codecaine/agent-kernel` (`@agent-kernel/kernel`, Pi Agent SDK underneath). The harness owns the layout tools, session semantics, and editor-state context; the kernel owns spawning, context assembly, and trace observability. Exact process topology (inside studio's server vs. a sibling bun service the studio talks to) is settled when the harness is set up, against agent-kernel's harness-adapter docs |

Additional direction: the kernel session must be fed **editor state as
context** — the current selection, viewport, and annotations — not just the
document, so the agent operates with awareness of what the user is looking at
and pointing to. Sequencing: docs migration first, then the kernel package;
the whole point of landing this in the real system now is to start testing
the loop against real boards.
