# AFFiNE / BlockSuite Code-Mining Map

**Purpose:** blueprint for lifting algorithms, data models, and constants from AFFiNE's edgeless
mode into our React/TS canvas engine (`apps/frontend/src/lib/interactive-canvas/`), following the
vendoring convention established in `apps/frontend/src/lib/vendor/blocksuite/NOTICE` (MPL-2.0,
pure-TS ports only — **no Lit, no Yjs, no `@toeverything` imports**; UI re-rendered in React).

**Source trees** (identical package layout; paths below are relative to
`reference/blocksuite-main/packages/affine/` unless noted; the same files exist under
`reference/AFFiNE-canary/blocksuite/affine/`):

- `reference/blocksuite-main/` — BlockSuite monorepo (primary; matches our existing vendored files)
- `reference/AFFiNE-canary/` — AFFiNE app (frontend MIT; **never mine `packages/backend` or
  `packages/common/native`** — enterprise-licensed)

All paths and constants below were verified by reading the actual files.

---

## 1. Frame element (AFFiNE "Frame" = our new `section` type)

### (a) Source files
- `model/src/blocks/frame/frame-model.ts` — `FrameBlockProps`, `FrameBlockModel` (data model,
  containment tests, child membership API)
- `blocks/frame/src/frame-manager.ts` — `EdgelessFrameManager` (capture semantics, creation,
  presentation ordering) + `FrameOverlay` (hover highlight rendering)
- `widgets/frame-title/src/frame-title.ts` + `widgets/frame-title/src/styles.ts` — title chip
  rendering + placement math
- `blocks/frame/src/frame-tool.ts` — frame-drawing tool
- `blocks/frame/src/frame-highlight-manager.ts` — drag-over-frame highlight orchestration

### (b) Pure/liftable vs bound
**Liftable:**
- The **data model shape**: `{ title, background: Color, xywh: "[x,y,w,h]" string, index
  (fractional z-index), childElementIds: Record<string, boolean>, presentationIndex (fractional),
  lockedBySelf }` (`frame-model.ts:28-55`). Membership is an **explicit id-set**, not recomputed
  containment.
- Containment predicates: `containsBound` (full containment), `includesPoint` (bound hit test),
  `intersectsBound` (intersect **or** fully-contained — note the `|| selectedBound.contains(bound)`
  at `frame-model.ts:150-155`).
- Capture queries in the manager (all pure given a spatial-index `search(bound)`):
  - `getElementsInFrameBound(frame, fullyContained=true)` — grid search with `strict` containment
    (`frame-manager.ts:428-435`)
  - `getFrameFromPoint(point, ignore)` — iterate frames **top-most first** (reverse order),
    first frame whose bound contains the point wins (`frame-manager.ts:440-448`)
  - `createFrameOnElements` bound expansion logic incl. the nested-frame clamp
    (`frame-manager.ts:343-380`)
- `framePresentationComparator` — fractional-index string compare with legacy fallback
  (`frame-manager.ts:156-197`).
- **Auto-capture on create**: when an element is added, `getFrameFromPoint(element.center)`
  decides frame membership (deferred to a microtask so connector bounds are valid —
  `frame-manager.ts:233-304`; the comment block there is worth reading verbatim).

**Bound (reimplement in React):** Yjs-reactive props (`props.childElementIds` transactions),
`GfxExtension` lifecycle, Lit `frame-title` component, ThemeProvider color resolution,
`FrameOverlay` (trivial canvas code, but tied to their Overlay base class).

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| `FRAME_PADDING` (expand bound when wrapping selection) | `40` | `frame-manager.ts:27` |
| Frame hover-outline stroke | `#1E96EB`, width `2/zoom`, corner radius `2/zoom` | `frame-manager.ts:110-112` |
| Title chip height | `22` px | `frame-title/src/styles.ts` (`frameTitleStyleVars`) |
| Title font size | `14` px | same |
| Title chip radius / padding / border | `4px` / `0 4px` / `1px solid` | same |
| `nestedFrameOffset` (title inset when frame is nested) | `4` (÷ zoom) | same + `frame-title.ts:95-135` |
| Title placement | above top-left, `y - (chipHeight + 4/zoom)`; nested frames: inside top-left at `+4/zoom` | `frame-title.ts:95-135` |
| Default background | `transparent` | `frame-model.ts:41,48` |

