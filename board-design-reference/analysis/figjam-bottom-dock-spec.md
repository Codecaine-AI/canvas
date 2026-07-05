# FigJam Bottom Dock — Implementation Spec

> Pixel-measured from `analysis/figjam-frames/` (1476×1080, fj-001–089). Companion to
> `figjam-chrome-catalog.md` — this file is the higher-precision source for the bottom dock
> specifically. Estimate/guess items are flagged inline.

## Architectural corrections vs. earlier assumptions

- **The dock is WHITE/light, not dark.** The dark pill toolbars in the recording are the
  *floating contextual toolbars* above selected objects — a separate component.
- **No flyout opens directly above the dock.** The shape button opens a full-height
  LEFT-docked panel; the dark popovers (palette, shape-search) anchor to the floating
  contextual toolbar, not the dock.
- **No right-side panel exists anywhere in the recording.**

## Geometry

- Bounding box ≈ x 507–969, y 1032–1069 → **462 × 37 px**, bottom-centered.
- **True stadium/pill**: corner radius ≈ 18–19px (= height/2), verified by edge-recession
  sampling (left edge x=515 at y=1034/1068 → x=509 at y=1042–1058).
- Background **#FDFDFD** mid-bar → #FFFFFF near bottom (sampled).
- Shadow: soft ~2px penumbra, ~10–30 RGB-units darkening at y≈1070–1071 (the darker band
  at y≈1074+ is browser chrome, not the dock's shadow). Estimate: small-blur low-opacity
  box-shadow.
- Buttons are "naked" glyphs on the shared pill (no per-button boxes at rest), glyph color
  ≈ RGB(45–60) charcoal. Exception: the "+" button has a persistent light-gray circular
  background (static style, confirmed across independent frames).

## Button inventory (left → right, resting state; fj-005 reference)

| # | Icon | x-range | center x | Notes |
|---|------|---------|----------|-------|
| 1 | Selection arrow | 505–548 | ~527 | active tool in fj-001–044 |
| 2 | Hand (pan) | 548–585 | ~567 | |
| 3 | Pen/marker | 605–645 | ~625 | conical black tip, silver barrel |
| 4 | Highlighter | 636–685 | ~660 | static light-blue fill in artwork (RGB ≈ 150–190, 210–235, 250–255) |
| 5 | Square outline (shapes) | 695–730 | ~712 | opens LEFT-docked Shapes panel |
| 6 | Curved arrow (connector) | 730–765 | ~747 | |
| 7 | "T" text | 778–810 | ~794 | |
| 8 | Sticky note | 815–850 | ~832 | folded top-right corner glyph |
| 9 | Table/grid | 855–890 | ~872 | |
| 10 | Stamp | 890–925 | ~908 | |
| 11 | Comment bubble | 912–948 | ~930 | |
| 12 | Widgets | 948–980 | ~964 | two diamonds + circle + small "+" |
| 13 | "+" overflow | ~1015–1050 (estimate) | ~1032 | own gray circular bg |

No chevrons baked into any icon artwork.

## Grouping — whitespace only, NO divider lines

(Verified: zero divider strokes at all candidate gap positions.)

- **A nav**: arrow, hand · *gap ~20px*
- **B draw**: pen, highlighter · *gap ~10px*
- **C shapes/connect**: square, curved-arrow · *gap ~13px*
- **D content**: T, sticky, table, stamp, comment, widgets (one 6-button cluster,
  ~13–18px spacing) · *gap ~35–50px (estimate)*
- **E overflow**: "+" isolated far right

## States

- **Active tool**: solid violet rounded-square (family ~#7B61FF–#8B5CF6 — exact hex NOT
  sampled, flag), inset within the button column, radius ≈ 8–10px.
- **Hover**: flat light-gray rounded-square (~RGB 230–240, estimate). Ground truth:
  fj-045 (hand hovered while arrow active) → fj-046 (hand becomes active). Second
  instance fj-051/052 (shape button, lower confidence — one dissenting pass).
- **Pressed**: not distinguishable at 2fps — not observed.
- **Modal active-state rule**: from fj-053 (Shapes panel open) THROUGH END, NO dock button
  shows the violet active state — the dock relinquishes its highlight when another surface
  owns the mode. Clone must model tool-highlight as modal, not sticky.

## Dock-triggered flyout: the Shapes panel

Clicking button 5 → full-height LEFT-docked white panel (x≈8–197), open fj-053–~073/077
(close frame unresolved to single-frame precision). Contents: "Shapes" header + ×,
"Search shapes" input (purple focus ring), collapsible sections: Recents (7–8),
Connections (4), Basic (12), Flowchart (12–20), Advanced (12), footer "Other libraries":
AWS 805 / Azure 637 / Cisco 292 shapes. The dock remains visible and unchanged while open.

## Stability

- Button set and geometry are pixel-identical across all 89 frames (diff-verified,
  0–24 RGB compression noise only).
- Dock invisible ONLY at fj-077/078 — a viewport-framing artifact, not a UI toggle
  (reappears unchanged fj-079+). The "Show/Hide UI" menu item seen at fj-084 was never
  invoked.
- The floating contextual toolbar never displaces the dock; they coexist.

## Flagged estimates for the build

Exact hexes for active-violet and hover-gray (sample from our own implementation of the
palette family / re-verify against frames); "+" button x-range; fj-051/052 hover; Shapes
panel close frame; scene-01/02 wide shots lack the dock (treat as crop artifact).
