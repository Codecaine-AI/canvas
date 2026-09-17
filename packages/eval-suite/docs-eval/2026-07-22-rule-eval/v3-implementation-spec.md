# v3 board-editor — implementation spec

Implements §5 of `process-proposal.md`: the agent authors document ops directly (full channel
access), the solver becomes a selection-scoped tool, lint is advisory during editing and a hard
gate at commit, the loop is render-first, and an exemplar render is shown at session start.
Evolves the existing `layout-editor` agent in place — no second agent mode.

Grounding (file:line refs from 2026-07-22 recon; verify before editing):
- Op vocabulary: `packages/canvas/src/state/actions/types.ts:76-115` (`CanvasAgentPatchOperation`)
- Reducer applier: `packages/canvas/src/state/actions/agent-patch.ts` (`applyOperation` :47-182)
- Studio op bridge: `packages/studio/src/agent/use-agent-session.ts:346-390` (`toCanvasOperation`)
- Wire mirror: `packages/canvas-agent/src/protocol.ts:67-76`
- Session store (runtime impl): `packages/canvas-agent/src/harness/session-store.ts`
  (`LayoutSession` :93-123, `buildDraft` :686-801, propose :839-890, commit :955-982,
  accept :443-514, `wreckedLayoutError` :199-283, `editorSnapshot` :583-598)
- Tools: `packages/canvas-agent/src/harness/agent-catalog/layout-editor/tools.ts`
  (`toToolResult` :23-38 already emits image blocks when a result has `png`)
- Prompt: `agent-catalog/layout-editor/prompt.json` (+ regenerate `prompt.rendered.md` via
  `bun run scripts/render-prompts-to-json.ts`); manifest `agent.json` (maxTurns 40)
- Lint: `packages/canvas-agent/src/pipeline/lint.ts` (`lintDraft` :212-229)
- Doc diff precedent: `packages/canvas-agent/src/pipeline/diff.ts` (`diffPrograms` :180-362)
- Renderer: `renderDocumentToSvg` (packages/canvas/src/render/static-svg.ts, relative import)
  + `rasterizeSvgToPng` (harness/render.ts)
- Object model: objects.ts:18-72, connections.ts:28-49, colors.ts (10-color roster),
  object-defaults.ts:48-89, object-types.ts (30 types; NO standalone "text" type)

## A. Canvas package: `updateConnection` op (new)

1. `types.ts`: add
   `{ type: "updateConnection"; connectionId: string; patch: Partial<Omit<InteractiveCanvasConnection, "id">> }`.
2. `agent-patch.ts` `applyOperation`: merge patch onto the connection; STRIP `waypoints` from the
   patch (live router owns paths, same policy as parentId stripping for objects). Unknown id →
   silently skipped (matches existing behavior).
3. `use-agent-session.ts` `toCanvasOperation`: map the wire form.
4. `protocol.ts`: add the loose mirror variant.

## B. Harness: `apply_ops` tool (new)

`apply_ops(ops: AgentPatchOperation[])` → mutates `session.draft` directly.

- Validation (reject the whole batch with itemized errors, applying nothing): unknown op kind;
  update/remove id not in draft; `addObject` with invalid `type` (must be a member of
  `InteractiveCanvasObjectType`), non-finite geometry, or color outside the roster; connection
  endpoints referencing unknown objects. Everything else applies.
- After applying: re-derive `parentId` for added/moved objects (reuse the canvas package's
  geometry-containment choke point if importable; else deepest section whose rect contains the
  object center). Then run `lintDraft` (advisory) and the doc-level gate check (§E) in WARNING
  mode. Result text: per-op summary, lint report, gate warnings. Never hard-fail on
  lint/gate here — freedom while editing, gate at commit.
