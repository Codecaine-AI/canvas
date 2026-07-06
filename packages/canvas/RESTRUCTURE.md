# src/ Restructure — Target Shape & Migration Plan

Agreed 2026-07-06 (Ford + Claude). This doc is the contract for the incremental
restructure of the canvas engine source. Read it before moving any file.

## Why

Four files absorb every feature (sizes at time of writing):
`editor/InteractiveCanvasEditor.tsx` (2,235), `render/CanvasStage.tsx` (1,916),
`interaction/interaction.ts` (1,507), `state/actions.ts` (1,409). A feature like
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

Amended 2026-07-06 (Ford + Claude), after the registry/toolbar migration
landed: layers are named by their role in the pipeline, design tokens get
their own foundation layer, "chrome" is dissolved into `editor/components`
(what shows up on the page) + `ui` (shared dumb primitives), and objects/
absorbs the icon glyphs and the shape catalog. NO compatibility barrels:
package.json subpath exports are repointed where a consumer exists and
deleted where none does (./chrome had no real external consumer).

```
src/
  theme/                 LAYER 0 — design constants; imports nothing
                         (renamed from tokens/, de-FigJam-ified 2026-07-06)
    tokens.ts              design constants: colors, text sizes, geometry ratios
    resolve.ts             style resolution: tone/palette → fill/border/text
  state/                 LAYER 1 — the document (renamed from model/ 2026-07-06)
    schema.ts → schema/    what a canvas JSON is (path kept: exports target)
    actions.ts → actions/  reducer — the only way the document changes
    geometry.ts
  objects/               LAYER 2 — one def per kind of thing on the canvas
    object-def.ts          registry + render/behavior dispatch + intersection
    palette.ts
    section/  sticky/  text/  container/  connector/  code-block/  source-node/
    shapes/                one file per shape; base.tsx adapter; toolbar.tsx
      icon/                def + IconShapeBody (glyph data lives in ui/icons/)
    catalog/               SHAPE_CATALOG + ShapeSearchPopover (registry-driven)
  render/                LAYER 3a — document → pixels; stateless; shared by
    CanvasStage.tsx        the editor AND the read-only viewer/embeds
    ObjectShape.tsx        pure registry delegate
    viewport.ts            ViewportState + world/screen transforms (from editor/)
    connectors/  overlays/  grid.ts
  interaction/           LAYER 3b — pointer input → actions; pure TS, no React
    interaction.ts barrel; core.ts; gestures/; hit-testing; snapping; clipboard
  ui/                    shared dumb primitives, importable from objects up:
    button/input/… plus Tooltip, ColorPalettePopover
    icons/               ALL icon modules (amended 2026-07-06): toolbar-icons,
                         dock-icons, icon-glyphs, nucleo/ (reference SVGs)
  editor/                LAYER 4 — the app; nothing below imports it
    InteractiveCanvasEditor.tsx   composition root
    InteractiveCanvasViewer.tsx   read-only variant
    components/            what shows up on the page: TopBar, CanvasDock,
                           ShapesPanel, ZoomControls
    features/              the state + wiring behind them: selection-toolbar/
                           (the WHOLE selection-toolbar feature: pill view,
                           position math, state hook, flyout host — amended
                           2026-07-06), label-editing/, context-menu/,
                           drag-pipeline/, inspector/
  routing/  vendor/  fixtures/   unchanged (MPL boundary untouched)
```

Import rule (boundary-tested): theme ← state ← objects ← render|interaction
← editor; `ui` sits beside theme (importable from objects up); nothing
outside `editor/` imports `editor/`.

## Invariants (hold at every step)

- Public specifiers with REAL consumers stay importable: `.` (root),
  `/schema`, `/actions`, `/geometry`, `/ui/*`. Where a module moves, the
  package.json export is REPOINTED at the new path (no barrel files);
  consumer-less subpaths may be deleted (amended 2026-07-06 — backwards
  compatibility explicitly waived by Ford).
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
   state/geometry; relocate `ViewportState`.
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
shapes/state; step 6 strictly waits for W5.
