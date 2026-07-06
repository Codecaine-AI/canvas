# FigJam chrome components (wired into the editor)

Built per `board-design-reference/analysis/figjam-bottom-dock-spec.md`,
`figjam-chrome-catalog.md`, `figjam-style-tokens.json`/`figjam-style-spec.md`.
This directory holds the FigJam-parity chrome components — dock, panels,
popovers, `ContextToolbar`, the shape catalog, and icons. It started as a
standalone component library (W2-chrome) with zero wiring into the editor;
since W3 it **is** wired in: `editor/InteractiveCanvasEditor.tsx` and
`editor/features/*` compose these components directly (`FigJamDock`,
`ShapesPanel`, `ZoomControls` from the editor root; `ContextToolbar` from
`editor/features/context-toolbar/ContextToolbarLayer.tsx`).

## Inventory

| File | Component | Purpose |
|---|---|---|
| `ChromeTooltip.tsx` | `ChromeTooltip` | Shared dark hover-label used by every other component below. |
| `dock-icons.tsx` | Dock icons + 2 zoom glyphs | Inline SVG glyphs for the bottom dock and zoom pill. |
| `FigJamDock.tsx` | `FigJamDock` | White stadium bottom dock, content-fit x 37, 7 buttons / 3 whitespace groups. |
| `toolbar-icons.tsx` | ~20 icon components | Glyphs for `ContextToolbar` controls. |
| `context-toolbar-position.ts` | `positionContextToolbar` | Pure clamp-to-viewport positioning function. |
| `ContextToolbar.tsx` | `ContextToolbar`, `CONTEXT_TOOLBAR_REGISTRY` | Dark floating pill; dumb host over registry-resolved control specs (see below). |
| `ColorPalettePopover.tsx` | `ColorPalettePopover` | 2x11 swatch grid + rainbow-ring current-color swatch. |
| `shape-catalog.tsx` | data + icon glyphs | Shape catalog data consumed by the two components below. |
| `ShapeSearchPopover.tsx` | `ShapeSearchPopover` | Compact dark "search for a shape" popover (Panel A). |
| `ShapesPanel.tsx` | `ShapesPanel` | Full-height left-docked white Shapes sidebar (Panel B). |
| `ZoomControls.tsx` | `ZoomControls` | Bottom-right zoom pill. |

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
**`@deprecated`** — kept only so the public `@codecaine-ai/canvas/chrome`
subpath export doesn't break for external consumers who built against it
pre-registry. New control sets belong on an `ObjectDef.toolbar`, not in that
table.

## Import direction

- `objects/` may import chrome components at runtime for flyout JSX (e.g.
  `objects/shapes/toolbar.tsx` and `objects/section/toolbar.tsx` import
  `ColorPalettePopover`/`ShapeSearchPopover`; `objects/connector/def.tsx`
  imports `ColorPalettePopover`). This is expected: flyouts are chrome UI,
  and defs assemble them into their `ToolbarSpec`.
- `chrome/` must **not** import `objects/` at runtime — the dependency only
  points one way. A `import type { ... }` from `objects/object-def.ts` (e.g.
  `ContextToolbar.tsx`'s `ToolbarControlSpec` import) is fine since it's
  erased at build time and doesn't create a runtime cycle; a value import
  would not be.

## Test coverage

Each component/module has a focused jsdom test file under `__tests__/`
asserting measured geometry (stadium radius, bg colors, button/control
counts, group/divider structure) as style/DOM assertions rather than visual
screenshots (per the task's "no routes" constraint). Run:

```
bun test src/chrome
```
