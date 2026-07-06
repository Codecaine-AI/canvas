# src/ Restructure — Target Shape & Migration Plan

Agreed 2026-07-06 (Ford + Claude). This doc is the contract for the incremental
restructure of the canvas engine source. Read it before moving any file.

## Why

Four files absorb every feature (sizes at time of writing):
`editor/InteractiveCanvasEditor.tsx` (2,235), `render/CanvasStage.tsx` (1,916),
`interaction/interaction.ts` (1,507), `model/actions.ts` (1,409). A feature like
sections smears across 21 files. Two distinct causes, two distinct fixes:

1. **Per-type boilerplate smear** — adding a shape touches the schema union,
   `defaultGeometryFor`/`toneForType`/`shapeForType`/`objectTypeLabel`, the
   12-branch dispatch in `ObjectShape`, the embedded per-shape CSS block, and
   `chrome/shape-catalog.tsx`. Fix: **object/shape registry** (vertical slice
   at the leaf level).
2. **Feature smear in the editor** — label editors, context menu, toolbar
   flyouts, drag pipeline, inspector all share one 2,235-line closure. Fix:
   **feature modules inside `editor/`**.

What we deliberately do NOT do: full per-feature vertical slices that own
schema fragments + reducer cases + gesture fragments. Three shared machines
resist it and are correct as-is:
- the reducer's cross-feature invariants (`withHistory` undo grouping,
  `reconcileConnectionWaypoints` choke point, cascade deletes);
- the gesture router (`pressing` state decides what a press becomes);
- the single validated document schema (frozen public surface, 13+ external
  importers of `@codecaine-ai/canvas/schema`).

Behavioral features (section, container, connector, text-edit) keep their
logic in the shared machines behind **typed extension points declared on their
defs** (see `dragCapture`, `hitTest`, `handles` below).

## The two-tier registry (`src/objects/`)