### (d) Difficulty — **medium**, plus one critical semantic decision
> **CRITICAL:** AFFiNE frames do **NOT** move their children when dragged. `childElementIds` is a
> membership *label* (used for presentation order, select-all, highlight); children keep absolute
> positions and the frame slides under them. **FigJam sections DO move their contents.** Lift
> AFFiNE's model, containment queries, and title constants — but the *move-children-on-frame-drag*
> behavior (apply frame's `dx,dy` to every captured descendant, re-evaluate membership on drop) is
> ours to write. AFFiNE's `FrameOverlay.highlight(frame, highlightElementsInBound)` shows the UX
> pattern for previewing what a frame would capture during drag.

---

## 2. Connector rendering with rounded corners

### (a) Source files
- `gfx/connector/src/element-renderer/index.ts` — the full connector paint path (stroke, dash,
  curve, label clipping, endpoints)
- `gfx/connector/src/element-renderer/utils.ts` — arrowhead math (`renderArrow`, `renderTriangle`,
  `renderCircle`, `renderDiamond`, `getArrowOptions`)
- `model/src/consts/connector.ts` — mode/endpoint enums + defaults
- `model/src/consts/line.ts` — `LineWidth` enum
- `model/src/elements/connector/connector.ts` — element model (stroke, mode, endpoint styles,
  label fields)

### (b) Pure/liftable vs bound
**Key insight:** the "rounded corners" on orthogonal connectors are **not explicit radius/arc
math**. They come from canvas joins: `ctx.lineJoin = 'round'; ctx.lineCap = 'round'`
(`element-renderer/index.ts:162-163`) applied to the raw polyline from the path generator we
already vendored. Curve mode is a separate rendering branch: cubic béziers driven by each
`PointLocation`'s `absIn`/`absOut` tangent handles (`index.ts:166-181`) — our vendored
`gfx-types.ts` `PointLocation` already carries these.

**Liftable:** the entire `renderPoints`/`renderEndpoint` flow minus RoughCanvas; all of
`utils.ts` arrowhead geometry (pure tangent math on the last two path points); the label-region
clip trick (`Path2D` + `'evenodd'` clip, `index.ts:62-77`) for the label gap in the stroke.

**Bound / skip:** RoughCanvas "Scribbled" branch, label text layout (uses their rich-text delta
pipeline — we have our own text), theme color resolution.

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| `DEFAULT_ARROW_SIZE` | `15` | `element-renderer/utils.ts:20` |
| Arrow size scaling | `DEFAULT_ARROW_SIZE * (strokeWidth / 2)` | `utils.ts:194` |
| Arrow open-angle | `Math.PI / 4` (arrow), `Math.PI / 6` (triangle) | `utils.ts:193,219` |
| Dash pattern | `[12, 12]` | `index.ts:146,164` |
| Stroke joins | `lineJoin='round'`, `lineCap='round'` | `index.ts:162-163` |
| `ConnectorMode` | `Straight=0, Orthogonal=1, Curve=2` | `consts/connector.ts:30-34` |
| `DEFAULT_CONNECTOR_MODE` | `Curve` | `consts/connector.ts:36` |
| `PointStyle` | `Arrow, Circle, Diamond, None, Triangle` | `consts/connector.ts:8-14` |
| Endpoint defaults | front `None`, rear `Arrow` | `consts/connector.ts:18-20` |
| Default `strokeWidth` | `4` (`LineWidth.Four`) | shape/connector models; `consts/line.ts` |
| `LineWidth` steps | `2, 4, 6, 8, 10, 12` | `consts/line.ts:5-14` |
| `CONNECTOR_LABEL_MAX_WIDTH` | `280` | `consts/connector.ts:22` |
| Label offset default | `{ distance: 0.5, anchor: 'center' }` | `elements/connector/connector.ts` |
| Label clip inset | label rect expanded by `3+0.5` px each side | `index.ts:75` |

### (d) Difficulty — **low.** We already have path generation; the render layer is ~200 lines of
pure canvas code. Port `element-renderer/utils.ts` near-verbatim (add to vendor NOTICE), rewrite
`renderPoints` against our canvas layer, skip rough mode.

---

## 3. Quick-connect / connection UX

### (a) Source files
- `gfx/connector/src/connector-manager.ts:851-1080` — **`ConnectionOverlay`** (hover ports, target
  highlight, best-anchor selection; this is the file our `path-generator.ts` was extracted from —
  the overlay half we deliberately left behind)
- `gfx/connector/src/connector-manager.ts:133-159` — **`getAnchors(ele)`** (port geometry)
- `gfx/connector/src/connector-tool.ts` — drag-to-create flow (pointerdown → `renderConnector` per
  move → set source/target connection on up)
- `gfx/connector/src/components/connector-handle.ts` — draggable endpoint handles on an existing
  connector (reconnect UX)
- `widgets/edgeless-selected-rect/src/edgeless-auto-complete.ts` +
  `widgets/edgeless-selected-rect/src/utils.ts` — the FigJam-style **quick-connect arrows** around
  a selected shape (click/drag an arrow → spawn connected sibling shape or drag out a connector)
- `widgets/edgeless-selected-rect/src/auto-complete-panel.ts` — the "pick target element type"
  panel after releasing a quick-connect drag

### (b) Pure/liftable vs bound
**Liftable:**
- `getAnchors`: 4 cardinal port candidates at `offset=10` px outside the bound (N/S/E/W of
  center), each then **projected onto the actual shape outline** via
  `getLineIntersections(center, candidate)` — so ports sit on the real path of a diamond/ellipse,
  not its bounding box. Returns `{ point (absolute), coord (relative 0..1) }`.
- `ConnectionOverlay.renderConnector(point, excludedIds)` decision cascade
  (`connector-manager.ts:958-1056`) — **this is the auto-anchor algorithm**:
  1. only consider elements whose rotated bound expanded by `10` contains the pointer;
  2. snap to nearest of the 4 anchors if screen-distance `< 8` px;
  3. else snap to `getNearestPoint` on the outline if `< 8` px → clamp to relative 0..1 coord;
  4. else if pointer inside the element → connection with `id` only (element-center connection);
  5. else → free-floating `position: point`.
- Connection model: `{ id?, position?: [rx, ry] (0..1 relative) }` — endpoints re-derive absolute
  points from the target's live bound; this is what makes connectors track moving shapes.
- Auto-complete placement math: `nextBound` offsets, `getPosition(direction)`
  (`edgeless-selected-rect/src/utils.ts`).

**Bound:** overlay base class / renderer refresh, ThemeProvider emphasis color, Lit
auto-complete component & panel, `EdgelessCRUDIdentifier` element creation.

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| Anchor offset outside bound | `10` (world px) | `connector-manager.ts:135` |
| Hover hit-zone expansion | `bound.expand(10)` | `connector-manager.ts:976` |
| Anchor snap distance | `< 8` **view** px | `connector-manager.ts:1006` |
| Outline snap distance | `< 8` world px | `connector-manager.ts:1011` |
| Port dot radius | `5 / zoom`, white fill, 2/zoom emphasis-color stroke, `globalAlpha 0.6` | `connector-manager.ts:912-935` |
| Active anchor | same radius, solid emphasis color, alpha 1 | `connector-manager.ts:937-946` |
| Source/target highlight rect | dashed, `lineWidth 1/zoom`, dash `[2w, 2w]` | `connector-manager.ts:834-849` |
| Quick-connect arrow button | `24×24` px circle inside `72×44` hover wrapper | `edgeless-auto-complete.ts` styles |
| Auto-complete spawn gap | `MAIN_GAP = 100`, `SECOND_GAP = 20` | `edgeless-selected-rect/src/utils.ts:41-42` |
| Target-type panel | `PANEL_WIDTH = 136`, `PANEL_HEIGHT = 108` | same, lines 38-39 |
| Preview line dash | `[2, 2]` | `edgeless-auto-complete.ts` (AutoCompleteOverlay) |

### (d) Difficulty — **medium.** The algorithm core (`getAnchors` + the `renderConnector` cascade)
is ~150 lines of pure geometry once `Overlay`/`GfxController` are swapped for our canvas + element
store; it composes directly with our vendored `path-generator.ts` (same `Connection` shape). The
auto-complete arrows widget is a React rebuild guided by the source (state machine:
hover → show arrows → drag < 8px = click-spawn, ≥ 8px = connector drag).

---

## 4. Shape library / picker

### (a) Source files
- `model/src/consts/shape.ts` — `ShapeType`, `ShapeName`, `ShapeStyle`, radius helpers
- `model/src/elements/shape/shape.ts` — `ShapeElementModel` (props + defaults) and
  `shapeMethods` dispatch
- `model/src/elements/shape/api/{rect,ellipse,diamond,triangle}.ts` — **per-shape geometry API**:
  `points()`, `draw(ctx)`, `includesPoint`, `containsBound`, `getNearestPoint`,
  `getLineIntersections`, `getRelativePointLocation`
- `gfx/shape/src/element-renderer/shape/{rect,ellipse,diamond,triangle}.ts` — fill/stroke painting
  (incl. rounded-rect radius math)
- `gfx/shape/src/consts.ts` — shape-tool overlay constants
- `gfx/shape/src/shape-tool.ts`, `gfx/shape/src/draggable/` — draw-tool & drag-from-toolbar
- `gfx/shape/src/toolbar/` — the shape picker menu (Lit)

### (b) Pure/liftable vs bound
**Liftable (high value):** the whole `api/*.ts` geometry layer is pure given our `gfx-types.ts`
(`Bound`, `PointLocation`, polygon helpers — most already vendored; missing helpers like
`pointOnPolygonStoke`, `polygonNearestPoint`, `linePolygonIntersects` partially exist in our
`gfx-types.ts`). This gives us, per shape: outline points, canvas draw, hit-testing
(stroke-proximity + fill + "central area" rule for unfilled shapes), nearest-point (used by
quick-connect), and line intersections (used by anchors + connector endpoint clipping).
Rounded-rect radius semantics in the renderer: `radius < 1` is **relative** —
`Math.min(w*radius, h*radius)` — else absolute px (`gfx/shape/src/element-renderer/shape/rect.ts:40`).

**Bound:** Lit picker menu, RoughCanvas "Scribbled" style, text-binding inside shapes.

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| `ShapeType` catalog | `rect, ellipse, diamond, triangle` (+ derived name `roundedRect`) | `consts/shape.ts:13-20` |
| `roundedRect` radius | `0.1` (relative → 10% of min side) | `consts/shape.ts:36-41` |
| `ShapeStyle` | `General` \| `Scribbled` | `consts/shape.ts:43-46` |
| Shape defaults | `shapeType=Rect`, `filled=false`, `strokeWidth=4`, `radius=0`, `fillColor=Medium.Yellow`, `strokeColor=Medium.Yellow`, `shapeStyle=General` | `elements/shape/shape.ts:102-164` |
| `ShapeTextFontSize` | `SMALL=12, MEDIUM=20, LARGE=28, XLARGE=36` | `consts/shape.ts:6-11` |
| `DEFAULT_CENTRAL_AREA_RATIO` (unfilled-shape hit area) | `0.3` | `consts/shape.ts:4` |
| `DEFAULT_ROUGHNESS` | `1.4` | `consts/shape.ts:1` |
| Tool ghost-preview size/offset | `SHAPE_OVERLAY_WIDTH/HEIGHT = 100`, `OFFSET_X/Y = 6` | `gfx/shape/src/consts.ts:7-10` |

**Parity note:** AFFiNE's catalog is only 4 base shapes — FigJam has more (arrow/chevron, star,
speech bubble, parallelogram…). The `api/*.ts` object shape (`points/draw/includesPoint/...`) is
the *pattern* to copy; extra FigJam shapes are new `points()` polygon definitions in the same
mold. Our M1 shape vocabulary already exceeds AFFiNE's here.

