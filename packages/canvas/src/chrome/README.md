# FigJam chrome components (W2-chrome, standalone/unwired)

Built per `board-design-reference/analysis/figjam-bottom-dock-spec.md`,
`figjam-chrome-catalog.md`, `figjam-style-tokens.json`/`figjam-style-spec.md`.
Every component here is **standalone**: no imports from `CanvasStage.tsx`,
`InteractiveCanvasEditor.tsx`, `actions.ts`, or `interaction.ts`, and zero
edits to those files. Wave 3 (W3-wire) wires these into the live editor.

## Inventory

| File | Component | Purpose |
|---|---|---|
| `ChromeTooltip.tsx` | `ChromeTooltip` | Shared dark hover-label used by every other component below. |
| `dock-icons.tsx` | 13 icon components + 2 zoom glyphs | Inline SVG glyphs for the bottom dock and zoom pill. |
| `FigJamDock.tsx` | `FigJamDock` | White stadium bottom dock, 462x37, 13 buttons / 5 whitespace groups. |
| `toolbar-icons.tsx` | ~20 icon components | Glyphs for `ContextToolbar` controls. |
| `context-toolbar-position.ts` | `positionContextToolbar` | Pure clamp-to-viewport positioning function. |
| `ContextToolbar.tsx` | `ContextToolbar`, `CONTEXT_TOOLBAR_REGISTRY` | Dark floating pill, variant-driven control sets. |
| `ColorPalettePopover.tsx` | `ColorPalettePopover` | 2x11 swatch grid + rainbow-ring current-color swatch. |
| `shape-catalog.tsx` | data + icon glyphs | Shape catalog data consumed by the two components below. |
| `ShapeSearchPopover.tsx` | `ShapeSearchPopover` | Compact dark "search for a shape" popover (Panel A). |
| `ShapesPanel.tsx` | `ShapesPanel` | Full-height left-docked white Shapes sidebar (Panel B). |
| `ZoomControls.tsx` | `ZoomControls` | Bottom-right zoom pill. |

## Wiring notes for W3

### FigJamDock

- Render bottom-centered by the consumer; the component only sizes itself
  (`FIGJAM_DOCK_WIDTH_PX`/`HEIGHT_PX`/`RADIUS_PX` exported for layout math).
  Suggested wrapper: `position: absolute; left: 50%; bottom: 24px; transform:
  translateX(-50%);` inside the canvas viewport container.
- `activeTool` is **nullable by design** (the dock spec's "modal
  relinquishing" rule — fj-053 onward, no dock button shows violet while the
  Shapes panel or another surface owns focus). W3's editor state must derive
  this prop from current interaction mode, not from "last tool used." Do not
  add sticky/last-selected tracking inside `FigJamDock` itself.
- `onSelectTool(tool)` fires for every button including `"shapes"`;
  `onOpenShapes()` fires *in addition* for that one button, since clicking it
  both (a) becomes the active tool in a simple mapping and (b) opens
  `ShapesPanel`. W3 can choose to keep both effects or treat `onOpenShapes`
  as the sole handler and ignore the `onSelectTool("shapes")` call — the
  component fires both so either integration shape works.
- `ToolId` union intentionally excludes `"overflow"` (handled by
  `onOpenOverflow`) since the "+" button is not a "tool" in the schema sense.

### ContextToolbar

- `variant` must be derived by W3 from the current selection: single shape
  object -> `"shape"`, `section` type -> `"section"`, connection -> `"connector"`,
  active text-edit (shape label, sticky body, or connector label) ->
  `"text"`, sticky -> `"sticky"`. `"multi"` is a flagged extrapolation (the
  source recording never captured a multi-select toolbar) — confirm against
  live FigJam before treating it as more than a placeholder.
- Position this component using `positionContextToolbar(selectionRect,
  { width: measuredWidth, height: 29 }, viewportSize)` — the toolbar's real
  width depends on which variant (and therefore how many controls) is
  rendered, so W3 should measure the rendered pill (e.g. via a ref +
  `getBoundingClientRect()`) rather than hardcoding a width.