- Mark the solver state stale: `session.lastSketch = null` (accept/rebase must tolerate null, §F).
- Emit the same session event propose_program emits on a successful draft (drafted), so SSE/UI
  stay live. `proposalCount` semantics unchanged (counts proposals at commit, not edits — keep
  the existing meaning; if the field actually counts propose calls, leave it counting
  propose_program calls only).

## C. Harness: `solve_layout` tool (new)

`solve_layout({ objectIds: string[], program?: string })` — selection-scoped solver.

- Mode A (no `program`): fit the given draft objects (fitScope machinery pointed at
  `session.draft`, explicit ids) and return program + legend text for that selection.
- Mode B (`program` given): parse; expand within the selection's current bounding box (plus
  padding), world-translate, and apply ONLY solved geometry to those objects — all other channels
  (text/color/style/connections) keep their current draft values. Arrow statements in the program
  are accepted but ignored with a note ("connections are edited via apply_ops"). Absent ids are
  NOT deleted in this tool (unlike propose_program) — solve_layout never removes objects; it
  reports ids it didn't place instead.
- Advisory lint + gate warnings in the result, same as apply_ops. Also sets `lastSketch = null`.

## D. Harness: propose_program channel preservation

`buildDraft` currently sources object properties from `baseline`; change the property source to
the CURRENT DRAFT (geometry from solver; text/color/style/etc. from `session.draft`) so a
whole-scope re-solve no longer wipes channel edits made via apply_ops. Baseline remains the
source only for objects absent from the draft (shouldn't happen in practice).

## E. Gate + lint retune

1. New `wreckedDocumentError(draft)` (doc-level, sketch-free), checked at COMMIT always (keep the
   existing sketch-based gate too when `lastSketch` is fresh):
   - every section contains its `parentId` children's bounds (reuse MINIMUM_SECTION_DIMENSIONS
     for section minimums);
   - non-section, non-annotation object minimums: floor 32×24;
   - sibling overlap: two non-section objects whose intersection area exceeds 25% of the smaller
     one → error (annotation/sticky types exempt — margin notes may overlap frames);
   - locked page-frame overflow: any object extending >16px past a `locked: "background"`
     section → error.
   Commit blocked with the itemized message; the same function in WARNING mode feeds
   apply_ops/solve_layout results.
2. `lintDraft`: add an `OverlapViolation` finding (same rule as above but any intersection >0
   reported, with area %); prefer the locked background section rect as the overflow `frame`
   when present (falls back to scope frame). Keep ladder/off-grid findings as-is (advisory by
   consumption, not by removal).

## F. Accept path with null sketch