### (d) Difficulty — **low** for the four shape geometry modules (near-verbatim vendorable);
**n/a → design work** for extending the catalog to FigJam's set.

---

## 5. Element toolbar (floating context toolbar)

### (a) Source files
- `widgets/toolbar/src/toolbar.ts` — `AffineToolbarWidget` (visibility orchestration)
- `widgets/toolbar/src/utils.ts` — `autoUpdatePosition()` (floating-ui middleware chain),
  `sideMap` offsets, `renderToolbar()` action grouping/ordering
- Per-element configs (the registry pattern to mirror in React):
  - `gfx/shape/src/toolbar/config.ts` — `shapeToolbarConfig`
  - `gfx/connector/src/toolbar/config.ts` — `connectorToolbarConfig`
  - `gfx/text/src/toolbar/config.ts` — text
  - `blocks/frame/src/frame-toolbar.ts` — frame
  - `gfx/group/src/toolbar/config.ts` — group
  - `gfx/note/src/toolbar/note-menu-config.ts` — note

### (b) Pure/liftable vs bound
**Liftable:** the **declarative registry pattern** — `ToolbarModuleConfig` with
`actions: [{ id, score?, when(ctx), content(ctx) | run(ctx), placement? }]`, resolved per
selection flavor; the multi-select value resolution (`getMostCommonValue`) used to show e.g. the
dominant fill color when 3 shapes are selected; the grouping/ordering/overflow-to-"More"-menu
partition in `renderToolbar()`; the floating-ui middleware recipe.
**Bound:** every `content()` returns Lit `html` — the *structure* ports, each button is a React
rebuild; `ToolbarContext` (std/store access) must become a generic context interface.

