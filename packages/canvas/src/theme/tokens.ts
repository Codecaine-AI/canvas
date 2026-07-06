/**
 * Canvas design tokens — the colors, text sizes, and geometry constants the
 * whole engine draws from. Values were originally sampled from FigJam
 * reference exports (board-design-reference/).
 *
 * Units: every `*Px` value here is LOGICAL px (independent of canvas zoom).
 *
 * This module is the single place to import these constants from — do not
 * re-hardcode the values elsewhere.
 */

// ---------------------------------------------------------------------------
// Canvas surface
// ---------------------------------------------------------------------------

/**
 * Board background. The board surface is light-only — even the app's dark
 * theme renders the canvas SURFACE with these light values; the board itself
 * is never dark-themed.
 */
export const CANVAS_BG = "#F5F5F5";

/**
 * Dot grid. The grid is adaptive: a base 8 logical-px step that doubles or
 * halves (powers of two) so the ON-SCREEN dot pitch stays inside a
 * comfortable band. See grid.ts for the implementation and grid.test.ts for
 * the zoom data points that pin the base step and band.
 */
export const GRID_BASE_STEP_PX = 8;
/** Screen-space band the effective step (8 * 2^n) must stay inside. */
export const GRID_MIN_SCREEN_STEP_PX = 6.5;
export const GRID_MAX_SCREEN_STEP_PX = 13;
/** Dot diameter at 100% zoom, logical px. */
export const GRID_DOT_DIAMETER_PX = 2;
/** Dot color; this alpha reads as ~#DDDDDD over the board background. */
export const GRID_DOT_COLOR = "rgba(0, 0, 0, 0.13)";

// ---------------------------------------------------------------------------
// Sections (tint families)
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

/** Pastel section family styles. */
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
  // teal has no chip/border colors — tint only.
  teal: { tint: "#C6FAF6", chipFill: null, chipBorder: null },
};

/** Section geometry. */
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

// Section capture-membership threshold: model semantics, not a visual token —
// it lives in state/geometry.ts next to sectionCaptureMembers (its consumer;
// the full rationale for the 0.6 default lives there too). Re-exported here
// because existing importers (and the package root's `export *`) pull the
// constant from this module.
export { SECTION_CAPTURE_OVERLAP_THRESHOLD } from "../state/geometry";

// ---------------------------------------------------------------------------
// Sticky notes
// ---------------------------------------------------------------------------

export type StickyColorName = "yellow" | "red" | "pink" | "blue" | "lightBlue" | "blueGray";

export type StickyColorStyle = {
  bg: string;
  /** Body text = black @ 80% over fill; pre-computed exact blend. */
  text80: string;
  /** Author text = black @ 40% over fill; only defined for yellow. */
  author40?: string;
};

/** Sticky note fill + derived text colors. */
export const STICKY_COLORS: Record<StickyColorName, StickyColorStyle> = {
  yellow: { bg: "#FFE299", text80: "#332D1F", author40: "#99885C" },
  red: { bg: "#FFAFA3", text80: "#332321" },
  pink: { bg: "#FFA8DB", text80: "#33222C" },
  blue: { bg: "#80CAFF", text80: "#1A2833" },
  lightBlue: { bg: "#A8DAFF", text80: "#222C33" },
  blueGray: { bg: "#AFBCCF", text80: "#232629" },
};

/** Sticky geometry/typography. */
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
  /** Down-biased falloff shadow. */
  shadow: "0 3px 12px rgba(0, 0, 0, 0.15)",
} as const;

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

/** Universal shape stroke width, logical px. */
export const SHAPE_STROKE_WIDTH_PX = 4;

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

