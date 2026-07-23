# Global Theming — Proposal (Brainstorm)

Date: **2026-07-22**

Status: **brainstorm / pre-design**

Scope: **`packages/canvas` (live stage + static SVG export)**

**No implementation yet.** This records a possible direction, not a committed design.

## 1. Where styling stands today (audit findings)

Color is already centralized and role-based. `packages/canvas/src/state/schema/colors.ts`
defines a closed 10-hue vocabulary: gray, red, orange, yellow, green, teal, blue,
violet, pink, and white. Black was dropped; white is a hue.
`packages/canvas/src/theme/palette.ts` holds the single role table
`CANVAS_PALETTE: Record<CanvasColor, Swatch>`, where `Swatch` is:

```ts
{
  swatch,
  shape: { fill, border },
  section: { tint, chip: { fill, border } },
  sticky,
  connector,
}
```

The roles are **ink** for a line-safe stroke color, **fill** for an object or
chip body, and **wash** for the lightest section tint. The line-safe yellow,
orange, and gray inks (`#E8A302`, `#EB7500`, `#757575`) are hand-tuned so a
2px line reads on the `#F5F5F5` board. The public API exposes resolver
functions only: `resolveShapeColors`, `resolveSectionColors`,
`resolveStickyFill`, `resolveConnectorStroke`, and `resolveSwatchPreview`.
Objects store only `color?: CanvasColor`. First-use defaults live in
`state/schema/object-defaults.ts`: `FIRST_USE_COLORS` uses gray for shapes,
sections, and connectors, and yellow for stickies.

Non-color styling is scattered. The centralized pieces are:

- `theme/tokens.ts`: `SHAPE_STROKE_WIDTH_PX = 4`,
  `resolveObjectStrokeWidth`, and `TEXT_SIZES_PX`.
- `objects/section/def.tsx`: `SECTION_GEOMETRY` with `cornerRadiusPx: 8.5`
  and `borderWidthPx: 2`.
- `objects/sticky/def.tsx`: `STICKY_GEOMETRY` with radius `0` and shadow
  `"0 3px 12px rgba(0,0,0,0.15)"`.
- `connectors/def.ts`: `CONNECTOR_DASH_PATTERN_PX = [19, 7]`.
- `connectors/routing.ts`: `CONNECTOR_ELBOW_CORNER_RADIUS_PX = 21.5`.
- `stage/editor/components/editor-style.ts`: `EDITOR_STYLE`, including
  `dockRadiusPx: 15`, `selectionToolbarRadiusPx: 14`, and
  `accentPurple: "#8C2EF2"`.

Scattered magic numbers remain in the render paths:

- `stage/CanvasStage.tsx` has base object trim hardcoded in a CSS string near
  line 325: `border: 2px solid var(--border); border-radius: 8px`.
- `connectors/Connector.tsx` keeps connector stroke width `4` and hit width
  `14` locally.
- `connectors/ConnectorDragPreview.tsx` uses preview opacity `0.6`.
- Dimmed opacity `0.35` is inline.
- Each shape keeps its radius in its CSS template string: roughly 15 shapes
  use radius `0`, the page-corner shape uses `2px 8px 8px 8px`, and the
  database shape uses `rx`/`ry` ratios.

Selection blue `#0D99FF` is duplicated as a local constant in at least six
files:

- `connectors/AnchorDots.tsx`
- `connectors/Connector.tsx`
- `connectors/ConnectorDragPreview.tsx`
- `stage/CanvasStage.tsx`
- `stage/editor/features/selection/HoverHighlight.tsx`
- `stage/editor/features/selection/SelectionBox.tsx`

`SelectionBox.tsx` also hardcodes `SELECTION_BORDER_WIDTH = 2`.

`render/static-svg.ts`, the Node-side static SVG exporter, correctly reuses
the palette resolvers for color. It hand-mirrors roughly 15 non-color
constants with `mirrors X` comments: `CANVAS_BG = "#F5F5F5"`, base corner
radius `8`, section radius and width, chip radius `6`, connector width `4`,
arrow ratios, label-chip styling, sticky-shadow parameters, and the font
stack. Only `render/__tests__/static-svg.test.ts` guards those mirrors.

There is no runtime theme engine and no dark mode in `packages/canvas`.
Selection, grid, and guide styling lean on host-provided CSS variables such
as `--primary`, `--border`, and `--background`. The studio defines a static
light snapshot of Spectre tokens in `packages/studio/src/index.css`; the real
multi-theme engine lives upstream in `apps/frontend` and is deliberately not
vendored.

A theme must reach every render path:

- DOM objects: inline styles from `objectStyle()` in
  `objects/object-shell.tsx`, CSS class strings in `stage/CanvasStage.tsx`,
  and per-definition `def.css` strings.
- SVG silhouette shapes: SVG presentation attributes from
  `objects/shapes/base.tsx`.
- Connectors: inline SVG attributes.
- Selection and interaction UI: inline styles.
- The static exporter.