**Actions per element type** (what each config exposes):
- **shape**: swap shape type, style (General/Scribbled), fill color, stroke color/width/style,
  shape text props, more-menu (duplicate, delete, z-order, lock…)
- **connector**: stroke color, width, style (solid/dash), connector mode
  (straight/elbow/curve), front/rear endpoint style, add label
- **frame**: rename, background color, insert-into-page, ungroup/delete
- **group**: rename, ungroup, insert-into-page
- **note (sticky)**: background color, shadow style, corner radius, border, display mode, size
- **text**: font, size, weight, color, align

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| `sideMap` toolbar offsets | frame `{top: 28}`, group `{top: 20}`, single shape `{top: 26, bottom: -26}` | `widgets/toolbar/src/utils.ts` |
| Base vertical gap | `offset(10 + offsetY)` (≈10-12px above selection) | same, ~line 64-103 |
| Flip/shift boundary padding | `{top: 10, right: 10, bottom: 150, left: 10}` | same |

### (d) Difficulty — **medium-high** (biggest React-rebuild surface of the list). Port the
registry/config data structure and positioning constants; rebuild buttons/menus as React
components. The per-type action lists above are the spec.

---

## 6. Color palettes

### (a) Source files
- `model/src/themes/default.ts` — `DefaultTheme`: all edgeless palettes
- `model/src/themes/color.ts` — `Color` union type, `ColorScheme` enum, `resolveColor()`
- `model/src/themes/utils.ts` — `buildPalettes()`, `getColorByKey()`, `pureBlack`, `pureWhite`
- `model/src/themes/types.ts` — `Palette`/`Theme` types + zod schemas