`accept` (:443-514): when `lastSketch === null` (ops-authored draft):
- baseline file unchanged → return `diffDocuments(baseline, draft)` ops (§G), `rebased: false`;
- file changed but no scope object moved/resized/deleted (existing check) → same ops,
  `rebased: true` (they're id-addressed patches; safe);
- else → existing 409.

## G. New differ: `pipeline/doc-diff.ts`

`diffDocuments(baseline, draft)` → `AgentPatchOperation[]`:
- objects: added → `addObject` (full object); removed → `removeObject`; changed → `updateObject`
  with a minimal patch of changed fields among {geometry, text, color, style, direction, icon,
  author, layout, locked} — never `parentId` (reducer re-derives), never emit no-op patches;
- connections: added/removed → add/removeConnection; changed (label/style/color/arrow/from/to/
  role) → `updateConnection` minimal patch — never `waypoints`;
- annotations: add/remove (no update op exists — remove+add on change);
- ordering: addObject → updateObject → updateConnection → removeConnection → removeObject →
  addConnection (mirrors diff.ts:342-349 precedent).
Commit builds `proposal.operations` via `diffDocuments` whenever `lastSketch === null`;
otherwise the existing `diffPrograms` path stays (keeps current tests green). Lint report at
commit comes from `lintDraft(draft, frame)` directly in the doc path.

## H. Exemplar in context

On the FIRST `fit_scope` call of a session, append to the result an image block (extend the
fitScope result type with optional `png` — `toToolResult` already forwards it) containing a
rasterized render of `canvases/gc-decomp-harness.canvas.json` (renderDocumentToSvg fit:"content",
rasterize at ~1400px wide), captioned in the result text: "Reference board (house style): note
section tinting, labeled edges, dashed vs solid flows, margin annotations. Aim for this level of
finish." Constant `EXEMPLAR_CANVAS_ID = "gc-decomp-harness"`; cache the PNG per store; skip
silently if the file is missing.

## I. Prompt + manifest

Rewrite `prompt.json` (then regenerate `prompt.rendered.md`):
- **purpose**: full board editor — geometry, text, colors, connector labels/styles, stickies and
  annotations are all in scope. Scope discipline stays (only scoped objects + objects you create;
  quoted outside ids untouchable). Drop "You never edit text or colors" entirely.
- **channels**: the 10-color roster (gray/red/orange/yellow/green/teal/blue/violet/pink/white),
  connector `style` solid|dashed + `label` + `color`, object types incl. sticky (with the note
  that there is no standalone text type — use sticky/annotation for notes), size via geometry.
- **working loop (render-first)**: fit_scope (includes the reference board) → block in structure
  (propose_program or solve_layout for fans/grids/lanes/alignment — the solver is a tool, not
  the only way) → **render immediately** → fine-tune with apply_ops (move/resize/recolor/label
  edges/add notes) → render after every geometry-changing round → commit only from a render you
  have seen; name any remaining flaw in the commit summary. Partial fulfillment over abandon;
  abandon states the missing operation.
- **rules**: ladder/grid/registers are strong defaults the solver gives you — keep them unless
  the instruction demands otherwise; never let boxes overlap or children escape their section
  (the commit gate enforces this); route/keep connectors clear of boxes; respect reading order.
- keep the `layoutEditorContext` contextUsage block unchanged.
- `agent.json`: `maxTurns` 40 → 60 (ops loop needs more, cheaper turns).
- Tool descriptions (tools.ts): apply_ops (op cheat-sheet with one-line example per kind, the
  connection endpoint shape, the color roster); solve_layout (both modes); render_draft ("after
  every geometry change, starting with the first solve"); propose_program (add: "whole-scope
  re-solve; prefer solve_layout for a subset; omission deletes — verify every legend number");
  commit ("summary must name any flaw you saw and shipped"); abandon ("only when nothing useful
  can be proposed; say what op you lacked; prefer partial fulfillment").

## J. Tests (extend `packages/canvas-agent/test/`, keep all 129 green)

- doc-diff: object add/remove/patch minimality; connection updateConnection; ordering; no
  parentId/waypoints emission; no-op → empty.
- apply_ops: batch validation atomicity; channel edits land in draft; parentId re-derivation;
  lastSketch nulled; lint/gate warnings present.
- solve_layout: mode A program echo for a selection; mode B applies geometry only, preserves
  colors/labels, never deletes.
- commit gate: overlap >25%, child-escapes-section, locked-frame overflow each block commit
  (doc path); warning mode doesn't block apply_ops.
- accept with null sketch: unchanged file → diffDocuments ops; moved-scope live file → 409.
- updateConnection reducer test (packages/canvas — add alongside agent-patch tests if a suite
  exists there; if the canvas package suite is the known-red one, put reducer coverage in
  canvas-agent tests importing the reducer instead).
- exemplar: first fit_scope carries png, second doesn't.

## Out of scope (explicitly)

Router work (lane-crossing corridors, self-loops), DSL grammar extensions (superseded), studio
UI changes beyond `toCanvasOperation`, harness reliability fixes, per-genre exemplar config.
Do not commit to git. Do not restart the running harness (the orchestrator restarts it for the
trial). `packages/canvas/src` suite is pre-existing red (fixture-path errors) — do not chase;
gate on `bun test packages/canvas-agent/test` (129 pass baseline) plus your new tests.