/** Saturated (borderless) swatches — feed PALETTE_POPOVER_SWATCHES row 2. */
const SATURATED_PALETTE = [
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
 * The 2x11 palette-popover swatch list (selection-toolbar color picker):
 * the pastel-pair fills (row 1, the "tint" swatches users pick most)
 * followed by the saturated palette (row 2, the "bold" swatches).
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

/** Default connector stroke width, logical px. */
export const CONNECTOR_STROKE_WIDTH_PX = 4;

/** Named connector stroke colors. */
export const CONNECTOR_COLORS = {
  gray: "#757575",
  orange: "#EB7500",
  green: "#3E9B4B",
  red: "#F24822",
  purple: "#9747FF",
  darkYellow: "#E8A302",
} as const;

/** Default connector color when none is specified — neutral gray. */
export const CONNECTOR_DEFAULT_COLOR = CONNECTOR_COLORS.gray;

/**
 * Elbow corner radius, logical px, on the stroke CENTERLINE (the correct
 * figure for our stroked-centerline path construction). Short segments clamp
 * it smaller — `roundedPolylinePath` already clamps to half the shorter
 * adjacent segment length — so this constant is a ceiling, not a fixed
 * radius.
 */
export const CONNECTOR_ELBOW_CORNER_RADIUS_PX = 21.5;

/** Dash pattern, logical px: 19px dash / 7px gap. */
export const CONNECTOR_DASH_PATTERN_PX: readonly [number, number] = [19, 7];

/**
 * Arrowhead geometry as multiples of the connector's stroke width. We use 5x
 * for BOTH base width and length — a slightly long, visually "solid" head.
 */
export const CONNECTOR_ARROWHEAD_WIDTH_TO_STROKE_RATIO = 5;
export const CONNECTOR_ARROWHEAD_LENGTH_TO_STROKE_RATIO = 5;

/**
 * Endpoint gap: connectors stop short of the target border rather than
 * touching it flush. A single figure is used for both plain and arrowhead
 * ends — splitting the two is left to a later wave if the difference reads
 * as necessary.
 */
export const CONNECTOR_END_GAP_PX = 10;

/**
 * Arrow-shape (fat chevron) proportions: the head takes 38% of total width;
 * the body is intentionally tall (0.60 of height) so the rendered arrow
 * reads blocky; body corners are rounded.
 */
export const ARROW_SHAPE_GEOMETRY = {
  /** Fraction of total width occupied by the chevron head. */
  headWidthRatio: 0.38,
  /** Fraction of total height occupied by the arrow body. */
  bodyHeightRatio: 0.6,
  bodyCornerRadiusPx: 10,
} as const;

/**
 * Off-page connector geometry. Shoulder ratio mirrors
 * connection-overlay.ts's true-outline pentagon math.
 */
export const OFF_PAGE_CONNECTOR_GEOMETRY = {
  shoulderRatio: 0.6,
} as const;

/**
 * Manual-input geometry. Drop ratio mirrors connection-overlay.ts's
 * slanted-top polygon math.
 */
export const MANUAL_INPUT_GEOMETRY = {
  dropRatio: 0.25,
} as const;

/** Folder silhouette geometry. */
export const FOLDER_GEOMETRY = {
  tabWidthRatio: 0.38,
} as const;

/** Document wavy-bottom silhouette geometry. */
export const DOCUMENT_GEOMETRY = {
  waveShoulderYRatio: 0.82,
  waveCrestYRatio: 0.96,
} as const;

/** Document-stack silhouette geometry. */
export const DOCUMENT_STACK_GEOMETRY = {
  offsetPx: 6,
} as const;

/**
 * Chevron silhouette geometry. Notch ratio mirrors connection-overlay.ts's
 * true-outline chevron math.
 */
export const CHEVRON_GEOMETRY = {
  notchWidthRatio: 0.25,
} as const;

/**
 * Predefined-process shape: rect with rounded corners and two inner vertical
 * bars near each end.
 */
export const PREDEFINED_PROCESS_GEOMETRY = {
  cornerRadiusPx: 5,
  barWidthPx: 4,
  /** Bar inset from each end, as a fraction of total width (17.5/371). */
  barInsetRatio: 0.047,
} as const;

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

export const ICON_STROKE_WIDTH_PX = 4.5;
export const ICON_APPROX_SIZE_PX = 130;

/** Chip/CPU icon fill+stroke (orange family). */
export const CHIP_ICON_COLORS = {
  fill: "#FFE0C2",
  stroke: "#FF9E42",
} as const;

/** Chat icon fill+stroke. */
export const CHAT_ICON_COLORS = {
  fill: "#FF9E42",
  stroke: "#EB7500",
} as const;

export const PERSON_ICON_COLORS = {
  fill: "#66D575",
  stroke: "#3E9B4B",
} as const;

// ---------------------------------------------------------------------------
// Code block (Dracula theme)
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
    /** Standard Dracula comment color. */
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

/** Text size hierarchy, logical px. */
export const TEXT_SIZES_PX = {
  chipLabel: 16,
  stickyBody: 24,
  stickyLineHeight: 36,
  stickyAuthor: 12,
  boldLabel: 20,
  shapeText: 15,
} as const;

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

// Same kite-shaped pointer as the dock's Select glyph (Nucleo
// maps-location/pointer), filled for cursor use — the tool icon and the
// on-canvas cursor are literally the same form.
const SELECT_CURSOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 18 18"><path d="M3.474,2.784L14.897,6.958c.481,.176,.467,.861-.021,1.018l-5.228,1.673-1.673,5.228c-.156,.488-.842,.502-1.018,.021L2.784,3.474c-.157-.43,.26-.847,.69-.69Z" fill="#111" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/></svg>';

const SELECT_CURSOR_DATA_URI = `data:image/svg+xml,${encodeURIComponent(SELECT_CURSOR_SVG)}`;

export const CHROME = {
  topBarBg: "#E6E6E6",
  topBarBorderBottom: "#DFDFDF",
  bottomToolbarBg: "#FFFFFF",
  dockHeightPx: 48,
  dockRadiusPx: 13,
  dockPaddingXPx: 8,
  dockButtonSizePx: 36,
  dockButtonRadiusPx: 9,
  dockIconSizePx: 20,
  dockGroupGapPx: 4,
  dockDividerHeightPx: 24,
  dockDividerMarginXPx: 8,
  dockDividerColor: "rgba(0, 0, 0, 0.10)",
  dockGlyphColor: "#333333",
  dockHoverBg: "#F0F0F0",
  dockShadow: "0 2px 10px rgba(0, 0, 0, 0.12), 0 0 0 0.5px rgba(0, 0, 0, 0.06)",
  selectCursor: `url("${SELECT_CURSOR_DATA_URI}") 3 3, default`,
  selectionToolbarBg: "#1D1D1D",
  selectionToolbarSwatchPx: 22,
  colorPopoverSwatchPx: 32,
  colorPopoverGapPx: 10,
  colorPopoverPaddingPx: 18,
  colorPopoverRadiusPx: 20,
  accentPurple: "#8C2EF2",
  /** Selection outline/handle color. */
  selectionBlue: "#0D99FF",
  /**
   * Rainbow/conic gradient ring drawn around the color popover's
   * "current color" swatch.
   */
  rainbowRingGradient:
    "conic-gradient(from 0deg, #FF3B30, #FF9500, #FFCC00, #34C759, #30B0C7, #0D99FF, #9747FF, #FF2D95, #FF3B30)",
} as const;