### (b) Pure/liftable vs bound
**Liftable verbatim:** `Color`/`ColorScheme`/`resolveColor`, `buildPalettes`, the palette
*structure*: three tiers × 8 hues — `Light`, `Medium`, `Heavy` × `{Red, Orange, Yellow, Green,
Blue, Purple, Magenta, Grey}` (Heavy has no Grey), plus `White/Black/Transparent`; sub-palettes
`StrokeColorShortMap = Medium + Black + White`, `FillColorShortMap = Medium + Black + White +
Transparent`, `ShapeTextColorShortMap = Medium + pureBlack + pureWhite`; note palette
`NoteBackgroundColorMap` (9 entries incl. Transparent).
**Caveat:** actual hex values are **not in either reference tree** — they resolve at runtime via
`getColorByKey()` from the **`@toeverything/theme` npm package** (`darkThemeV2`/`lightThemeV2`
keyed like `'edgeless/palette/medium/yellowMedium'`, `'edgeless/note/yellow'`). Every color is a
`{dark, light}` pair. **To lift:** vendor the ~40 needed key→hex pairs out of the published
`@toeverything/theme` package (MIT) into a local constants file — do not import the package
(D32).

### (c) Hard-coded values that ARE in-tree
| Constant | Value | Where |
|---|---|---|
| Default shape fill & stroke | `Medium.Yellow` | `themes/default.ts:120-121` |
| Default connector color | `Medium.Grey` | `themes/default.ts:122` |
| Default note background | `NoteBackgroundColorMap.White` | `themes/default.ts:123` |
| Highlighter color | `#84cfff4d` (30% Medium.Blue) | `themes/default.ts:125` |
| Full `Palettes` order | Light×8, Transparent, Medium×8, White, Heavy×7, Black | `themes/default.ts:52-67` |

### (d) Difficulty — **low.** Pure data. Only chore is extracting hex pairs from
`@toeverything/theme` (npm) since neither reference checkout vendors them.

---

## 7. Sticky note ("note") element

### (a) Source files
- `model/src/consts/note.ts` — all style constants
- `model/src/blocks/note/note-model.ts` — `NoteBlockSchema` (defaults + zod schema)
- `blocks/note/src/components/edgeless-note-background.ts` — background/shadow application
- `gfx/note/src/note-tool.ts` — placement tool