## 2. Design direction: two layers with different owners

The core decision is not one theme with permission flags. It is two separate
objects whose schemas enforce what each layer can touch.

**Layer 1 — the Feel (global, ours, rarely touched).** The feel owns how
things are drawn: corner shape, stroke weight, stroke opacity, joins,
shadows, dash patterns, and connector elbow curvature. It is versioned with
the app. It is technically forkable because the project is open source, but
it has no runtime theming surface. Changing it is a design decision, not a
user setting.

**Layer 2 — the Skin (open, user/community-themeable).** The skin owns colors
only: the 10-hue palette table with ink, fill, and wash per hue; board
background; grid and guide tints; and selection accent. Enforcement is by
construction. The skin type has no geometry fields, so a skin cannot make
corners rounder or borders thicker because there is nowhere to write those
values. The schema is the contract that makes open community skins safe.

Rendering composes the two layers: `resolve(feel, skin)` feeds both the live
stage and the SVG exporter. Any skin works with any feel version, so a feel
update does not break a community skin.

## 3. Corner system: roles + one sharpness knob

Today's scattered radii cluster naturally into a small role table:

| Role | Today | Used by |
|---|---:|---|
| surface | 14–15px | dock, toolbars, flyouts, popups |
| object | 8–8.5px | shapes, sections |
| chip | 6px | section title chips, labels |
| sharp | 0–2px | stickies, page-corner fold |
| elbow | 21.5px | connector bend curvature |

Add one **sharpness knob** to the feel that scales the whole table
proportionally. “Crisp it up” becomes one edit: dock, shapes, and chips move
together while preserving their corner relationships. Component-level
overrides, such as a flyout pinning its radius, are authored inside the feel
at the component-definition level. They are deliberate and enumerable,
never a user surface.

## 4. Making shapes harsher: three levers

1. **Corner radius.** This affects the rectangle family, sections, arrow
   bodies, the page-corner fold, and connector elbows. Moving object corners
   from `8` to roughly `3px` and elbows from `21.5` to roughly `10px`
   produces most of the perceived harshness.
2. **Stroke joins (the sleeper).** Polygon shapes such as triangle, star,
   hexagon, and most flowchart shapes already have zero border radius. Their
   softness comes from the 4px stroke rounding at vertex joins. A feel token
   `strokeLinejoin: "miter" | "round"`, plus a linecap token for connectors,
   changes crispness on exactly the basic and flowchart elements without
   changing geometry.
3. **Shadows.** Sticky and popup shadows read as soft independently of
   corners. A harsher feel tightens their blur radii. Shadow *shape* belongs
   in the feel.

Icons are vendored fixed glyphs and are out of scope. There is no theming
lever there.

## 5. Sketch of each layer

Illustrative, not final:

```ts
// Feel — global, versioned with the app
{
  corners: {
    sharpness: 1.0,                          // the one knob
    roles: { surface: 15, object: 8, chip: 6, sharp: 0, elbow: 21.5 },
    overrides: { colorFlyout: "surface" },   // authored exceptions, enumerable
  },
  stroke: { widthPx: 4, opacity: 1, linejoin: "round", connectorDash: [19, 7] },
  shadows: { sticky: {...}, popup: {...} },
}

// Skin — open, community-themeable
{
  name: "figjam-light",
  palette: { gray: { ink, fill, wash }, red: {...}, /* ×10 */ },
  board: { background: "#F5F5F5", grid, guide },
  selection: { accent: "#0D99FF" },
}
```

The theme objects are the source of truth. A small function emits the CSS
variable block from them, following the existing `canvasSurfaceStyle`
pattern in `theme/tokens.ts`. `static-svg.ts` takes the composed theme as a
parameter, deleting its roughly 15 manual mirrors and making exports
automatically theme-correct.

## 6. Guardrails and open questions

- **Line-safe inks are a per-skin contract.** Skins control both the board
  background and inks, so a contrast validator must gate every skin. Swapping
  skins must not produce invisible connectors.
- **Selection accent:** skin, because it is a color, or feel, if selection UI
  should be identical across skins? Current lean: skin.
- **Sticky shadow:** keep shape and softness in the feel, but color and
  darkness in the skin so a dark skin can lighten it? Current lean: split
  shape-in-feel and color-in-skin.
- **Host CSS-variable boundary:** should the canvas theme own
  `--primary`/`--border`-equivalent values for an identical board everywhere
  and cleaner exports, or keep inheriting them from the host for cleaner
  embedding?
- **Knob form:** continuous sharpness scalar or named presets
  (`sharp | standard | soft`)? Named presets as points on the continuous
  scale provide both.

## 7. Migration sketch (when/if built)

Step 1 is purely mechanical and has zero visual change: pull the scattered
constants and six `SELECTION_BLUE` copies into feel and skin objects seeded
with today's values as the default `figjam-light` pairing, then wire
`static-svg.ts` to consume them. Only after that does theme swapping become
a feature.
