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

Behavioral features (section, connector, text-edit) keep their
logic in the shared machines behind **typed extension points declared on their
defs** (see `dragCapture`, `hitTest`, `handles` below).

## The two-tier registry (`src/objects/`)

**Tier 1 — `ObjectDef`: behavior contract.** One per kind of thing that
*behaves* differently. Specials are first-class: `section/`, `sticky/`,
`connector/` (keyed by selection kind — connections aren't objects),
`text/`, `code-block/`.

```ts
interface ObjectDef {
  kind: string
  render: Component
  toolbar: ToolbarSpec        // DATA-ONLY control list; flyout JSX lives in
                              // editor/features/selection-toolbar/flyouts/
                              // (keyed by def kind + action id)
  handles: "all" | "corners" | "none"
  hitTest: "solid"              // border-band died with the container type
  dragCapture: "descendants" | "none"
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
`type ===` checks (first two amended 2026-07-07 — the W6 container removal
deliberately reversed them):
- Section membership is a persisted, auto-managed `parentId` — assigned when
  an object is dropped into a section, cleared when it is dropped onto open
  canvas. Sections are the ONLY legal parent (validated), nest via their own
  `parentId`, and drag their recorded descendants: `dragCapture:
  "descendants"`. Nested-section z-depth derives from the `parentId` chain.
  `sectionCaptureMembers` (≥60% overlap, recursive) survives only as the
  seed for `canvas.captureSectionContents`.
- The container type is gone — replaced by the dumb `rectangle` shape — and
  the 16px border-band hit-test went with it; every def hit-tests solid.
- Sections get corner-only handles; locked sections refuse resize/drag.

## Target tree

Amended 2026-07-07 (Ford + Claude), after the co-location alignment landed:
theme is ONE global file (semantic palette tokens, tone→color map, resolve*
functions, typography sizes — everything else co-locates with its consumer),
objects/ holds ONLY definitions and DATA (zero page-UI components), editor/
owns ALL interface JSX (toolbar flyouts, catalog previews, popovers), and
ui/ is app-agnostic primitives + INTERFACE icons only (the canvas glyph
registry lives with the icon def). NO compatibility barrels: package.json
subpath exports are repointed where a consumer exists and deleted where none
does.

```
src/
  theme.ts               LAYER 0 — ONE file; imports nothing (type-only
                         state/schema unions): semantic palette tokens
                         (CANVAS_PALETTE_TOKENS + paletteTokenStyle anchors),
                         tone→color map (canvasToneStyle), SECTION_FAMILIES
                         (resolveSectionColors' data), the resolve* functions,
                         canvasSurfaceStyle, SHAPE_STROKE_WIDTH_PX,
                         TEXT_SIZES_PX. Everything else lives by consumer.
  state/                 LAYER 1 — the document (renamed from model/ 2026-07-06)
    schema.ts → schema/    what a canvas JSON is (path kept: exports target)
    actions.ts → actions/  reducer — the only way the document changes
    geometry.ts            incl. SECTION_CAPTURE_OVERLAP_THRESHOLD (the theme
                           re-export is gone)
  routing/               connector routing (MPL boundary untouched); owns
                         CONNECTOR_ELBOW_CORNER_RADIUS_PX / CONNECTOR_END_GAP_PX
                         (routing.ts) and ARROW_SHAPE_GEOMETRY
                         (connection-overlay.ts; the arrow-shape def imports it
                         — objects→routing is a legal downward edge; routing
                         never imports objects)
  objects/               LAYER 2 — one def per kind; DEFINITIONS + DATA ONLY:
                         def render views (canvas content), per-kind geometry
                         constants, behavior flags, defaults, toolbar DATA
                         (control lists), catalog DATA. Zero page-UI components.
    object-def.ts          registry + render/behavior dispatch + intersection;
                           ToolbarSpec is data-only ({ controls })
    palette.ts
    catalog.ts             pure data entries (id, label, objectType,
                           direction?, icon?, keywords?) — previews editor-side
    section/  sticky/  text/  connector/  code-block/  source-node/
                           each owns its constants: SECTION_GEOMETRY (section/
                           def), STICKY_GEOMETRY + sticky/colors.ts,
                           CONNECTOR_COLORS/_DEFAULT_COLOR/_DASH_PATTERN_PX
                           (connector/def.ts), code-block/style.ts (CODE_BLOCK)
    shapes/                one file per shape under basic/ flowchart/ misc/,
                           each carrying its own geometry/color constants
                           (PREDEFINED_PROCESS_GEOMETRY shared: internal-storage
                           imports it from predefined-process); base.tsx
                           adapter; toolbar.ts (data-only control list);
                           pastels.ts (shared PASTEL_PAIRS)
      icon/                def + IconShapeBody + icon-glyphs.ts +
                           icon-glyph-data.generated.ts (canvas CONTENT —
                           tools/nucleo-icons/generate.ts emits here)
  render/                LAYER 3a — document → pixels; stateless; shared by
    CanvasStage.tsx        the editor AND the read-only viewer/embeds; owns its
                           surface constants (CANVAS_BG, grid dot color, canvas
                           font, arrowhead ratios, select cursor — inlined,
                           never imported from editor)
    ObjectShape.tsx        pure registry delegate
    viewport.ts            ViewportState + world/screen transforms (from editor/)
    connectors/  overlays/  grid.ts (owns the GRID_* constants)
  interaction/           LAYER 3b — pointer input → actions; pure TS, no React
    interaction.ts barrel; core.ts; gestures/; hit-testing; snapping; clipboard
  ui/                    app-agnostic primitives + INTERFACE icons ONLY;
    button/input/… Tooltip  imports nothing from the rest of src
    icons/               custom-icons, icon-props, manifest.json, nucleo/
                         (generated chrome components + vendored SVGs)
  editor/                LAYER 4 — the app; owns ALL interface JSX;
    InteractiveCanvasEditor.tsx   composition root
    InteractiveCanvasViewer.tsx   read-only variant
    components/            what shows up on the page: TopBar, CanvasDock,
                           ShapesPanel, ZoomControls, ShapeSearchPopover,
                           ColorPalettePopover, shape-previews.tsx (catalog
                           entry → preview SVG), editor-style.ts (EDITOR_STYLE,
                           né CHROME)
    features/              the state + wiring behind them: selection-toolbar/
                           (pill view, position math, state hook, flyout host,
                           and flyouts/ — the flyout components + the def-kind
                           × action-id registry deciding which actions open
                           flyouts), label-editing/, context-menu/,
                           drag-pipeline/, inspector/
  vendor/  fixtures/     unchanged (MPL boundary untouched)
```

Import rule (boundary-tested in src/__tests__/import-boundaries.test.ts):
theme.ts ← state ← routing ← objects ← render|interaction ← editor; `ui`
stands alone (only editor/ imports it; objects ↛ ui holds); routing never
imports objects; render never imports editor; nothing outside `editor/`
imports `editor/`. Documented exceptions: interaction/types.ts and
state/actions/types.ts type-only edges, and objects/code-block/def.tsx →
render/code-tokenizer (the one straggler).

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
