# Object Definition Overhaul — Understanding Document

**Status:** v9 — **implemented** (P0–P4 all landed 2026-07-08). Decisions D1–D19 are
locked; changes to them require reopening here first.
**Scope:** how objects/shapes are defined (`packages/canvas/src/objects/`), text slots,
connection anchors, and a semantic color system.
**Companions:** `docs/10-system-design/10-shape-api/` (current shape contract),
`board-design-reference/analysis/figjam-style-spec.md` (sampled ground truth).

---

## 1. Current state

### 1.1 The registry today

Two-tier system, mid-migration:

- **Tier 1 — `ObjectDef`** ([object-def.ts:147](packages/canvas/src/objects/object-def.ts)):
  `kind, render, css, defaults, handles, hitTest, dragCapture, labelEditing, toolbar?`.
  Special defs for section / sticky / code-block / connector (connector is a
  "selection kind" — its `render` is never dispatched; it exists to carry a toolbar).
- **Tier 2 — `ShapeDef`** ([shape-def.ts:14](packages/canvas/src/objects/shapes/shape-def.ts)):
  data-only variant spec (`type, shape, outline, text, anchors?, defaultSize, defaultTone,
  css?, catalog`) adapted into an ObjectDef by `shapeObjectDef()`
  ([base.tsx:16](packages/canvas/src/objects/shapes/base.tsx)). All shapes share one
  toolbar, `handles:"all"`, `hitTest:"solid"`, `labelEditing:{target:"label"}`.

Consumers: render dispatch ([ObjectShape.tsx:19](packages/canvas/src/render/ObjectShape.tsx)),
CSS composition ([CanvasStage.tsx:428](packages/canvas/src/render/CanvasStage.tsx)),
resize handles ([SelectionBox.tsx:73](packages/canvas/src/render/overlays/SelectionBox.tsx)),
drag capture ([move.ts:48](packages/canvas/src/interaction/gestures/move.ts)),
label-edit target ([use-label-editing.ts:105](packages/canvas/src/editor/features/label-editing/use-label-editing.ts)),
toolbar ([use-selection-toolbar.ts:94](packages/canvas/src/editor/features/selection-toolbar/use-selection-toolbar.ts)).

**What a shape author must touch today (the tribal-knowledge problem):**

| # | Artifact | Location |
|---|----------|----------|
| 1 | ShapeDef file | `objects/shapes/{category}/{name}.tsx` |
| 2 | Register in `OBJECT_DEFS` | `objects/object-def.ts` |
| 3 | Catalog entry (duplicates `ShapeDef.catalog`) | `objects/catalog.ts` |
| 4 | Type union | `state/schema/object-types.ts` |
| 5–8 | Four parallel switches: geometry / label / tone / shape | `state/actions/defaults.ts` |
| 9 | Outline polygon for anchors/snap | `routing/connection-overlay.ts` `outlineShapeFor()` |
| 10 | Picker preview glyph | `editor/components/shape-previews.tsx` |

Items 3, 5–8, 9 are pure duplication of data the def already declares (or should).
`ObjectDef.defaults` is declared but unconsumed (RESTRUCTURE step 6 pending);
`ShapeDef.anchors` is declared but consumed by nothing.

### 1.2 Text today

Schema fields: `label` (all), `body?` (all), `title?` (section), `author?` (sticky),
plus `language`, `icon`, `direction` ([objects.ts:18](packages/canvas/src/state/schema/objects.ts)).

At-rest rendering is per-kind and partially declared (`ShapeDef.text: TextZoneSpec` —
`"label" | "label-below-icon" | "none"`, compact thresholds, per-shape `labelStyle`).
But the inline editor ignores all of it: **the textarea always overlays the full object
bbox** ([LabelEditingOverlay.tsx:140](packages/canvas/src/editor/features/label-editing/LabelEditingOverlay.tsx)).

| Kind | Text renders | Editor appears | Match |
|------|--------------|----------------|-------|
| Generic shape | centered `label` (+ small `body` below) | full bbox | ≈ ok |
| Arrow / chevron | `label` offset by `labelStyle` margins | full bbox | ✗ |
| Person / chat / icon | `label` below the glyph (bottom band) | full bbox | ✗ |
| Sticky | `body` in inset area, bullets | full bbox | ≈ ok (target right, rect wrong) |
| Section | `title` chip, top-left, zoom counter-scale | chip-exact: same position, scale fn, width heuristic | ✓ |
| Code block | `body` as tokenized lines; label never renders | full bbox editing `label` | ✗ |
| Connector | label chip at routed midpoint | same routed point, counter-scaled | ✓ |

**Sections and connectors prove the model:** when the editor derives its rect/scale/
typography from the same source as the renderer, editing is WYSIWYG. The overhaul
makes that the rule for every kind.

### 1.3 Connection anchors today

Endpoint schema ([connections.ts:7](packages/canvas/src/state/schema/connections.ts)):
`{ objectId, anchor?: "top"|"right"|"bottom"|"left"|"center", position?: [0..1, 0..1] }` —
coarse side always stored, exact normalized point only when off-midpoint.

