# Editor components (FigJam-parity page furniture)

Built per `board-design-reference/analysis/figjam-bottom-dock-spec.md`,
`figjam-chrome-catalog.md`, `figjam-style-tokens.json`/`figjam-style-spec.md`.
This directory holds what shows up on the page around the canvas — the
top bar, the bottom dock, the shapes panel, the zoom pill, the picker
popovers, the catalog preview SVGs, and the editor style constants. It
started as a standalone component library (W2-chrome, the old `src/chrome/`);
since W3 it **is** wired in: `editor/InteractiveCanvasEditor.tsx` composes
these components directly.

The floating selection toolbar is NOT here: the whole feature — pill view
(`SelectionToolbar.tsx`), positioning math (`position.ts`), state hook,
flyout host, and the flyout components themselves
(`flyouts/`) — lives together in `editor/features/selection-toolbar/`.

Per RESTRUCTURE.md's target tree (amended 2026-07-07, co-location
alignment): the editor owns ALL interface JSX. `objects/` holds only
definitions and DATA (def render views, per-kind constants, behavior flags,
toolbar control lists, catalog entries); `ui/` is app-agnostic primitives +
INTERFACE icons only.

## Inventory

| File | Component | Purpose |
|---|---|---|
| `CanvasDock.tsx` | `CanvasDock` | White stadium bottom dock, content-fit x 37, 7 buttons / 3 whitespace groups. |
| `ShapesPanel.tsx` | `ShapesPanel` | Full-height left-docked white Shapes sidebar (Panel B). |
| `ShapeSearchPopover.tsx` | `ShapeSearchPopover` | Compact dark "Search for a shape" popover (Panel A), opened by the shape-swap flyout. |
| `ColorPicker.tsx` | `ColorPicker` | THE one 10-pick color picker (P1, D12): the closed hue roster, identical previews for every kind, current-color ring, no custom color. |
| `shape-previews.tsx` | `shapeCatalogPreview()` | Maps `objects/catalog.ts` entries → 20x20 preview SVGs (polygon generators / hand-drawn minis / glyph data). |
| `editor-style.ts` | `EDITOR_STYLE` | Editor interface style constants (né theme/tokens' `CHROME`). |
| `TopBar.tsx` | `TopBar` | Top bar: board title (optionally inline-editable), undo/reset history controls, save/cancel, host-provided leading/action slots. |
| `ZoomControls.tsx` | `ZoomControls` | Bottom-right zoom pill. |

Shared primitives these components draw on live in `src/ui/`:
`ui/Tooltip.tsx` (dark hover-label used by every component above) and
`ui/icons/` — interface icons only: `custom-icons`, and the generated
`nucleo/` chrome components (+ vendored SVG sources). The canvas-object
glyph registry is NOT interface iconography; it lives with the icon def at
`objects/shapes/icon/icon-glyphs.ts`.

## SelectionToolbar is a dumb host

Since the RESTRUCTURE.md step-5 toolbar migration (revised by the
co-location alignment), `SelectionToolbar`
(`editor/features/selection-toolbar/SelectionToolbar.tsx`) no longer owns
*what* controls appear for a given selection. Per-kind control lists live on
the object defs in `src/objects/` as each def's DATA-ONLY
`toolbar: ToolbarSpec` (see `objects/object-def.ts`):

```ts
interface ToolbarSpec {
  controls: readonly ToolbarControlSpec[];   // ordered, icon-free action specs
}
```

The flyout components those controls open are EDITOR-side:
`editor/features/selection-toolbar/flyouts/` holds the JSX plus a registry
keyed by def kind + action id (`toolbarFlyoutsForKind`). Whether an action
opens a flyout is decided by that registry, not by the defs.

`editor/features/selection-toolbar/SelectionToolbarLayer.tsx` resolves the
current selection's def(s) (capability-intersection over defs for
multi-select — `intersectToolbarControls` in `objects/object-def.ts`), passes
the resulting `controls` list to `<SelectionToolbar controls={...} />`, and
renders whichever flyout component the flyout registry declares for the
currently open action. `SelectionToolbar` itself only resolves each action id
to an icon (`ACTION_ICONS`) and renders the pill/buttons/dividers — it has no
knowledge of which selection kind produced the controls it's given.

The old variant-keyed control table (`CONTEXT_TOOLBAR_REGISTRY`) and its
legacy `variant` prop were **deleted** once the registry migration landed
(the `@codecaine-ai/canvas/chrome` subpath export they once served had no
real external consumer). `controls` is now required; control sets belong on
an `ObjectDef.toolbar`.

## Import direction

- `objects/` imports NOTHING from `ui/` or `editor/` — defs are definitions
  + data + canvas-content rendering only.
- `editor/components/` sits in layer 4: it may import `objects/`, `render/`,
  `routing/`, `ui/`, `theme.ts`, and `state/`, but nothing outside `editor/`
  may import it (render inlines its own copies of the two style values it
  shares visually with the editor — the select cursor and selection blue).
- `ui/` imports nothing from the rest of src — primitives stay dumb.

These rules are encoded in `src/__tests__/import-boundaries.test.ts`.

## Test coverage

Each component/module has a focused jsdom test file under `__tests__/`
asserting measured geometry (stadium radius, bg colors, button/control
counts, group/divider structure) as style/DOM assertions rather than visual
screenshots (per the task's "no routes" constraint). Run:

```
bun test src/editor/components src/ui src/objects/__tests__
```
