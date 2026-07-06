/**
 * FigJam visual constants — pixel-sampled from the user's own FigJam exports.
 *
 * Source of truth (READ THESE BEFORE CHANGING VALUES HERE):
 *   - board-design-reference/analysis/figjam-style-tokens.json (machine tokens)
 *   - board-design-reference/analysis/figjam-style-spec.md (derivations + confidence notes)
 *   - board-design-reference/analysis/parity-plan.md (W1-visual scope)
 *
 * This is a hand-written, typed mirror of figjam-style-tokens.json — not a
 * runtime codegen output. Keep the two in sync by hand; when the JSON is
 * re-sampled, update this file's literals to match and note the diff in the
 * citing comment.
 *
 * Units: every `*Px` value here is LOGICAL px (i.e. already divided by the
 * tokens JSON's `meta.scaleFactorExportPxPerLogicalPx: 2` export scale, and
 * independent of canvas zoom) unless the name says `Export`.
 *
 * This module is the single place later waves (W2/W3) should import FigJam
 * visual constants from — do not re-hardcode these values elsewhere.
 */

// ---------------------------------------------------------------------------
// Canvas surface
// ---------------------------------------------------------------------------

/**
 * Board background. FigJam's board is light-only — even our app's dark theme
 * should render the canvas SURFACE with these light values, matching Figma's
 * own behavior of never dark-theming the board itself.
 * (figjam-style-tokens.json: canvas.bg / canvas.exportBg)
 * FLAGGED FOR USER FEEDBACK: forcing a light board under a dark app theme is
 * an intentional FigJam-parity call, not a neutral default — confirm this is
 * the desired product behav7ior once seen live.
 */
export const CANVAS_BG = "#F5F5F5";
/** Exports render the canvas as pure white; never use this for the live app surface. */
export const CANVAS_EXPORT_BG = "#FFFFFF";

/**
 * Dot grid. FigJam's grid is adaptive: a base 8 logical-px grid that
 * doubles/halves (powers of two) so the ON-SCREEN dot pitch stays inside a
 * comfortable band, rather than our previous density-stepping law which
 * pinned a 32px *world* base step into a [24,64]px screen band.
 *
 * Ground truth observations (figjam-style-tokens.json: canvas.gridDot.observed):
 *   zoom 0.305 -> 9.8px on screen, 32px logical (9.8 / 0.305 = 32.1)
 *   zoom 0.21  -> 6.9px on screen, 33px logical (6.9 / 0.21  = 32.8)
 * Both observations resolve to the same logical spacing: 8 * 2^2 = 32. At
 * those zooms, 8*2^2*zoom lands at 9.76px and 6.72px respectively — both
 * inside our chosen [6.5, 13] screen-space band — which is exactly what
 * validates picking 8 (not e.g. 10 or 16) as the base and powers-of-two as
 * the step law. See grid.ts for the implementation and grid.test.ts for the
 * reproduction of these two data points.
 */
export const GRID_BASE_STEP_PX = 8;
/** Screen-space band the effective step (8 * 2^n) must stay inside. */
export const GRID_MIN_SCREEN_STEP_PX = 6.5;
export const GRID_MAX_SCREEN_STEP_PX = 13;
/** Dot diameter at 100% zoom, logical px. */
export const GRID_DOT_DIAMETER_PX = 2;
/** Recommended dot color (sampled ~#DDDDDD over #F5F5F5, video-compression-uncertain; this alpha reproduces it). */
export const GRID_DOT_COLOR = "rgba(0, 0, 0, 0.13)";

// ---------------------------------------------------------------------------
// Sections (tint families) — not built this wave (W2), tokens captured early
// ---------------------------------------------------------------------------

export type SectionFamily =
  | "green"
  | "purple"
  | "orange"
  | "yellow"
  | "gray"
  | "white"
  | "pink"
  | "red"
  | "blue"
  | "teal";

export type SectionFamilyStyle = {
  /** Section body tint fill. */
  tint: string;
  /** Title-chip fill color; also the section border color (border = chip fill). */
  chipFill: string | null;
  /** Title-chip border color. */
  chipBorder: string | null;
};