Attachment is already sophisticated:

- **Snap cascade** ([connection-overlay.ts:630](packages/canvas/src/routing/connection-overlay.ts)):
  anchor (8 view px) → outline (8 world px) → inside → free; topmost object wins.
- **True-outline anchors** ([connection-overlay.ts:555](packages/canvas/src/routing/connection-overlay.ts)):
  ray from center per cardinal direction, intersected with the shape's real outline
  polygon. ~18 shapes have real polygons (diamond, ellipse, star, chevron, trapezoid…);
  everything else falls back to bbox side-midpoints.
- Routing resolves anchors via explicit `position` → explicit `anchor` → `autoPickAnchors`
  facing-sides ([routing.ts:67](packages/canvas/src/routing/routing.ts)).
- **Affordances today:** the 4 side-midpoint ports on a selected object are *invisible*
  (opacity 0, crosshair cursor only —
  [CanvasStage.tsx:395](packages/canvas/src/render/CanvasStage.tsx)); visible anchor
  dots appear only mid-drag on the hovered *target* object
  ([ConnectorDragPreview.tsx](packages/canvas/src/render/connectors/ConnectorDragPreview.tsx)).

**The gap is declaration, not capability:** all per-shape outline geometry lives in a
hardcoded `outlineShapeFor()` switch in the routing layer, keyed by shape name, parallel
to the shape defs. `ShapeDef.anchors` exists but is dead.

### 1.4 Color today

Four disjoint vocabularies, three pickers:

| System | Stored as | Swatches | Used by |
|--------|-----------|----------|---------|
| Palette tokens (5: process/input/hot/memory/note) | `style.paletteToken` | 22-swatch popover → `nearestPaletteToken()` | shapes, stickies |
| Legacy tones (8) | `style.tone` | none (agent/API only) | fallback ladder |
| Section tints (10 families: tint/chipFill/chipBorder) | `object.tint` | 10 circles | sections |
| Connector hexes (6) | `connection.color` (raw hex) | 6 flat row | connectors |

Resolution ladder ([theme.ts:148](packages/canvas/src/theme.ts)): explicit
`style.fill`/`stroke` → `paletteToken` (color-mix w/ theme vars; exact hex override for
stickies) → `tone` → neutral.

Known problems:

- **The 22-swatch picker collapses to 5 colors.** Every pick is mapped by hue distance
  to one of 5 tokens ([palette.ts:56](packages/canvas/src/objects/palette.ts)) — most of
  the picker is cosmetic. This is the root of "color picking feels off".