### (b) Pure/liftable vs bound + parity assessment
**Liftable:** the style-constant set and the `edgeless.style` sub-object shape
(`{borderRadius, borderSize, borderStyle, shadowType}`), display-mode enum.
**Bound:** everything else — AFFiNE's note is a **rich-text block container** (children are
paragraph/list/db blocks, `role: 'hub'`), not FigJam's simple sticky. **Honest parity: low.**
Lift the *styling vocabulary* (shadows, corners, sizes, palette) for our sticky, keep our own
simple text model. The shadow CSS values live behind CSS vars (`--affine-note-shadow-*`) in the
theme package — extract alongside the palette hexes (§6).

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| `NOTE_MIN_WIDTH` / `NOTE_MIN_HEIGHT` | `218` (170+24·2) / `92` | `consts/note.ts:5-6` |
| `DEFAULT_NOTE_WIDTH` / `HEIGHT` | `498` (450+24·2) / `92` | `consts/note.ts:8-9` |
| `NoteShadow` variants | `None, Box, Sticker, Paper, Float, Film` (CSS vars `--affine-note-shadow-*`) | `consts/note.ts:14-32` |
| `DEFAULT_NOTE_SHADOW` | `Box` | `consts/note.ts:34` |
| `NoteCorners` | `None=0, Small=8, Medium=16, Large=24, Huge=32` | `consts/note.ts:58-64` |
| `DEFAULT_NOTE_CORNER` | `Small` (8) | `consts/note.ts:76` |
| `DEFAULT_NOTE_BORDER_SIZE` | `4` (default style `StrokeStyle.None`) | `consts/note.ts:80,54` |
| Note color palette | 9 colors, see §6 `NoteBackgroundColorMap` | `themes/default.ts:40-50` |

### (d) Difficulty — **low for constants, skip the block architecture.** Our sticky ≠ their note;
copy the visual vocabulary only.

---

## 8. Snap / alignment + spacing guides

### (a) Source files
- `gfx/pointer/src/snap/snap-overlay.ts` — **the whole algorithm** (`SnapOverlay`: `align()`,
  `alignResize()`, `_calculateClosestDistances`, `_alignDistribute{Horizontally,Vertically}`)
- `gfx/pointer/src/snap/snap-manager.ts` — `SnapExtension` (wiring into drag/resize lifecycle,
  incl. rotated-handle direction math at lines 91-116)

### (b) Comparison with ours (`apps/frontend/src/lib/interactive-canvas/snapping.ts`)
We already have: edge/center alignment guides, equal-spacing *hints*, candidate capping
(`MAX_SNAP_CANDIDATES=100`). What AFFiNE has that we don't — worth lifting:
1. **Distribution snapping** (`_alignDistributeHorizontally/Vertically`): doesn't just *show*
   equal gaps — it **snaps the dragged element into** the position that equalizes spacing
   (mid-between pair, or extending the sequence left/right), picking the candidate with min
   `dif` then min average distance. Our spacing hints are display-only.
2. **Chained equal-gap propagation**: after a distribution match, it walks outward finding every
   further box at the same spacing and draws all the gap segments
   (`snap-overlay.ts:198-250, 349-402`) — the FigJam "N equal gaps" look.
3. **Richer pair set**: 9 distance types per axis incl. center↔edge and edge↔center
   (`_calculateClosestDistances`, lines 405-496); we compare only edge/center lines.
4. **Priority rule**: point-alignment beats distribution; distribution only runs on an axis whose
   `dx/dy` is still 0 (`snap-overlay.ts:676-683`).
5. **Resize-time snapping** with rotation-aware handle direction (`snap-manager.ts:78-116`).
6. **Candidate scoping**: viewport-wide cross-shaped search areas expanded by threshold, via the
   spatial grid, skipping connectors (`_updateAlignCandidates`, lines 753-798).

**Liftable:** nearly the whole `snap-overlay.ts` — it's Bound/Point math; only the `Overlay`
base, viewport zoom access, grid search, and the Mindmap/Connector model checks need adapting to
our types. Strong candidate for a vendored port with an adapter (like `path-generator.ts`).

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| `ALIGN_THRESHOLD` | `8` (÷ zoom → screen-constant feel) | `snap-overlay.ts:35` |
| `DISTRIBUTION_LINE_OFFSET` | `1` | `snap-overlay.ts:36` |
| Guide `STROKE_WIDTH` | `2` (÷ zoom) | `snap-overlay.ts:37` |
| Alignment-line color | `#8B5CF6` (purple) | `snap-overlay.ts:700` |
| Distribution-line color | `#CC4187` (magenta), end-tick bar `10/zoom` | `snap-overlay.ts:723-725` |