/** Pastel section family styles (figjam-style-tokens.json: sections.pastel). */
export const SECTION_FAMILIES: Record<SectionFamily, SectionFamilyStyle> = {
  green: { tint: "#EBFFEE", chipFill: "#CDF4D3", chipBorder: "#66D575" },
  purple: { tint: "#F8F5FF", chipFill: "#DCCCFF", chipBorder: "#874FFF" },
  orange: { tint: "#FFF7F0", chipFill: "#FFE0C2", chipBorder: "#FF9E42" },
  yellow: { tint: "#FFFBF0", chipFill: "#FFECBD", chipBorder: "#FFC943" },
  gray: { tint: "#F9F9F9", chipFill: "#D9D9D9", chipBorder: "#B9B9B9" },
  white: { tint: "#FFFFFF", chipFill: "#E6E6E6", chipBorder: "#C4C4C4" },
  pink: { tint: "#FFF0FA", chipFill: "#FFC2EC", chipBorder: "#F849C1" },
  red: { tint: "#FFF5F5", chipFill: "#FFC7C2", chipBorder: "#F24822" },
  blue: { tint: "#F5FBFF", chipFill: "#C2E5FF", chipBorder: "#3DADFF" },
  // teal chip/border were never observed in the wild — tint only, extrapolated.
  teal: { tint: "#C6FAF6", chipFill: null, chipBorder: null },
};

/** Section geometry (figjam-style-tokens.json: sections.geometry). */
export const SECTION_GEOMETRY = {
  cornerRadiusPx: 8.5,
  borderWidthPx: 2,
  titleChip: {
    heightPx: 27,
    borderWidthPx: 2,
    textColor: "#000000",
    fontSizePx: 16,
    fontWeight: 500,
    paddingXPx: 10,
    insetFromSectionCornerPx: 3,
  },
} as const;

/**
 * Section capture-membership threshold (W2 design decision — not directly
 * pixel-sampled; FigJam's own overlap fraction was never captured in the
 * screen-recording chrome catalog, see affine-mining-map.md §1's flagged
 * caveat). A dragged section carries every object whose bounds overlap the
 * section's bounds by at least this fraction of the OBJECT's own area,
 * computed once at drag-start. 1.0 would require full containment (too
 * strict — FigJam visibly captures objects that graze a section's inset
 * padding); 0.6 was chosen as a documented, testable middle ground: an object
 * more than half "inside" reads as a member, matching the intuitive FigJam
 * feel of "drop it mostly inside the section and it's captured."
 */
export const SECTION_CAPTURE_OVERLAP_THRESHOLD = 0.6;

// ---------------------------------------------------------------------------
// Sticky notes
// ---------------------------------------------------------------------------

export type StickyColorName = "yellow" | "red" | "pink" | "blue" | "lightBlue" | "blueGray";

export type StickyColorStyle = {
  bg: string;
  /** Body text = black @ 80% over fill; pre-computed exact blend where sampled, else derived. */
  text80: string;
  /** Author text = black @ 40% over fill; only sampled for yellow. */
  author40?: string;
};

/** Sticky note fill + derived text colors (figjam-style-tokens.json: sticky.colors). */
export const STICKY_COLORS: Record<StickyColorName, StickyColorStyle> = {
  yellow: { bg: "#FFE299", text80: "#332D1F", author40: "#99885C" },
  red: { bg: "#FFAFA3", text80: "#332321" },
  pink: { bg: "#FFA8DB", text80: "#33222C" },
  blue: { bg: "#80CAFF", text80: "#1A2833" },
  lightBlue: { bg: "#A8DAFF", text80: "#222C33" },
  blueGray: { bg: "#AFBCCF", text80: "#232629" },
};