- Sticky hexes duplicated in `theme.ts` and `objects/sticky/colors.ts` with an
  "update both" comment (layering: theme can't import objects/).
- Connector swatches partially disagree with the shape picker's saturated row
  (orange `#EB7500` vs `#FF9E42`, green `#3E9B4B` vs `#14AE5C`).
- Selection blue `#0D99FF` and board background `#F5F5F5` hardcoded in several files.
- `SECTION_FAMILIES` is already the FigJam model in miniature — one pick, three
  role expressions (tint / chipFill / chipBorder) — but only for sections.

---

## 2. Decisions locked (2026-07-07)

- **D1 — Visual palette replaces semantic color.** Objects store one visual color name
  (e.g. `"red"`). The 5 palette tokens and 8 tones are removed from storage; they
  survive only as a migration mapping (e.g. `memory → purple`, `process → blue`).
- **D2 — Fixed hexes.** The palette is one canonical FigJam-sampled hex table (like
  `SECTION_FAMILIES` today). No color-mix/theme adaptivity for board content; the board
  is light-only by prior decision.
- **D3 — One text field per object.** Consolidate `label`/`body`/`title` into a single
  `text` field; the object's def declares where and how it renders and is edited.
  (Migration details → O3.)
- **D4 — Outline is the geometric primitive.** The def declares the shape's outline;
  anchors, outline-snap (and potentially hit-testing) derive from it. The
  `outlineShapeFor()` switch moves into the defs.
- **D5 — Visible anchor dots, FigJam-style.** Anchor points render as the default blue
  dots on objects (like FigJam's selected-shape affordance), not the current invisible
  ports. Dots are drawn at the def-declared anchor positions, so declared anchors and
  visual affordance can never disagree. (Exact visibility triggers → O11.)
- **D6 — Text placement is a shared preset library.** Text slots are declared by picking
  from a small named library of placements rather than per-shape ad-hoc CSS. Baseline
  typography for shape text: **center-justified, bold**; placement varies per def
  (inside the body for most shapes, below the glyph for icon-like shapes, inset body
  for stickies, title chip for sections).
- **D7 — Palette = FigJam's picker, verbatim, closed.** The roster is FigJam's 2×11
  color popover minus the custom-color wheel: row 1 bold/saturated (black, gray, red,
  orange, yellow, green, teal, blue, violet, pink, white), row 2 soft/pastel variants
  (light grays + pastel of each hue) — **21 swatches, no custom colors, ever**. Bold
  and soft are distinct picks (e.g. `red` vs `red-soft`), stored as-is.
- **D8 — One text color.** All object text is dark/near-black. No per-color text
  derivation, no white-on-saturated, no user-pickable text color.
- **D9 — Background is not user-changeable.** Board stays fixed `#F5F5F5`; `background`
  is dropped from the role list (can return later if needed).
- **D10 — Hard color migration, no backwards compatibility.** One-time migration of
  existing documents; `tone`, `paletteToken`, raw `style.fill`/`stroke`, section
  `tint`, and connector hex `color` are all **removed from the schema**. No legacy
  read path, no explicit-color escape hatch.
- **D11 — One `text` field, per-kind rendering.** Every object stores its text in a
  single `text` field; the kind decides rendering: sections render it as the top-left
  title chip, code blocks parse it per `language`, stickies render simple markdown
  (scope → O15), shapes render it in their text slot. Connections keep their separate
  `label`. Migration: section `title ?? label` → text; sticky/code `body` → text;
  shapes `label` → text (non-empty `body` appended on a new line so no content is
  lost). Sticky `author` stays its own field.
- **D12 — Universal roster: 20 swatches, identical previews for every kind.** Black is
  dropped as a fill color → 2 clean rows of 10 (bold row gray→white, soft row). Every
  kind — shapes, stickies, sections, connectors — offers all 20, and the picker
  preview shows the *swatch color itself* for all of them: a pick is a direction
  ("dark red"), and the kind's role table decides how it actually renders. No
  sticky-specific subset.
- **D13 — No forced colors anywhere.** Glyph shapes (person etc.) lose their fixed
  icon colors; every object can be any color — that's the point. New-object default
  color mechanism → O14 (fixed default vs last-picked).
- **D14 — Text edits in place.** No gray-out, no visually distinct overlay: editing
  happens exactly where and how the text renders — same slot, same typography, with a
  caret. (Stronger than the current hide-at-rest-text + textarea approach.)
- **D15 — Zoom-gated affordances.** Selection shows resize corners at any zoom, always.
  Anchor dots (and the future add-next-object affordance, §7) appear only past a zoom
  threshold, FigJam-style. Threshold value = tuning task.
- **D16 — Hit-testing derives from the outline.** Clicks respect the def-declared
  outline: a diamond's empty corners click through to what's behind. Bbox-outline
  kinds behave exactly as today (their outline *is* the bbox), so this only changes
  the true-outline shapes. The separate `hitTest` field disappears.
- **D17 — Last-picked color default.** New objects take whatever color was last picked
  (FigJam-style memory) — remembered per kind (sticky / shape / section / connector)
  so a red connector doesn't make the next sticky red; per-kind first-use fallbacks
  (sticky → yellow, shape → gray-soft, section → gray, connector → gray).
- **D18 — Sticky markdown scope.** H1–H3, bullet points, bold, and (maybe) inline
  code — just enough to style sticky text without needing a style bar. Nothing else
  (no links, images, tables, nesting).
- **D19 — `ConnectorDef` splits out of `ObjectDef`.** Connectors are not objects —
  they're what connects objects. They get their own small definition type (toolbar,
  connector color role, label-at-routed-midpoint); `ObjectDef` becomes objects-only
  with no stub fields.
- **D20 — Two-box model for below-slot text (2026-07-08, refines D11/D15's below
  placement; FigJam-verified).** Stored geometry is the GLYPH box only — resize
  handles and selection wrap the glyph; text never changes geometry. The text band is
  its own box below the glyph: centered on it, allowed to wrap WIDER than the glyph,
  growing downward freely (no ellipsis — the ellipsis rule applies only to
  inside-the-shape placements like center/inset). Connections use the extended box =
  glyph ∪ band: top/side anchors on the glyph, bottom anchor below the text ("the
  line connects to the text"). Hit-testing includes the band; marquee stays
  geometry-based.
- **D21 — Retire `person`/`chat`/`chip-icon` as standalone types (2026-07-08).** The
  three bespoke glyph shapes are removed from the closed vocabulary and replaced by
  the parameterized `icon` type with existing glyphs (`person`, `chat`, `cpu` — all
  already in `CanvasIconGlyph` + vendored). Hard migration per D10: documents convert
  `person → icon/person`, `chat → icon/chat`, `chip-icon → icon/cpu`, preserving
  geometry/text/color. Catalog keeps three picker entries (Person/Chat/Chip) that
  stamp the `icon` type with the right glyph. Type count 35 → 32; the below-slot
  family becomes just `icon`.

## 3. Data models (proposed final — pending overall sign-off)

### 3.1 The palette (D1 + D2 + D7)

The roster is FigJam's color popover minus the custom wheel and minus black (D7 + D12):
**20 swatches in 2 rows of 10** — bold and soft variants are distinct picks, and the
swatch id is the stored color.

```ts
type CanvasHue =
  | "gray" | "red" | "orange" | "yellow" | "green"
  | "teal" | "blue" | "violet" | "pink" | "white";   // black dropped (D12)

type CanvasColor = CanvasHue | `${CanvasHue}-soft`;   // 20 ids, the 2×10 picker grid
// (exact soft-row mapping for the gray/white column — FigJam's row 2 has two light
// grays — gets fixed during the sampling pass)

interface Swatch {
  swatch: string;      // the hex shown in the picker (identical preview for all kinds)
  // Per-role expression cells (§3.2), e.g. for "red-soft":
  shape: { fill: string; border: string | null };  // #FFC7C2 / #F24822; bold: border null
  section: { tint: string; chip: { fill: string; border: string } };
  sticky: string;                                   // exact sticky fill hex
  connector: string;                                // stroke hex
}
```

One table, defined once, in a leaf module importable by both `theme.ts` and `objects/`
(fixes the sticky-hex duplication). Working expectation from FigJam sampling
(`figjam-style-spec.md` §2/§4/§5): a **soft** pick on a shape = pastel fill + same-hue
saturated border (today's `PASTEL_PAIRS`); a **bold** pick = saturated fill, borderless
(white keeps a visible border). Every kind offers every swatch (D12), so **every cell
must be filled**: existing `SECTION_FAMILIES` / `STICKY_COLORS` / `CONNECTOR_COLORS`
hexes cover most; cells FigJam has no native sample for (e.g. bold section rows, sticky
fills beyond the classic set) get derived hexes in the same spirit — one sampling +
derivation pass (task, not a decision).

### 3.2 Roles

A role is *how an object kind expresses a color pick*. Role set (post D8/D9 — text
roles collapsed to one fixed color, background dropped):

| Role | Expression | Today's source |
|------|-----------|----------------|
| `shape-fill` / `shape-border` | soft: pastel fill + saturated border; bold: saturated fill, borderless | PASTEL_PAIRS, figjam-style-spec §4 |
| `sticky-fill` | exact sticky hex | STICKY_COLORS |
| `section-fill` | lightest tint wash | SECTION_FAMILIES.tint |
| `section-chip` | chip fill + border (chip fill = section border color) | SECTION_FAMILIES |
| `connector-stroke` | stroke hex | CONNECTOR_COLORS |
| *text (all kinds)* | **fixed dark/near-black** (D8) — not a per-color cell | — |

Board background: fixed `#F5F5F5`, not a role (D9). Selection blue stays UI chrome,
outside the palette.

Storage becomes uniform: `object.color?: CanvasColor` and `connection.color:
CanvasColor`. One picker component everywhere — the 2×10 grid, identical for every
kind including the preview colors (D12); the def names only which role table applies.
Migration is one-shot and total (D10): `tone`/`paletteToken` → nearest swatch, raw
fills/strokes → nearest swatch, section `tint` names → same-hue swatch, connector
hexes → nearest swatch; the old fields are deleted from the schema and validator.

### 3.3 Text slot — a placement library (D3 + D6)

The invariant that fixes editing: **renderer and editor consume the same slot
descriptor.** Sections already work this way; generalize it.

Placement is a small shared library of named presets — a def *picks* a placement, it
doesn't invent one:

```ts
type TextPlacement =
  | "center"        // inside the shape body, centered — the default for shapes
  | "below"         // band under the glyph (person, chat, icon shapes)
  | "inset-body"    // padded multi-line body area (sticky)
  | "title-chip"    // floating chip, top-left, zoom counter-scale (section)
  | { rect: (object: InteractiveCanvasObject) => LocalRect };  // escape hatch
                    // (arrow/chevron: body-rect minus head/notch, replacing labelStyle margins)

interface TextSlot {
  placement: TextPlacement;
  typography: TextStyleToken;         // baseline for shapes: center-justified, BOLD;
                                      // presets carry their own (sticky body, chip, …)
  zoom: "natural" | "chip-scale";     // title-chip counter-scales; everything else natural
  compactBelowHeightPx?: number;      // hide text under this height (person: 100)
  multiline: boolean;                 // sticky: yes; section title: no
}
```

Each preset defines both halves in one place: the at-rest render (rect, alignment,
typography) and the editor (same rect, same typography). Adding a placement to the
library automatically makes editing correct for every def that uses it. Editing is
**in place** (D14): no dimming, no visually distinct overlay — at rest and mid-edit
the text looks identical, caret aside. The `inset-body` preset (sticky) renders simple
markdown (scope → O15).

Replaces: `TextZoneSpec`, `labelStyle` margin hacks, and `LabelEditingSpec.target`
(single `text` field makes "which field" moot — the def keeps only `editable: boolean`).

### 3.4 Outline & anchors (D4)

```ts
type OutlineSpec =
  | { kind: "bbox" }                                     // default
  | { kind: "polygon"; points: (g: Geometry, o: object) => Point[] }  // diamond, star, …
  | { kind: "ellipse" };                                  // parametric, dense polygon

interface AnchorSpec {
  /** Default: 4 cardinal rays from center ∩ outline (existing behavior). */
  points?: (g: Geometry) => NormalizedPoint[];            // explicit override, rare
}
```

Consumers: `getConnectionAnchors`, outline snap, drag-preview dots — all currently in
`routing/connection-overlay.ts` — look up the def instead of switching on shape name.
Endpoint schema is untouched (anchor + optional position already covers this).

**Affordance (D5):** the def-declared anchor points render as FigJam-style blue dots on
the object — replacing today's invisible ports. One source of truth: the dots you see,
the ports you grab, and the points connections snap to are all the same declared
anchors. The existing mid-drag preview dots keep working but read from the def too.
Silhouette SVG rendering stays separate from outline (a silhouette is visual; the
outline is the connection/hit geometry) — but they should be defined side-by-side in
the def and cross-checked by test.

### 3.5 ObjectDef v2 (sketch)

```ts
interface ObjectDef {
  kind: string;
  render: ComponentType<ObjectRenderProps>;
  css: string;
  defaults: ObjectDefaults;          // finally consumed; defaults.ts switches deleted
  outline: OutlineSpec;              // NEW (D4) — also drives hit-testing (D16)
  anchors?: AnchorSpec;              // NEW — defaults to 4-side ray model
  textSlot: TextSlot;                // NEW (D3/D11) — every object has text
  colorRole: "shape" | "sticky" | "section";  // NEW (D1/D12) — which role table
                                     // applies; roster is universal, new-object color
                                     // comes from last-picked memory (D17)
  handles: "all" | "corners" | "none";
  // (no hitTest field — hit-testing derives from `outline`, D16)
  dragCapture: "descendants" | "none";
  toolbar?: ToolbarSpec;
  catalog?: CatalogMeta;             // single source; catalog.ts derives (O7)
}
```

And separately, honest and small (D19):

```ts
interface ConnectorDef {
  toolbar: ToolbarSpec;              // color / dash / routing / arrowhead
  colorRole: "connector";
  labelEditing: "routed-midpoint";   // input at routeConnection().labelPoint
}
```

End state for "add a shape": **one file** — a ShapeDef with outline, text slot, colors,
catalog, defaults — plus the type-union entry. Registry, defaults, anchors, picker,
and catalog all derive. Items 3, 5–9 from the §1.1 table are deleted.

### 3.6 End-state file tree

Annotations: `NEW` / `CHANGED` / `SHRUNK` / `DELETED` / `RENAMED`; unchanged areas
elided with `…`. Two placement calls worth flagging: the palette lives as a top-level
leaf (`palette.ts`) so `theme.ts`, `objects/`, and `editor/` can all import it without
layering violations; and routing reaches def outlines through a **pure, React-free**
`objects/geometry.ts` (a new routing→objects/geometry edge in the boundary tests —
routing must not import def *components*, only geometry).

```
packages/canvas/src
├── palette.ts                    NEW (P0) — 20-swatch table + per-role resolvers
│                                   (leaf data module; no imports from canvas layers)
├── theme.ts                      SHRUNK — toneMix, PALETTE_TOKEN_HUE, STICKY_TOKEN_FILL,
│                                   SECTION_FAMILIES all deleted (→ palette.ts)
├── state/
│   ├── schema/
│   │   ├── colors.ts             NEW — CanvasHue / CanvasColor ids (stored vocabulary)
│   │   ├── object-types.ts       unchanged — the closed type union
│   │   ├── objects.ts            CHANGED — single `text` replaces label/body/title;
│   │   │                           `color?: CanvasColor`; `author`/`language`/`icon`/
│   │   │                           `direction` stay
│   │   ├── connections.ts        CHANGED — `color: CanvasColor` (was raw hex); keeps `label`
│   │   └── style.ts              SHRUNK — fill/stroke/tone/paletteToken deleted;
│   │                               shape + strokeStyle/strokeWidth remain
│   └── actions/
│       └── defaults.ts           DELETED (P4) — the 4 switches replaced by def.defaults
├── objects/
│   ├── object-def.ts             CHANGED — ObjectDef v2 (outline, textSlot, colorRole,
│   │                               no hitTest) + ConnectorDef type + registry
│   ├── text-slots.ts             NEW — placement preset library (center / below /
│   │                               inset-body / title-chip / rect); render + editor
│   │                               both consume it
│   ├── geometry.ts               NEW — pure outline helpers + per-def outline lookup
│   │                               (React-free; the surface routing consumes)
│   ├── palette.ts                DELETED — nearestPaletteToken obsolete (closed roster)
│   ├── catalog.ts                SHRUNK (P4) — picker structure derives from def.catalog
│   ├── object-chrome.tsx         CHANGED — zoom-gated anchor dots replace invisible
│   │                               EdgePorts; colors via palette roles
│   ├── section/
│   │   └── def.tsx               CHANGED — title-chip text-slot preset; palette roles
│   ├── sticky/
│   │   ├── def.tsx               CHANGED — inset-body preset; palette roles
│   │   ├── markdown.tsx          NEW — simple-markdown renderer (D18), shared by
│   │   │                           at-rest render and in-place editor
│   │   └── colors.ts             DELETED — sticky cells live in palette.ts
│   ├── code-block/
│   │   └── def.tsx               CHANGED — tokenizes `text` (was `body`)
│   ├── connector/
│   │   └── def.ts                CHANGED — becomes the ConnectorDef instance (D19)
│   └── shapes/
│       ├── shape-def.ts          CHANGED — `outline` required; `text` → slot preset;
│       │                           labelStyle removed
│       ├── base.tsx              CHANGED — slot-driven text rendering
│       ├── toolbar.ts            unchanged
│       ├── pastels.ts            DELETED — pairs live in palette.ts
│       └── basic|flowchart|icon|misc/*.tsx
│                                 CHANGED — each def declares outline + text slot
│                                   (person: outline bbox, slot "below", no fixed colors)
├── routing/
│   ├── routing.ts                unchanged behavior (byte-identical paths)
│   ├── connection-overlay.ts     SHRUNK — outlineShapeFor() switch deleted; consumes
│   │                               objects/geometry.ts
│   └── …                         unchanged
├── render/
│   ├── CanvasStage.tsx           SHRUNK — hardcoded palette bits gone; base CSS stays
│   ├── ObjectShape.tsx           unchanged — registry dispatch
│   ├── overlays/
│   │   ├── SelectionBox.tsx      CHANGED — hosts/renders AnchorDots
│   │   └── AnchorDots.tsx        NEW — D5/D15 blue dots from declared anchors
│   └── connectors/…              CHANGED — CanvasColor stroke; preview dots read defs
├── interaction/…                 CHANGED — hit-testing consults outline (D16); gestures
│                                   otherwise unchanged
└── editor/
    ├── components/
    │   ├── ColorPicker.tsx       NEW — the one 2×10 picker (replaces
    │   │                           ColorPalettePopover + section/connector variants)
    │   └── shape-previews.tsx    SHRUNK — glyphs derive from def outlines where possible
    └── features/
        ├── selection-toolbar/
        │   └── flyouts/…         SHRUNK — one shared color flyout for every kind
        └── text-editing/         RENAMED from label-editing/ — in-place editor
            └── …                     positioned/styled by the def's text slot
```

Repo level:

```
canvases/*.json                   MIGRATED once (P1 color, P2 text) — then old fields invalid
tools/migrate-canvas-docs/        NEW — the one-shot migration script (deleted after run,
                                    or kept for external documents)
docs/…                            UPDATED (P4) — how-to-add-a-shape page; shape-api,
                                    model, routing, render docs refreshed
OBJECT-DEF-OVERHAUL.md            this doc — retired into docs/ at P4
```

## 4. Open decisions

### Resolved

- **O1 — Palette roster.** ✓ FigJam's picker verbatim minus the custom wheel (D7).
  Remaining *task*: sample exact hexes for cells not already in
  `figjam-style-spec.md` / existing tables.
- **O2 — Text color derivation.** ✓ Moot — one fixed dark text color everywhere (D8).
  (b) connector hexes: folded into O12 (per-kind expression cells).
- **O4 — Color migration & escape hatches.** ✓ Closed palette, hard one-time migration,
  legacy fields deleted, no escape hatch (D10).
- **O6 — Background as a role.** ✓ Not user-changeable; fixed `#F5F5F5` (D9).
- **O3 — Text migration.** ✓ Unified `text` field with per-kind rendering (D11).
  Sections `title ?? label`, sticky/code `body`, shapes `label` (+ `body` appended so
  nothing is lost); `author` stays a separate sticky field.
- **O7 — Catalog unification.** ✓ Yes — `def.catalog` is the single source; the picker
  structure derives from the registry. (Whether preview glyphs can derive from the
  silhouette stays a nice-to-have inside the task.)
- **O8 — Fixed-color glyph shapes.** ✓ No forced colors (D13); glyphs are ordinary
  colorable objects. Default-pick mechanism → O14.
- **O10 — Editing UX.** ✓ In-place editing (D14): no gray-out, text edits exactly as
  it renders.
- **O11 — Anchor-dot visibility.** ✓ Zoom-gated (D15): resize corners always show on
  selection at any zoom; anchor dots only past a zoom threshold. Threshold value and
  exact dot styling = tuning/sampling task.
- **O12 — Per-kind swatch rosters.** ✓ Universal (D12): all kinds offer all 20
  swatches, previews identical everywhere; a pick is a direction, roles decide
  rendering. Black dropped from the roster.
- **O13 — Bold-pick expression.** ✓ Narrowed to the sampling task: bold = saturated
  borderless fill (working assumption to confirm), white keeps a visible border,
  black no longer exists (D12).

- **O5 — Hit-testing from outline.** ✓ Yes — hit-testing derives from the def outline
  (D16); diamond corners click through.
- **O14 — Default color mechanism.** ✓ Last-picked, per-kind memory, with first-use
  fallbacks (D17).
- **O15 — Sticky markdown scope.** ✓ H1–H3, bullets, bold, maybe inline code (D18) —
  style without a style bar.

- **O9 — Split `ConnectorDef` out of `ObjectDef`.** ✓ Yes (D19) — connectors are what
  *connect* objects, not objects; they get their own small def type and ObjectDef
  loses all stub fields.

### Open

**None.** All decisions resolved (D1–D19). Remaining work items are tasks, not
decisions: the palette sampling/derivation pass (§3.1) and the anchor-dot zoom
threshold tuning (D15).

## 5. Constraints (unchanged, from docs/)

- Closed, typed shape vocabulary; no plugin registry.
- Single mutation authority: all changes via `CanvasAction` through the reducer.
- Agent-native document model: plain validated JSON; schema + validator are the API.
- Light board only; FigJam-sampled values are ground truth over design opinion.
- Layering: `theme`/`state` must not import `objects/`; palette table therefore lives
  in a leaf module (or in `state/schema` since colors become schema vocabulary).
- Boundary tests (`__tests__/boundaries`) encode layer imports — new modules must slot in.

## 6. Implementation plan (phased — pending sign-off)

Dependency graph: **P0 → P1**; **P2** and **P3** are independent of each other and of
P1; **P4** last. Each phase lands green (`bun test` incl. boundary tests) and is
independently shippable.

**Execution waves** (chosen so concurrent agents never touch the same files — P1/P2/P3
all edit the shape defs and schema, so only file-disjoint phases run together):

| Wave | Runs | Why safe together |
|------|------|-------------------|
| 1 | P0 ∥ P2 | P0 only creates `palette.ts`/`schema/colors.ts` + tools; P2 owns text schema/slots/editor |
| 2 | P1 | needs P0's table; touches def/render/editor files P2 just changed — runs alone |
| 3 | P3 | touches shape defs + object-def + interaction — runs alone |
| 4 | P4 | consolidation over everything prior |

Ford checkpoint: the P0 contact sheet is presented for eyeball review; palette hex
adjustments after that are data-only edits to `palette.ts` and don't block waves.

### P0 — Palette table (data only, no behavior change)

Build the 20-swatch table and role resolvers as a leaf module (importable by `theme.ts`
and `objects/` — kills the sticky-hex duplication hazard).

- Sample/derive every cell: FigJam picker + `figjam-style-spec.md` + existing
  `PASTEL_PAIRS` / `SECTION_FAMILIES` / `STICKY_COLORS` / `CONNECTOR_COLORS`; derive
  cells FigJam has no native sample for (bold section tints, extra sticky fills,
  white's border). Fix the soft-row gray mapping.
- Deliverables: palette module + role resolver functions, unit tests, and a throwaway
  **contact-sheet page** (all 20 swatches × all roles) for Ford to eyeball against
  FigJam before anything rewires. *(Ford checkpoint.)*

### P1 — Color cutover + hard migration (D1/D2/D7–D10, D12, D13, D17)

- Schema: `object.color?: CanvasColor`, `connection.color: CanvasColor`; **delete**
  `tone`, `paletteToken`, `style.fill`, `style.stroke`, section `tint`; update
  validator + types.
- One-time migration over `canvases/` documents (nearest-swatch mapping per §3.2).
- Rewire `resolveObjectColors` → role tables; section/sticky/connector render paths;
  person et al. lose fixed glyph colors (D13).
- One picker component (2×10 grid, identical previews) replaces the three flyouts;
  last-picked per-kind memory (D17) in editor state.
- Delete dead code: `nearestPaletteToken`, `PALETTE_TOKEN_HUE`, `toneMix`,
  `STICKY_TOKEN_FILL`, old swatch lists.

### P2 — Text unification + slots + in-place editing (D3, D6, D11, D14, D18)

- Schema: single `text` field; migrate `title ?? label` (section), `body`
  (sticky/code), `label` + appended `body` (shapes); keep `author`, `language`,
  connection `label`; delete the old fields; update validator.
- TextSlot preset library (`center`, `below`, `inset-body`, `title-chip`, rect escape
  hatch) — presets define at-rest render AND editor placement/typography in one place.
  Delete `labelStyle` margin hacks (arrow/chevron get slot rects).
- In-place editor (D14): renderer and editor consume the same slot descriptor; no
  gray-out. Sticky markdown renderer (D18: H1–H3, bullets, bold, maybe inline code),
  shared by at-rest render and editing.
- Editing-position tests per kind (the §1.2 mismatch table becomes the test matrix).

### P3 — Geometry into defs: outline, anchors, dots, hit-test (D4, D5, D15, D16)

- `OutlineSpec` on every def; move polygon builders out of
  `routing/connection-overlay.ts`'s `outlineShapeFor()` switch into the defs;
  connection cascade/anchors/snap consume the registry. Routing behavior must be
  **byte-identical** — gate with routing snapshot tests + the DOM-equivalence harness
  (the uncommitted registry-refactor gate).
- Anchor dots rendered from declared anchors, zoom-gated (D15), replacing the
  invisible ports; resize corners unchanged at all zooms.
- Outline-derived hit-testing (D16); drop the `hitTest` field.

### P4 — Def consolidation + docs (D19 + §1.1 cleanup)

- Wire `ObjectDef.defaults` into `state/actions/defaults.ts` consumers and delete the
  four parallel switches (finishes the stalled RESTRUCTURE step 6).
- Catalog derives from `def.catalog` (single source); shape-preview glyphs derive
  where possible.
- Split `ConnectorDef` (D19); ObjectDef loses stub fields; update boundary tests.
- Docs: new "how to add a shape" page; update `10-system-design/10-shape-api` and
  `20-implementation` docs to match; retire this working doc into `docs/`.

**End-state acceptance:** adding a new shape = one ShapeDef file + one type-union
entry; text editing is WYSIWYG on every kind; one color picker with 20 swatches
everywhere; anchors/dots/hit-test all read from the def outline.

## 7. Deferred (noted, explicitly out of scope)

- **Chain-create affordance** — a "+"-style button (visible past the D15 zoom
  threshold) that creates the next object below/beside the selection and auto-connects
  it. The reducer action already exists — `canvas.quickConnect` creates + connects a
  default object when a connector drag releases on empty canvas — so this is purely a
  discoverability affordance over existing behavior. Later task.

---

*Iteration log:*
- *v1 (2026-07-07): initial draft from codebase exploration + decisions D1–D4.*
- *v2 (2026-07-07): added D5 (visible FigJam-style anchor dots; +O11) and D6 (text
  placement as a shared preset library; shape baseline = centered + bold); recast §3.3
  around the placement library.*
- *v3 (2026-07-07): locked D7 (FigJam 2×11 picker verbatim, closed, bold+soft are
  distinct picks), D8 (one dark text color), D9 (background fixed), D10 (hard color
  migration, legacy fields deleted). Resolved O1/O2/O4/O6; reworked §3.1–3.2 around
  swatch ids; added O12 (per-kind rosters) and O13 (bold-pick expression).*
- *v4 (2026-07-07): locked D11 (unified `text` field, per-kind rendering incl. sticky
  markdown), D12 (universal 20-swatch roster, black dropped, identical previews), D13
  (no forced colors), D14 (in-place editing), D15 (zoom-gated affordances). Resolved
  O3/O7/O8/O10/O11/O12/O13; added O14 (default color) and O15 (sticky markdown
  scope); added §7 deferred chain-create affordance.*
- *v5 (2026-07-07): locked D16 (outline hit-testing, hitTest field removed), D17
  (last-picked color default, per-kind memory), D18 (sticky markdown = H1–H3 +
  bullets + bold + maybe inline code). Resolved O5/O14/O15; expanded O9 into an
  explained proposal (split ConnectorDef out of ObjectDef) — the only open item.*
- *v6 (2026-07-07): locked D19 (ConnectorDef split) — **all decisions resolved,
  open list empty**. §3 promoted to proposed-final data models (+ ConnectorDef);
  §6 replaced with the phased implementation plan (P0–P4). Awaiting overall
  sign-off.*
- *v7 (2026-07-07): added §3.6 end-state file tree (annotated), incl. the two placement
  calls: top-level `palette.ts` leaf, and routing consuming a React-free
  `objects/geometry.ts` (new boundary-test edge).*
- *v8 (2026-07-08): Ford signed off (doc + tree). Added execution waves to §6;
  implementation started (wave 1: P0 ∥ P2).*
- *v9 (2026-07-08): implementation complete — P0–P4 all landed; Status flipped to
  implemented. P4 note: the defaults table lives as schema vocabulary at
  `state/schema/object-defaults.ts` (not def-side) because the reducer needs it below
  the objects/ layer and `@codecaine-ai/canvas/actions` is a standalone public API;
  the registry stamps every `def.defaults` from it (identity-locked by
  `objects/__tests__/type-defaults.test.ts`). `state/actions/defaults.ts` DELETED;
  catalog derives labels/keywords from `def.catalog`; `ConnectorDef` split (D19);
  docs refreshed (shape-api rewritten + implementation docs updated/stale-noticed).
  Final gate: `bun test packages/canvas` 737 pass / 0 fail; tsc clean (canvas +
  studio). Retirement/placement of this doc is Ford's call.*
- *v10 (2026-07-08): docs refresh completed — `docs/10-system-design/10-shape-api`
  rewritten around the shipped system (ObjectDef v2 / ShapeDef, text slots, outlines/
  anchors/hit-testing, 20-swatch role tables, shipped file tree, how-to-add-a-shape
  with real code); model/routing/editor/chrome/render/shape-reference/studio/parity/
  overview/foundation/appendix docs updated or stale-noticed. Tests still 737/0.*
- *v11 (2026-07-08): D21 implemented — person/chat/chip-icon retired as standalone
  types, replaced by the parameterized icon type with person/chat/cpu glyphs; hard
  migration converted 13 objects across 4 canvas docs (5 person, 4 chat, 4
  chip-icon), idempotent; catalog keeps Person/Chat/Chip picker entries stamping
  icon glyphs; below-slot family is now just icon; type count 35 -> 32
  (style.shape 34 -> 31); outline-anchor + zz-dom baselines regenerated;
  canvas+studio tsc clean, suite 913/914 (1 unrelated in-flight routing test owned
  by a parallel session).*
