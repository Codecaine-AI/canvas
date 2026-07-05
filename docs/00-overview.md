# Codecaine Canvas — engine overview

`@codecaine-ai/canvas` is a typed-action, world-space interactive canvas
engine (FigJam-parity diagramming: shapes, sections, sticky notes, elbow
connectors, snapping/alignment guides, and an agent-editable document
model). This page is a light architecture map — see each module's own
header comment for the detailed design rationale, and
`packages/canvas/board-design-reference/` for the visual-parity research
(FigJam/AFFiNE screen recordings, pixel-sampled style tokens, chrome
catalogs) that the engine's visual constants are derived from.

## Document model

- **`schema.ts`** — the on-disk/on-wire document shape:
  `InteractiveCanvasDocument`, `InteractiveCanvasObject` (with an extensible
  `InteractiveCanvasObjectType` union — containers, process/decision shapes,
  sticky notes, sections, pills, arrow-shapes, code blocks, etc.),
  `InteractiveCanvasConnection`, `InteractiveCanvasAnnotation`, and links
  (`SpectreRef`-typed cross-references, see `spectre-ref.ts`). Includes
  `validateInteractiveCanvasDocument` for untrusted-input validation.
- **`actions.ts`** — the mutation vocabulary (`CanvasAction`, `CanvasTool`,
  `CanvasSelection`) plus pure helpers (`buildSelectionContext`,
  `createStarterInteractiveCanvasDocument`) that both the interactive editor
  UI and an external agent (patch operations) converge on as the single
  mutation authority for a document.
- **`geometry.ts`** — pure geometry helpers (bounds math, alignment,
  distribution, section-capture membership, container-fit-to-children) with
  no DOM or React dependency, so a backend can reuse them for agent-driven
  layout without dragging in rendering code.

## Interaction and rendering

- **`interaction.ts`** — a pure pointer-interaction state machine (mirrors a
  classic "draw-state" architecture): a thin DOM adapter in
  `InteractiveCanvasEditor.tsx` normalizes native pointer events into
  world-space events; this module consumes them and emits typed
  `CanvasAction`s plus ephemeral overlay state (marquee rect, snap guides,
  spacing hints, drop targets). Fully unit-testable with plain objects.
- **`viewport.ts`** — the screen/world coordinate convention
  (`screenPoint = (worldPoint - origin) * zoom`) and viewport state.
- **`CanvasStage.tsx`** — the SVG/DOM render layer: draws objects,
  connectors, selection/resize handles, snap-distribution guides, and grid
  background from pure state (no interaction logic of its own).
- **`routing.ts`** / **`connection-overlay.ts`** — elbow/orthogonal
  connector routing and the anchor-resolution cascade (anchor snap → outline
  snap → inside-shape → free point), adapted from BlockSuite's connector
  manager (see `vendor/blocksuite/NOTICE`).
- **`snapping.ts`** — alignment and equal-spacing ("distribution") snap
  guides, also adapted from BlockSuite.
- **`theme.ts`** / **`figjam-tokens.ts`** — tone/color resolution and the
  hand-maintained mirror of FigJam's sampled visual constants (grid, corner
  radii, gap px, sticky palette, etc.) — see `figjam-tokens.ts`'s own header
  for the exact provenance chain back into `board-design-reference/`.

## Chrome (dock, toolbar, panels)

`chrome/` holds the FigJam-parity UI chrome components (bottom dock,
floating context toolbar, shapes panel, color palette popover, zoom
controls) — see `chrome/README.md` for the full inventory and each
component's wiring contract. These are consumed today by
`InteractiveCanvasEditor.tsx` via direct file imports, and also exposed as a
barrel (`./chrome` export) for external consumers assembling their own
canvas chrome layout.

## Public surfaces

- **`InteractiveCanvasViewer.tsx`** — read-only rendering of a document
  (used for embeds).
- **`InteractiveCanvasEditor.tsx`** — the full interactive editor (stage +
  chrome + reducer wiring).
- **`fixtures/`** — sample documents (`synthetic-canvas.ts`, the "V2 Flow"
  reference diagrams) used by tests, the studio app's board library, and
  previously Spectre's `/canvas` library page.

## Self-containment

This package vendors a handful of tiny UI primitives (`ui/button.tsx`,
`ui/input.tsx`, `ui/textarea.tsx`, `ui/badge.tsx`, `ui/cn.ts`) and a
type-only copy of the cross-doc reference type (`spectre-ref.ts`) so it has
zero dependency on a host application's component library or docs model.
See `PROVENANCE.md` for exactly what was vendored and why.

## Where to go next

- `packages/studio/` — a minimal standalone Vite+React app for creating and
  editing boards without a host app.
- `PROVENANCE.md` — extraction history, what moved from Spectre, and the
  BlockSuite MPL-2.0 licensing note.