/** Sticky geometry/typography (figjam-style-tokens.json: sticky.geometry). */
export const STICKY_GEOMETRY = {
  cornerRadiusPx: 0,
  foldedCorner: false,
  defaultSizePx: { width: 416, height: 420 },
  textInsetLeftPx: 21,
  textInsetTopPx: 28,
  bodyFontSizePx: 24,
  bodyLineHeightPx: 36,
  bodyTextColor: "rgba(0, 0, 0, 0.8)",
  author: {
    fontSizePx: 12,
    color: "rgba(0, 0, 0, 0.4)",
    insetLeftPx: 20,
    baselineFromBottomPx: 24,
  },
  /** Approximation of the measured down-biased falloff shadow. */
  shadow: "0 3px 12px rgba(0, 0, 0, 0.15)",
} as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Universal shape stroke width, logical px (figjam-style-tokens.json: shapes.strokeWidthPx). */
export const SHAPE_STROKE_WIDTH_PX = 4;
/** Text-on-fill color rule: black @ 80% opacity over pastel fills. */
export const SHAPE_TEXT_COLOR = "rgba(0, 0, 0, 0.8)";
/** Text color on saturated (borderless, high-chroma) fills. */
export const SHAPE_TEXT_COLOR_ON_SATURATED = "#FFFFFF";
export const SHAPE_FONT_SIZE_PX = 15;

/** Per-shape corner radii sampled across the catalog (figjam-style-tokens.json: shapes.*). */
export const SHAPE_CORNER_RADII_PX = {
  roundedRect: 8,
  /** true stadium: radius = height / 2, computed by callers from actual height. */
  pill: "height/2",
  predefinedProcess: 5,
  chevronArrowBody: 10,
  emphasisBox: 7.5,
  nestedCard: 8,
} as const;

/** Fill/stroke pastel pairs shared by shapes, chips, and the palette popover. */
export const PASTEL_PAIRS = {
  gray: { fill: "#E6E6E6", stroke: "#C4C4C4" },
  gray2: { fill: "#D9D9D9", stroke: "#B3B3B3" },
  blue: { fill: "#C2E5FF", stroke: "#3DADFF" },
  yellow: { fill: "#FFECBD", stroke: "#FFC943" },
  orange: { fill: "#FFE0C2", stroke: "#FF9E42" },
  red: { fill: "#FFC7C2", stroke: "#F24822" },
  green: { fill: "#DDF8E2", stroke: "#66D575" },
  greenChip: { fill: "#CDF4D3", stroke: "#66D575" },
  purple: { fill: "#DCCCFF", stroke: "#874FFF" },
  purple2: { fill: "#E4CCFF", stroke: "#874FFF" },
  teal: { fill: "#5AD8CC", stroke: "#369E94" },
  pink: { fill: "#FFC2EC", stroke: "#F849C1" },
} as const;

/** Saturated (borderless, white-text) palette swatches. */
export const SATURATED_PALETTE = [
  "#F24822",
  "#FF9E42",
  "#FFCD29",
  "#14AE5C",
  "#0D99FF",
  "#9747FF",
  "#FFA8DB",
  "#B3B3B3",
] as const;

/**
 * The 2x11 palette-popover swatch list (chrome context-toolbar color picker).
 * Not separately captured in figjam-style-tokens.json's `chrome` block (no
 * dedicated popover swatch array was sampled) — derived here by concatenating
 * the pastel-pair fills (row 1, the "tint" swatches users pick most) with the
 * saturated palette (row 2, the "bold" swatches), which reproduces every
 * color actually observed in the reference boards. Flagged as an
 * extrapolation: confirm swatch order/grouping against live FigJam when the
 * palette popover is built (W2/W3).
 */
export const PALETTE_POPOVER_SWATCHES: readonly [
  readonly string[],
  readonly string[],
] = [
  [
    PASTEL_PAIRS.gray.fill,
    PASTEL_PAIRS.gray2.fill,
    PASTEL_PAIRS.blue.fill,
    PASTEL_PAIRS.yellow.fill,
    PASTEL_PAIRS.orange.fill,
    PASTEL_PAIRS.red.fill,
    PASTEL_PAIRS.green.fill,
    PASTEL_PAIRS.greenChip.fill,
    PASTEL_PAIRS.purple.fill,
    PASTEL_PAIRS.purple2.fill,
    PASTEL_PAIRS.teal.fill,
  ],
  [...SATURATED_PALETTE, PASTEL_PAIRS.pink.fill],
];

