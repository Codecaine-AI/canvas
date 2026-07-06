# Editor components (FigJam-parity page chrome)

Built per `board-design-reference/analysis/figjam-bottom-dock-spec.md`,
`figjam-chrome-catalog.md`, `figjam-style-tokens.json`/`figjam-style-spec.md`.
This directory holds what shows up on the page around the canvas — dock,
panels, `ContextToolbar`, zoom pill, and their icons. It started as a
standalone component library (W2-chrome, the old `src/chrome/`); since W3 it
**is** wired in: `editor/InteractiveCanvasEditor.tsx` and `editor/features/*`
compose these components directly (`FigJamDock`, `ShapesPanel`,
`ZoomControls` from the editor root; `ContextToolbar` from
`editor/features/context-toolbar/ContextToolbarLayer.tsx`).

Per RESTRUCTURE.md's amended target tree, the old `chrome/` directory was
dissolved into two homes:

- `editor/components/` (this directory) — editor-only page furniture.
- `src/ui/` — shared dumb primitives importable from `objects/` up:
  `Tooltip` (was `ChromeTooltip`), `ColorPalettePopover`, and `ui/icons/`
  (all icon modules: `toolbar-icons`, `dock-icons`, `icon-glyphs`, and the
  `nucleo/` reference SVGs).

The shape catalog (`shape-catalog.tsx`) and `ShapeSearchPopover` moved to
`src/objects/catalog/` — catalog data is objects-layer knowledge.

## Inventory

| File | Component | Purpose |
|---|---|---|
| `FigJamDock.tsx` | `FigJamDock` | White stadium bottom dock, content-fit x 37, 7 buttons / 3 whitespace groups. |
| `context-toolbar-position.ts` | `positionContextToolbar` | Pure clamp-to-viewport positioning function. |
| `ContextToolbar.tsx` | `ContextToolbar`, `CONTEXT_TOOLBAR_REGISTRY` | Dark floating pill; dumb host over registry-resolved control specs (see below). |
| `ShapesPanel.tsx` | `ShapesPanel` | Full-height left-docked white Shapes sidebar (Panel B). |
| `ZoomControls.tsx` | `ZoomControls` | Bottom-right zoom pill. |

Shared primitives these components draw on live in `src/ui/`:
`ui/Tooltip.tsx` (dark hover-label used by every component above),
`ui/ColorPalettePopover.tsx` (2x11 swatch grid flyout, also assembled into
`ToolbarSpec`s by object defs), and `ui/icons/` — `toolbar-icons.tsx`
(~20 glyphs for `ContextToolbar` controls), `dock-icons.tsx` (dock + zoom
glyphs), and `nucleo/` (reference SVG sources for the dock/toolbar glyphs).

## ContextToolbar is a dumb host

Since the RESTRUCTURE.md step-5 toolbar migration, `ContextToolbar` no longer
owns *what* controls appear for a given selection. Per-kind control lists and
their flyout components live on the object defs in `src/objects/` as each
def's `toolbar: ToolbarSpec` (see `objects/object-def.ts`):

```ts
interface ToolbarSpec {
  controls: readonly ToolbarControlSpec[];   // ordered, icon-free action specs
  flyouts?: Record<string, ComponentType<ToolbarFlyoutProps>>;
}
```

`editor/features/context-toolbar/ContextToolbarLayer.tsx` resolves the
current selection's def(s) (capability-intersection over defs for
multi-select — `intersectToolbarControls` in `objects/object-def.ts`), passes
the resulting `controls` list to `<ContextToolbar controls={...} />`, and
renders whichever flyout component the resolved def declares for the
currently open action. `ContextToolbar` itself only resolves each action id
to an icon (`ACTION_ICONS`) and renders the pill/buttons/dividers — it has no
knowledge of which selection kind produced the controls it's given.

`CONTEXT_TOOLBAR_REGISTRY` (the old variant-keyed control table) still
exists and still works via the legacy `variant` prop, but it is
**`@deprecated`** (the `@codecaine-ai/canvas/chrome` subpath export it once
served was deleted in the restructure — no real external consumer existed).
New control sets belong on an `ObjectDef.toolbar`, not in that table.

## Import direction

- `objects/` may import `ui/` primitives at runtime for flyout JSX (e.g.
  `objects/shapes/toolbar.tsx` and `objects/section/toolbar.tsx` import
  `ColorPalettePopover`/`ui/icons/toolbar-icons`;
  `objects/catalog/ShapeSearchPopover.tsx` imports `Tooltip`). This is
  expected: flyouts are dumb UI, and defs assemble them into their
  `ToolbarSpec`.
- `editor/components/` sits in layer 4: it may import `objects/`, `render/`,
  `ui/`, `tokens/`, and `model/`, but nothing outside `editor/` may import it.
- `ui/` must **not** import `objects/`, `render/`, `interaction/`, or
  `editor/` — primitives stay dumb. A type-only import from `objects/` in an
  editor component (e.g. `ContextToolbar.tsx`'s `ToolbarControlSpec`) is an
  ordinary editor→objects import and is fine.

These rules are encoded in `src/__tests__/import-boundaries.test.ts`.

## Test coverage

Each component/module has a focused jsdom test file under `__tests__/`
asserting measured geometry (stadium radius, bg colors, button/control
counts, group/divider structure) as style/DOM assertions rather than visual
screenshots (per the task's "no routes" constraint). Run:

```
bun test src/editor/components src/ui src/objects/catalog
```