- `onAction(actionId, value?)` is a single callback for the whole toolbar.
  Flyout controls (`hasFlyout: true` in the registry) currently only toggle
  local `aria-expanded` state and do NOT render their flyout contents (e.g.
  the alignment 3-icon popover, the line-style dropdown) — W3 should render
  the appropriate flyout (reusing `ColorPalettePopover` for any `"color"` /
  `"tint"` action, and building new small popovers for align/font-style/size/
  dash/routing/arrowhead as needed) anchored below the clicked control.
- The connector's "T" add-text-label control is exported separately as
  `CONNECTOR_ADD_LABEL_ICON` (from `ContextToolbar.tsx`) since the task
  brief's exact 6-control connector set (`color/stroke/dash/routing/
  arrowhead/label-align`) already reaches the catalog's measured count of 6
  without it — splice it in only if product testing shows FigJam's real
  connector toolbar needs a 7th control.

### ColorPalettePopover

- Anchor ~9px above the toolbar's color-swatch button
  (`COLOR_PALETTE_ANCHOR_GAP_PX` exported) using `@floating-ui/react`'s
  `useFloating`/`offset`/`flip`/`shift` — this component does not self-position.
- `currentColor` drives the rainbow-ringed final swatch; `onPick` fires the
  same for every swatch including that one (clicking "current color" is a
  no-op in practice but is wired for consistency).
- `figjam-tokens.ts`'s `PALETTE_POPOVER_SWATCHES` ships an 11+9 (not 11+11)
  split; this component pads row 2 to 10 direct swatches by repeating from
  the front of row 1 before appending the rainbow-current swatch, to hit the
  catalog's exact 2x11=22 layout without editing the shared tokens file. If
  a future tokens re-sample adds real, distinct row-2 colors, remove the
  padding logic in `ColorPalettePopover.tsx`.

### ShapeSearchPopover vs. ShapesPanel

- These are **two different surfaces**, per the catalog's explicit
  correction: `ShapeSearchPopover` (Panel A) anchors above a selected
  object's shape-swap control; `ShapesPanel` (Panel B) is invoked from the
  bottom dock's shape-tool button and docks to the left edge, full height.
  Do not conflate them or anchor both the same way.
- `shape-catalog.tsx` is intentionally a `.tsx` file (not `.ts` as the task
  brief names it) because its entries embed inline JSX icon factories —
  this requires the JSX-capable extension to compile. It remains pure data
  otherwise; no component state lives here.
- `ShapeCatalogObjectType` includes both today's schema.ts vocabulary
  (`container/process/decision/text/sticky/document/person/database/chat`)
  and the six new W2-model types coordinated with the parallel schema
  worker: `section, pill, arrow-shape, predefined-process, code-block,
  chip-icon`. `EXISTING_SCHEMA_OBJECT_TYPES` is the single toggle: once the
  parallel worker's schema.ts lands those six types, update that set (or
  derive it from schema.ts directly, e.g. via a shared const) and every
  currently-disabled "coming soon" entry in both popovers will light up
  automatically — no other changes needed in either component.
- The "Other libraries" (AWS/Azure/Cisco) footer rows in `ShapesPanel` are
  intentionally static/non-interactive (`aria-disabled="true"`, no onClick)
  per the task brief's "skip AWS/Azure/Cisco libraries" instruction — they
  exist only for visual parity with the reference frames.

### ZoomControls

- The source recording shows only "-"/"+"" with no percentage readout ever
  visible (figjam-chrome-catalog.md section 8, figjam-bottom-dock-spec.md).
  This component supports an optional `zoomPercent` prop for a "%" readout
  since the task brief asked for one, but W3 can omit the prop entirely for
  strict frame-parity, or wire it to the canvas viewport's current zoom
  otherwise.
- Suggested wrapper position: `position: absolute; right: 24px; bottom:
  24px;` — independent of `FigJamDock`'s centering.

## Test coverage

Each component/module has a focused jsdom test file under `__tests__/`
asserting measured geometry (stadium radius, bg colors, button/control
counts, group/divider structure) as style/DOM assertions rather than visual
screenshots (per the task's "no routes" constraint). Run:

```
bun test src/lib/interactive-canvas/chrome
```