// ---------------------------------------------------------------------------
// Connectors
// ---------------------------------------------------------------------------

/** Default connector stroke width, logical px (figjam-style-tokens.json: connectors.strokeWidthPx). */
export const CONNECTOR_STROKE_WIDTH_PX = 4;

/** Named connector stroke colors (figjam-style-tokens.json: connectors.colors). */
export const CONNECTOR_COLORS = {
  gray: "#757575",
  orange: "#EB7500",
  green: "#3E9B4B",
  red: "#F24822",
  purple: "#9747FF",
  darkYellow: "#E8A302",
} as const;

/** Default connector color when none is specified — FigJam's neutral gray. */
export const CONNECTOR_DEFAULT_COLOR = CONNECTOR_COLORS.gray;

/**
 * Elbow corner radius, logical px, centerline (figjam-style-tokens.json:
 * connectors.elbowCornerRadiusPx — 21.5, outer edge measured at 23.5; the
 * centerline figure is the correct one for our stroked-centerline path
 * construction). Likely clamps smaller on short segments — our
 * `roundedPolylinePath` already clamps to half the shorter adjacent segment
 * length, so this constant is a ceiling, not a fixed radius.
 */
export const CONNECTOR_ELBOW_CORNER_RADIUS_PX = 21.5;

/**
 * Dash pattern, logical px (figjam-style-tokens.json: connectors.dash —
 * measured 19px dash / 7px gap from FigJam exports). Originally drafted as
 * [12, 12] (AFFiNE's constant) in the Wave-1 brief, but the coordinator's
 * final style-spec adjudication confirmed FigJam's measured 19/7 wins for
 * pixel parity — use that.
 */
export const CONNECTOR_DASH_PATTERN_PX: readonly [number, number] = [19, 7];

/**
 * Arrowhead geometry as multiples of the connector's stroke width
 * (figjam-style-tokens.json: connectors.arrowhead — baseWidthToStrokeRatio 5,
 * lengthToStrokeRatio 4.5). Per the wave brief we implement 5x for both base
 * width and length (a slightly longer, more visually "solid" head than the
 * measured 4.5x length) — tune against V2 Flow.png if it reads too long.
 */
export const CONNECTOR_ARROWHEAD_WIDTH_TO_STROKE_RATIO = 5;
export const CONNECTOR_ARROWHEAD_LENGTH_TO_STROKE_RATIO = 5;

/**
 * Endpoint gap: connectors stop short of the target border rather than
 * touching it flush (figjam-style-tokens.json: connectors.attachGapPx —
 * plainEnd 8, arrowheadTip 12). We use a single 10px figure for both ends per
 * the wave brief ("pick 10px") — splitting plain-vs-arrow gap is left to a
 * later wave if the difference reads as necessary.
 */
export const CONNECTOR_END_GAP_PX = 10;

/**
 * Arrow-shape (fat chevron) proportions, measured from
 * board-design-reference/analysis/figjam-style-spec.md's arrow-shape row:
 * "total 722x200 export (361x100 logical); body height 106 export (53
 * logical); head = full height 200 export (100 logical), head length 272
 * export (136 logical) => head is 38% of total width, 1.9x body height; body
 * corners rounded ~= 20 export (10 logical)." Ratios (not raw px) so callers
 * derive head/body geometry from the object's actual width/height.
 */
export const ARROW_SHAPE_GEOMETRY = {
  /** Fraction of total width occupied by the chevron head. */
  headWidthRatio: 0.38,
  /** Body height as a multiple of... no: body height / total height ratio. */
  bodyHeightRatio: 0.53,
  bodyCornerRadiusPx: 10,
} as const;