### (d) Difficulty — **medium.** ~800 lines but almost all pure; the payoff (snap-into-equal-
spacing + chained gap guides) is the single biggest "feels like FigJam" upgrade over our current
snapping.

---

## 9. Selection chrome

### (a) Source files
- `widgets/edgeless-selected-rect/src/edgeless-selected-rect.ts` — selection rect + handle styles
  (CSS in `static styles`), resize orchestration
- `widgets/edgeless-selected-rect/src/resize-handles.ts` — `HandleDirection` enum, handle DOM,
  per-handle cursors
- `widgets/edgeless-selected-rect/src/utils.ts` — rotated-cursor generation (`generateCursorUrl`)

### (b) Pure/liftable vs bound
**Liftable:** the constants below; `HandleDirection` = 4 corners + 4 edge midpoints; rotation via
transparent corner hot-zones with dynamically generated SVG-data-URL cursors per angle (the
cursor-generation function is pure and worth porting); scale-percentage badge logic.
**Bound:** the whole Lit component tree — rebuild in React (we already render selection chrome;
this is a restyle to AFFiNE's constants).

### (c) Constants worth copying
| Constant | Value | Where |
|---|---|---|
| Selection border | `2px solid var(--affine-blue)` | `edgeless-selected-rect.ts:61-62` |
| Corner handle | `18×18` hit area, visible `12×12` circle, `border: 2px var(--affine-blue)`, white fill | same, lines 88-101 |
| Corner handle offset | `-12px` from each corner | same, lines 116-129 |
| Edge handle bar | `6px` thick, offset `-3.5px`; midpoint dot `7×7`, radius `6px`, white | same |
| Locked selection color | `edgeless/lock/locked` = `#00000085` fallback | same |
| Handle count | 8 (4 corner + 4 edge) when rotatable | `resize-handles.ts` |

### (d) Difficulty — **low.** Pure restyling + one pure cursor-URL generator to port.

---

## 10. Zoom / viewport polish

### (a) Source files
- `blocks/surface/src/consts.ts` — zoom constants
- `widgets/edgeless-zoom-toolbar/src/zoom-toolbar.ts` — toolbar UI (fit / −  / % / +; no preset
  dropdown — display is `Math.round(zoom*100)%`)

### (b)(c) Constants (verified) vs ours (`viewport.ts`)
| Constant | AFFiNE | Ours | Note |
|---|---|---|---|
| `ZOOM_MIN` | `0.1` | `0.1` | ✓ match |
| `ZOOM_MAX` | `6.0` | `4` | consider adopting 6.0 |
| `ZOOM_STEP` (buttons/hotkeys) | `0.25` | — | adopt |
| `ZOOM_INITIAL` | `1.0` | `1` | ✓ |
| `ZOOM_WHEEL_STEP` | `0.1` | — | adopt for ctrl+wheel |

Our `fitBounds`/`fitDocument`/`zoomAtPoint` already cover AFFiNE's fit logic; nothing else to
lift beyond constants and (optionally) their `smoothZoom` easing behavior (Lit-side, reimplement).

### (d) Difficulty — **trivial.** Constants only.

---

## 11. Grid / background (dot grid)

### (a) Source files
- `blocks/surface/src/utils/get-bg-grip-gap.ts` — `getBgGridGap(zoom)` (pure)
- `blocks/surface/src/consts.ts` — `GRID_GAP_MIN = 10`, `GRID_GAP_MAX = 50`
- `blocks/surface/src/surface-block.ts` (~lines 80-84) — CSS application:
  `background-image: radial-gradient(var(--affine-edgeless-grid-color) 1px, var(--affine-background-primary-color) 1px)`
  with `background-size: <gap>px <gap>px`

### (b)(c) The algorithm (verbatim, 5 lines, pure):
```ts
const step = zoom < 0.5 ? 2 : 1 / (Math.floor(zoom) || 1);
const gap = clamp(20 * step * zoom, GRID_GAP_MIN, GRID_GAP_MAX);
return Math.round(gap);
```
Base world gap `20`; screen gap held in the 10-50px band → dots **subdivide/decimate with zoom**
(hybrid world/screen sizing). Dot radius fixed `1px` screen.

### (d) Difficulty — **trivial**, and our `grid.ts` already implements an equivalent (slightly
more sophisticated, zoom-aware dot sizing). **Verdict: keep ours**; optionally align our
band/gap constants (20/10/50) with AFFiNE for identical density feel.