**Tier 1 — `ObjectDef`: behavior contract.** One per kind of thing that
*behaves* differently. Specials are first-class: `section/`, `sticky/`,
`connector/` (keyed by selection kind — connections aren't objects),
`container/`, `text/`, `code-block/`.

```ts
interface ObjectDef {
  kind: string
  render: Component
  toolbar: ToolbarSpec        // its context menu: action ids + flyout components
  handles: "all" | "corners" | "none"
  hitTest: "solid" | "border-band"
  dragCapture: "geometric-overlap" | "descendants" | "none"
  labelEditing: LabelSpec     // label vs section title-chip vs body
  defaults: { geometry, tone?, ... }
}
```

**Tier 2 — `ShapeDef`: variant data.** One file per shape (~40 files, incl.
the W5 set), each tiny:

```ts
interface ShapeDef {
  type: InteractiveCanvasObjectType
  outline: OutlineSpec        // CSS class, SVG silhouette, or polygon fn
  text: TextZone              // centered | below-icon | none
  anchors?: AnchorSpec        // omit = bbox compass points (current behavior)
  defaultSize: { w, h }
  catalog: { label, icon, keywords }
}
```

`objects/shapes/base.ts` adapts any ShapeDef into an ObjectDef carrying the
ONE shared shape behavior (standard shape toolbar, 8 handles, solid hit-test,
standard label editing). Per-shape files never mention toolbars.

Multi-select toolbar = capability intersection over the selected defs
(replaces the hard-coded `multi` variant; verify resulting button sets against
current behavior case by case).

Facts to preserve, now expressed as def properties instead of inline
`type ===` checks:
- Section membership is geometric and ephemeral (`sectionCaptureMembers`,
  ≥60% overlap at drag start, recursive) — never persisted. `parentId`
  hierarchy belongs to containers only. Section: `dragCapture:
  "geometric-overlap"`; container: `dragCapture: "descendants"`.
- Containers hit-test on a 16px border band; interiors pass through.
- Sections get corner-only handles; locked sections refuse resize/drag.

## Target tree

```
src/
  model/
    schema.ts            barrel (exports target — path frozen) over schema/
    schema/              object-types, style, connections, annotations, document, validate
    actions.ts           barrel (frozen) over actions/
    actions/             reducer (thin switch), objects, geometry-ops, connections,
                         annotations, history, defaults
    geometry.ts          + absorbs SECTION_CAPTURE_OVERLAP_THRESHOLD (fixes
                         interaction→render leak; keep re-export in figjam-tokens)
  objects/
    object-def.ts        contract + registry + capability-intersection
    section/  sticky/  connector/  container/  text/  code-block/
    shapes/
      shape-def.ts  base.ts
      rectangle.tsx  ellipse.tsx  diamond.tsx  ... (one file per shape)
  interaction/
    interaction.ts       barrel (frozen)
    core.ts              state union, stepInteraction, press-pending router
    gestures/            move, resize, marquee, place, connectors
    hit-testing.ts  snapping.ts  clipboard.ts  edge-pan.ts  frame-coalescer.ts
  routing/               unchanged (vendor boundary untouched)
  render/
    CanvasStage.tsx      thin: layer ordering, grid, event plumbing
    ObjectShape.tsx      registry-driven, no type branches
    connectors/          Connector, LabelChip, DragPreview
    overlays/            SelectionBox, Marquee, guides, spacing
    figjam-tokens.ts  theme.ts
  editor/
    InteractiveCanvasEditor.tsx   composition root (~200 lines)
    features/            label-editing/  context-menu/  context-toolbar/
                         drag-pipeline/  inspector/  top-bar/
  chrome/                ContextToolbar becomes a dumb host; the action/flyout
                         tables migrate into objects/ defs. Update stale README
                         (chrome is wired into the editor since W3).
  ui/  vendor/  fixtures/  unchanged
```

`ViewportState` moves out of `editor/` to a neutral module so interaction no
longer imports from editor.

## Invariants (hold at every step)

- Public specifiers AND their target paths stay stable: moved-from files
  become barrels. External importers (`/schema` ×13, `/actions`, `/geometry`,
  root editor import ×6) never notice.
- `bun test` from the canvas repo root stays green except the 2 known W5
  failures (snapshot the pass list first).
- MPL boundary: only `routing/` and `interaction/snapping.ts` import
  `vendor/blocksuite`; vendor imports nothing from src. No code crosses it.
- Each step is one reviewable commit; pure moves separated from behavior
  changes.

## Migration order

0. Baseline: record test pass list; commit or land in-flight W5 work first
   (it currently touches every src directory — see Sequencing).
1. Editor split → `editor/features/` (six extractions, one commit each).
2. Interaction split → `core.ts` + `gestures/`; move capture threshold to
   model/geometry; relocate `ViewportState`.
3. Render split → `connectors/`, `overlays/`, `ObjectShape.tsx` (pure moves).
4. Registry: introduce `objects/` contracts + `shapes/base.ts`; convert
   shape-by-shape (className chain, render branches, per-shape CSS into defs).
5. Toolbar migration: `CONTEXT_TOOLBAR_REGISTRY` + editor flyout JSX into
   defs; chrome `ContextToolbar` becomes a host; multi = intersection.
6. Model split (LAST, after W5 merges — schema/actions are W5's hottest
   files): barrels over `schema/` + `actions/`; default lookups delegate to
   the registry.
7. Cleanup: chrome README, import-boundary check (no `../editor` inside
   interaction/, no cross-vendor imports).

## Sequencing vs. W5

The W5 shape-set work has uncommitted changes across all src directories.
Restructure starts from a tree that INCLUDES W5 (committed), so file moves
carry W5 content and W5 never has to merge across renames. Steps 1–3 can
proceed while W5 stabilizes only if W5's remaining churn is confined to
shapes/model; step 6 strictly waits for W5.