/**
 * Predefined-process shape: rect with two inner vertical bars near each end
 * (figjam-style-spec.md: "rect 742x166 export (371x83 logical), corner radius
 * 10 export (5 logical); two inner vertical bars, 8px wide, inset 35px
 * (17.5 logical) from each end").
 */
export const PREDEFINED_PROCESS_GEOMETRY = {
  cornerRadiusPx: 5,
  barWidthPx: 4,
  /** Bar inset from each end, as a fraction of total width (17.5/371 measured). */
  barInsetRatio: 0.047,
} as const;

// ---------------------------------------------------------------------------
// Icons (not built this wave — tokens captured early for W2)
// ---------------------------------------------------------------------------

export const ICON_STROKE_WIDTH_PX = 4.5;
export const ICON_APPROX_SIZE_PX = 130;

/** Chip/CPU icon fill+stroke (figjam-style-spec.md icon catalog: orange family). */
export const CHIP_ICON_COLORS = {
  fill: "#FFE0C2",
  stroke: "#FF9E42",
} as const;

/** Restyled chat/person icon fill+stroke (figjam-style-spec.md icon catalog). */
export const CHAT_ICON_COLORS = {
  fill: "#FF9E42",
  stroke: "#EB7500",
} as const;

export const PERSON_ICON_COLORS = {
  fill: "#66D575",
  stroke: "#3E9B4B",
} as const;

// ---------------------------------------------------------------------------
// Code block (Dracula theme) — not built this wave
// ---------------------------------------------------------------------------

export const CODE_BLOCK = {
  bg: "#282A36",
  cornerRadiusPx: 10,
  paddingTopPx: 25,
  gutter: {
    lineNumberColor: "#999999",
    numberColumnFromLeftPx: 35,
    codeStartFromLeftPx: 66,
  },
  syntax: {
    fg: "#F8F8F2",
    keyword: "#FF79C6",
    string: "#F1FA8C",
    type: "#8BE9FD",
    /** Not observed in samples; standard Dracula value used as a placeholder. */
    comment: "#6272A4",
  },
} as const;

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Canvas content font. Applied to canvas OBJECTS/labels/stickies via the
 * stage's content root class — never to app chrome (toolbars, panels, etc.
 * keep the app's existing font stack).
 */
export const CANVAS_FONT_FAMILY =
  '"Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

/** Text size hierarchy, logical px (figjam-style-tokens.json: text.sizesPx). */
export const TEXT_SIZES_PX = {
  chipLabel: 16,
  stickyBody: 24,
  stickyLineHeight: 36,
  stickyAuthor: 12,
  boldLabel: 20,
  shapeText: 15,
} as const;

/** Text-over-fill alpha rules (figjam-style-tokens.json: meta.textRules). Prefer these over fixed hexes. */
export const TEXT_ALPHA_RULES = {
  bodyOnFill: "rgba(0, 0, 0, 0.8)",
  authorOnFill: "rgba(0, 0, 0, 0.4)",
  chipLabel: "#000000",
  onSaturatedFill: "#FFFFFF",
} as const;

// ---------------------------------------------------------------------------
// Chrome (not built this wave — tokens captured early for W2/W3)
// ---------------------------------------------------------------------------

export const CHROME = {
  topBarBg: "#E6E6E6",
  topBarBorderBottom: "#DFDFDF",
  bottomToolbarBg: "#FFFFFF",
  contextToolbarBg: "#1D1D1D",
  accentPurple: "#8C2EF2",
  /** Selection outline/handle color (Figma/FigJam blue). */
  selectionBlue: "#0D99FF",
  /**
   * Rainbow/conic gradient ring drawn around the color popover's
   * "current color" swatch (W3 — promoted from a local TODO(w3) constant in
   * ColorPalettePopover.tsx, since it's now referenced by W3's editor-level
   * color-swap wiring too, not just that one component).
   */
  rainbowRingGradient:
    "conic-gradient(from 0deg, #FF3B30, #FF9500, #FFCC00, #34C759, #30B0C7, #0D99FF, #9747FF, #FF2D95, #FF3B30)",
} as const;