---

## 12. Other tools catalog (for later)

| Tool | Path | One-liner |
|---|---|---|
| Brush (pen) | `gfx/brush/src/brush-tool.ts` | freehand strokes (P) |
| Highlighter | `gfx/brush/src/highlighter-tool.ts` | translucent stroke (Shift+P), color `#84cfff4d` default |
| Eraser | `gfx/brush/src/eraser-tool.ts` | stroke/element erasing (E) |
| Lasso | — | **not present** in this checkout; selection is rect-drag only (`widgets/edgeless-dragging-area`) |
| Frame tool | `blocks/frame/src/frame-tool.ts` | drag-draw frames (F) |
| Present/navigator | `blocks/frame/src/present-tool.ts`, `blocks/frame/src/present/` | frame-by-frame presentation (uses `presentationIndex`) |
| Template | `gfx/template/src/template-tool.ts` | drop pre-built template groups |
| Mindmap | `gfx/mindmap/` | structured mind-map with auto-layout |
| Text | `gfx/text/src/tool.ts` | edgeless text (T) |
| Note | `gfx/note/src/note-tool.ts` | note placement (N) |
| Link/embed | `gfx/link/src/link-tool.ts` | bookmarks/embeds on canvas |
| Pan | `gfx/pointer/src/tools/pan-tool.ts` | hand tool (H/space) |
| Turbo renderer | `gfx/turbo-renderer/` | viewport-culled canvas rendering pipeline (perf reference for later) |

---

## Top-5 highest-leverage lifts

1. **Snap distribution algorithm** → `gfx/pointer/src/snap/snap-overlay.ts` — snap-*into*-equal-
   spacing + chained gap guides + 9-way pair matching; near-pure Bound math; the biggest
   FigJam-feel upgrade over our existing `snapping.ts`.
2. **ConnectionOverlay + getAnchors** → `gfx/connector/src/connector-manager.ts:133-159, 851-1080`
   — the complete quick-connect decision cascade (ports on real shape outlines, 8px anchor snap,
   relative-coordinate connections that track moving shapes); composes directly with our vendored
   `path-generator.ts`.
3. **Shape geometry API** → `model/src/elements/shape/api/*.ts` — per-shape
   points/draw/hit-test/nearest-point/line-intersections; feeds #2 (anchors need
   `getLineIntersections`) and gives us the pattern for FigJam's larger shape catalog.
4. **Connector render layer** → `gfx/connector/src/element-renderer/{index,utils}.ts` — rounded
   corners are just `lineJoin='round'` (no radius math to invent), bezier curve mode via
   `absIn/absOut`, verbatim-portable arrowhead math + all stroke/arrow constants.
5. **Frame model + capture semantics** → `model/src/blocks/frame/frame-model.ts` +
   `blocks/frame/src/frame-manager.ts` — explicit `childElementIds` membership, top-most
   `getFrameFromPoint` capture-on-create, `FRAME_PADDING=40` wrap, fractional presentation
   ordering, title-chip constants — with the caveat that FigJam's move-children-on-drag is ours
   to add.

## Do NOT lift (write fresh / skip)

- **Element toolbar internals** (`widgets/toolbar/`) — mirror the *registry data structure* and
  offset constants only; every `content()` is Lit `html`, and `ToolbarContext` drags in
  std/store. Cheaper to write our React toolbar against the per-type action lists in §5.
- **Note block architecture** (`blocks/note/`) — a rich-text block container (role `hub`), not a
  sticky; take the style constants (§7), keep our own model.
- **RoughCanvas / "Scribbled" style** — pulls in the `roughjs`-style renderer; FigJam parity
  doesn't need it.
- **Grid background** — ours is already equivalent-or-better; align constants at most.
- **Color hexes via `@toeverything/theme` import** — D32 violation; vendor the ~40 key→hex pairs
  from the npm package (MIT) into a local constants file instead.
- **Label text layout in connector renderer** — depends on their rich-text delta pipeline; use
  our text stack, keep only the clip-gap trick and `CONNECTOR_LABEL_MAX_WIDTH=280`.

---

*All upstream files are MPL-2.0 (BlockSuite). Any verbatim/near-verbatim port must be added to
`apps/frontend/src/lib/vendor/blocksuite/NOTICE` with its upstream path, per the existing
convention.*
