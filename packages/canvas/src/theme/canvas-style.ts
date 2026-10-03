/**
 * canvas-style.ts — the workspace-wide canvas style: ONE resolved, flat set of
 * tokens (geometry, board, text, shapes, sections, icons, connectors,
 * stickies, palette inks) every renderer (live stage, static SVG, agent text
 * fit) resolves through.
 *
 * Themes: each theme is a complete preset (CANVAS_THEME_PRESETS). `figjam` is
 * the original look — its values are the long-standing renderer constants, so
 * it renders exactly as before whenever it is selected — and
 * `schematic-light` / `schematic-dark` are the minimal schematic look (card
 * shapes, layer-cake sections, pinned mono headers, icon tiles).
 * `schematic-light` is the DEFAULT (DEFAULT_CANVAS_THEME_ID): every render
 * that is not explicitly configured — no settings file, no style prop, no
 * provider — draws in it. Hosts persist CanvasStyleSettings — Studio keeps
 * them in `canvases/canvas-style.json`: the active theme plus per-theme
 * overrides — and `resolveCanvasStyle` turns them into the style. The
 * pre-theme file (a flat bag of token overrides, written when figjam was the
 * only look) still reads, as figjam overrides.
 *
 * Validation is total: any parsed JSON is safe input. Numbers clamp to their
 * control range (the font weight also snaps to a whole hundred), colors must
 * be `#RRGGBB` or `rgba(r, g, b, a)` (stored in canonical spelling,
 * theme/color-math.ts), enums and booleans must be one of their values;
 * anything else falls back to the preset value.
 *
 * Pure data, no React and no DOM: safe to import from Node (Studio server,
 * Canvas MCP) via `@codecaine-ai/canvas/style`. Imports only the color-id
 * vocabulary and the pure color math.
 *
 * Every `*Px` value is LOGICAL px (independent of canvas zoom). A per-object
 * `style.strokeWidth` still overrides `shapeBorderWidthPx` /
 * `sectionBorderWidthPx` for that object.
 */
import { CANVAS_COLORS, type CanvasColor } from "../state/schema/colors";
import { normalizeColor } from "./color-math";

export const CANVAS_THEME_IDS = ["figjam", "schematic-light", "schematic-dark"] as const;

export type CanvasThemeId = (typeof CANVAS_THEME_IDS)[number];

/** Display names for theme pickers. */
export const CANVAS_THEME_LABELS: Readonly<Record<CanvasThemeId, string>> = {
  figjam: "FigJam",
  "schematic-light": "Schematic light",
  "schematic-dark": "Schematic dark",
};

export function isCanvasThemeId(value: unknown): value is CanvasThemeId {
  return typeof value === "string" && (CANVAS_THEME_IDS as readonly string[]).includes(value);
}

/** Font token: `sans` = Inter, `mono` = IBM Plex Mono (the stacks live with the renderers). */
export type CanvasStyleFont = "sans" | "mono";

/** Ink — the line / stroke / tile color — per roster color. */
export type CanvasStylePalette = Record<CanvasColor, string>;

export interface CanvasStyle {
  /** The preset every other token starts from. */
  theme: CanvasThemeId;

  // --- Geometry -------------------------------------------------------------
  /** Corner radius of rectangle-family silhouettes other than the rounded rect (predefined process). */
  shapeCornerRadiusPx: number;
  /**
   * Corner radius of the default rounded-rect shape — process and rectangle
   * objects (every object without another `style.shape`).
   */
  processCornerRadiusPx: number;
  /** Default border width of shapes. */
  shapeBorderWidthPx: number;
  /** Corner radius of section frames. */
  sectionCornerRadiusPx: number;
  /** Default border width of section frames. */
  sectionBorderWidthPx: number;
  /** Corner radius of section title chips (the bottom-right corner of a pinned header). */
  titleChipCornerRadiusPx: number;
  /** Border width of section title chips. */
  titleChipBorderWidthPx: number;
  /** Corner radius of connector label chips (half the label chip height = pill). */
  labelChipCornerRadiusPx: number;
  /** Connector line width. */
  connectorStrokeWidthPx: number;
  /** Radius of the rounded bends on elbow connectors. */
  connectorCornerRadiusPx: number;

  // --- Board ----------------------------------------------------------------
  /** Board surface (live stage, static export `background: "board"`). */
  boardBackground: string;
  /** Dot-grid dot color. */
  gridDotColor: string;
  /** Neutral 1px line: connector label chip borders, card sticky borders, white section frames in light themes. */
  hairlineColor: string;

  // --- Text -----------------------------------------------------------------
  /** Object name color (shape text, icon labels, section titles). */
  textColor: string;
  /** Object name font weight: a whole hundred, 300..900 (validation snaps other values). */
  textFontWeight: number;
  /** Object name font size: shape text and icon labels (line box = 1.2×). */
  textFontSizePx: number;
  /** Detail-line color under shape and icon names (section headers derive theirs from the ink). */
  detailColor: string;
  detailFont: CanvasStyleFont;
  detailFontSizePx: number;

  // --- Shapes ---------------------------------------------------------------
  /** `tint` = the pastel fill per color (FigJam); `card` = `cardFill` with an ink border. */
  shapeFill: "tint" | "card";
  /** Card surface: card shapes, card stickies, outlined white tiles; layer-cake fills keep clear of it. */
  cardFill: string;

  // --- Sections -------------------------------------------------------------
  /** `flat` = the per-color wash (FigJam); `layer-cake` = an opaque ink tint that deepens per nesting level. */
  sectionFill: "flat" | "layer-cake";
  /** Layer-cake ink weight of a top-level section. */
  sectionTintBase: number;
  /** Ink weight added per nesting level. */
  sectionTintStep: number;
  /** Cap on the ink weight. */
  sectionTintMax: number;
  /** What the ink is mixed into for layer-cake fills. */
  sectionTintMixBase: string;
  /** Layer-cake frame border = the ink at this opacity. */
  sectionBorderOpacity: number;
  /** `floating` = the inset title chip; `pinned` = a chip flush in the section's top-left corner. */
  headerPlacement: "floating" | "pinned";
  headerFont: CanvasStyleFont;
  headerUppercase: boolean;
  headerFontSizePx: number;
  /** Layer-cake header chip = the ink mixed into the section fill at this weight. */
  headerChipMix: number;

  // --- Icons ----------------------------------------------------------------
  iconPack: "nucleo" | "tabler";
  /** `glyph` = the bare glyph in the ink (FigJam); `tile` = the glyph on a solid ink tile. */
  iconStyle: "glyph" | "tile";
  /** Glyph color on an ink tile. */
  iconTileGlyphColor: string;
  /**
   * Tile body (tile style only): `solid` = the ink tile; `tint` = a light ink
   * tint with an ink border and an ink glyph; `auto` = solid up to
   * `iconTileSolidMaxPx`, tinted above (large tiles stay light).
   */
  iconTileFill: "solid" | "tint" | "auto";
  /**
   * `auto` tile fill: tiles whose side is at most this are solid, larger ones tinted. The
   * side is the capped tile (`iconTileMaxPx`), so under the schematic presets' 56px cap every
   * tile is solid; the 152 threshold matters only once the cap is raised.
   */
  iconTileSolidMaxPx: number;
  /**
   * Largest tile side (tile style only): the tile is min(glyph box, this), centered in the
   * object box, with the caption directly under the tile. Boards size icon boxes at roughly
   * 96–288 units for the bare glyph; the schematic tiles read at the mockups' scale (≈ 57
   * units) instead of filling the box.
   */
  iconTileMaxPx: number;

  // --- Connectors -----------------------------------------------------------
  connectorLabelFont: CanvasStyleFont;
  connectorLabelFontSizePx: number;
  connectorLabelHeightPx: number;
  connectorLabelBackground: string;
  connectorLabelTextColor: string;

  // --- Stickies -------------------------------------------------------------
  /** `paper` = colored note with a shadow (FigJam); `card` = card + hairline border + 2px ink left rule. */
  stickyStyle: "paper" | "card";

  /** Ink (line / stroke / tile color) per roster color. */
  palette: CanvasStylePalette;
}

export type CanvasStyleKey = keyof CanvasStyle;

/** Token keys holding a free color (`#RRGGBB` / `rgba(…)`). */
export type CanvasStyleColorKey = {
  [K in CanvasStyleKey]: string extends CanvasStyle[K] ? K : never;
}[CanvasStyleKey];
/** Token keys holding a number. */
export type CanvasStyleNumberKey = {
  [K in CanvasStyleKey]: CanvasStyle[K] extends number ? K : never;
}[CanvasStyleKey];
/** Token keys holding a boolean. */
export type CanvasStyleBooleanKey = {
  [K in CanvasStyleKey]: CanvasStyle[K] extends boolean ? K : never;
}[CanvasStyleKey];
/** Token keys holding one of a closed set of strings (`theme` included). */
export type CanvasStyleSelectKey = Exclude<
  CanvasStyleKey,
  CanvasStyleColorKey | CanvasStyleNumberKey | CanvasStyleBooleanKey | "palette"
>;

/** A partial style bag: any subset of tokens, palette inks included one by one. */
export type CanvasStyleInput = Partial<Omit<CanvasStyle, "palette">> & {
  palette?: Partial<CanvasStylePalette>;
};

/** What a host persists per theme: the tokens that differ from that theme's preset. */
export type CanvasStyleOverrides = Partial<Omit<CanvasStyle, "theme" | "palette">> & {
  palette?: Partial<CanvasStylePalette>;
};

/** The persisted settings document (`canvases/canvas-style.json`). */
export interface CanvasStyleSettings {
  /** The active theme. */
  theme: CanvasThemeId;
  /** Overrides per theme — switching themes keeps each theme's own edits. */
  themes: Partial<Record<CanvasThemeId, CanvasStyleOverrides>>;
}

function deepFreeze(style: CanvasStyle): Readonly<CanvasStyle> {
  Object.freeze(style.palette);
  return Object.freeze(style);
}

/** The original FigJam-parity look: every value is the renderer constant it replaced. */
const FIGJAM_PRESET: CanvasStyle = {
  theme: "figjam",
  shapeCornerRadiusPx: 2,
  processCornerRadiusPx: 2,
  shapeBorderWidthPx: 2,
  sectionCornerRadiusPx: 2,
  sectionBorderWidthPx: 1.5,
  titleChipCornerRadiusPx: 2,
  titleChipBorderWidthPx: 1.5,
  labelChipCornerRadiusPx: 2,
  connectorStrokeWidthPx: 4,
  connectorCornerRadiusPx: 21.5,
  boardBackground: "#F5F5F5",
  gridDotColor: "rgba(0, 0, 0, 0.25)",
  hairlineColor: "#D9D9D9",
  textColor: "#000000",
  textFontWeight: 700,
  textFontSizePx: 15,
  detailColor: "#5C5C5C",
  detailFont: "sans",
  detailFontSizePx: 13,
  shapeFill: "tint",
  cardFill: "#FFFFFF",
  sectionFill: "flat",
  sectionTintBase: 0.07,
  sectionTintStep: 0.035,
  sectionTintMax: 0.16,
  sectionTintMixBase: "#FFFFFF",
  sectionBorderOpacity: 1,
  headerPlacement: "floating",
  headerFont: "sans",
  headerUppercase: false,
  headerFontSizePx: 16,
  headerChipMix: 0.16,
  iconPack: "nucleo",
  iconStyle: "glyph",
  iconTileGlyphColor: "#FFFFFF",
  iconTileFill: "auto",
  iconTileSolidMaxPx: 152,
  // Uncapped in practice: a figjam board switched to tiles fills the glyph box as before.
  iconTileMaxPx: 240,
  connectorLabelFont: "sans",
  connectorLabelFontSizePx: 16,
  connectorLabelHeightPx: 30,
  connectorLabelBackground: "#F5F5F5",
  connectorLabelTextColor: "#000000",
  stickyStyle: "paper",
  palette: {
    gray: "#757575",
    red: "#D5322F",
    orange: "#EB7500",
    yellow: "#E8A302",
    green: "#019142",
    teal: "#369E94",
    blue: "#1A5CDF",
    violet: "#9747FF",
    pink: "#B74D85",
    white: "#757980",
  },
};

/** Thin lines, mono metadata, card shapes and stacked section tints on a cool light board. */
const SCHEMATIC_LIGHT_PRESET: CanvasStyle = {
  theme: "schematic-light",
  shapeCornerRadiusPx: 2,
  processCornerRadiusPx: 12,
  shapeBorderWidthPx: 2,
  sectionCornerRadiusPx: 2,
  sectionBorderWidthPx: 1.5,
  titleChipCornerRadiusPx: 2,
  titleChipBorderWidthPx: 1.5,
  labelChipCornerRadiusPx: 2,
  connectorStrokeWidthPx: 2,
  connectorCornerRadiusPx: 8,
  boardBackground: "#F6F8FA",
  gridDotColor: "rgba(15, 30, 54, 0.13)",
  hairlineColor: "#D5DBE3",
  textColor: "#0F1E36",
  textFontWeight: 600,
  textFontSizePx: 17.5,
  detailColor: "#5B6578",
  detailFont: "mono",
  detailFontSizePx: 14,
  shapeFill: "card",
  cardFill: "#FFFFFF",
  sectionFill: "layer-cake",
  sectionTintBase: 0.07,
  sectionTintStep: 0.035,
  sectionTintMax: 0.16,
  sectionTintMixBase: "#FFFFFF",
  sectionBorderOpacity: 0.5,
  headerPlacement: "pinned",
  headerFont: "mono",
  headerUppercase: true,
  headerFontSizePx: 14,
  headerChipMix: 0.16,
  iconPack: "tabler",
  iconStyle: "tile",
  iconTileGlyphColor: "#FFFFFF",
  iconTileFill: "auto",
  iconTileSolidMaxPx: 152,
  iconTileMaxPx: 56,
  connectorLabelFont: "mono",
  connectorLabelFontSizePx: 14,
  connectorLabelHeightPx: 26,
  connectorLabelBackground: "#F6F8FA",
  connectorLabelTextColor: "#3A4659",
  stickyStyle: "card",
  palette: {
    gray: "#5B6578",
    red: "#C8402F",
    orange: "#C2620A",
    yellow: "#A87A00",
    green: "#2F8A3E",
    teal: "#0F8A7A",
    blue: "#2F5BD3",
    violet: "#6B4FC4",
    pink: "#B8407F",
    white: "#0F1E36",
  },
};

/** The same schematic look on a dark board: raised cards, pastel inks, dark tile glyphs. */
const SCHEMATIC_DARK_PRESET: CanvasStyle = {
  ...SCHEMATIC_LIGHT_PRESET,
  theme: "schematic-dark",
  boardBackground: "#14171F",
  gridDotColor: "rgba(255, 255, 255, 0.07)",
  hairlineColor: "#2E3342",
  textColor: "#E4E6F2",
  detailColor: "#8B93B5",
  // Raised clear of every section tint: the gray chain (and white, which
  // takes the gray rule on dark boards) tops out near OKLab L 0.29 at the
  // tint cap, so cards sit at L ≈ 0.33 — and low-chroma, so the blue / violet
  // tints that do reach that lightness differ in hue (theme/palette.ts guard).
  cardFill: "#32363E",
  sectionTintBase: 0.1,
  sectionTintStep: 0.05,
  sectionTintMax: 0.22,
  sectionTintMixBase: "#14171F",
  headerChipMix: 0.2,
  iconTileGlyphColor: "#14171F",
  connectorLabelBackground: "#14171F",
  connectorLabelTextColor: "#A6ACCD",
  palette: {
    gray: "#6B7394",
    red: "#FD8A8A",
    orange: "#FFAB70",
    yellow: "#FFD580",
    green: "#85E89D",
    teal: "#5DE4C7",
    blue: "#82AAFF",
    violet: "#C3A6FF",
    pink: "#F5A3D0",
    white: "#E4E6F2",
  },
};

/** Complete, frozen presets — the defaults each theme's overrides apply over. */
export const CANVAS_THEME_PRESETS: Readonly<Record<CanvasThemeId, Readonly<CanvasStyle>>> = {
  figjam: deepFreeze(FIGJAM_PRESET),
  "schematic-light": deepFreeze(SCHEMATIC_LIGHT_PRESET),
  "schematic-dark": deepFreeze(SCHEMATIC_DARK_PRESET),
};

/** The theme every render uses unless a host configures another one. */
export const DEFAULT_CANVAS_THEME_ID: CanvasThemeId = "schematic-light";

/** The default style: the schematic-light preset (DEFAULT_CANVAS_THEME_ID). */
export const DEFAULT_CANVAS_STYLE: Readonly<CanvasStyle> = CANVAS_THEME_PRESETS[DEFAULT_CANVAS_THEME_ID];

/** The figjam preset — the original look, for callers that select it explicitly. */
export const FIGJAM_CANVAS_STYLE: Readonly<CanvasStyle> = CANVAS_THEME_PRESETS.figjam;

/** A fresh, mutable copy of a theme's preset (an unknown or missing id gets the default theme). */
export function canvasThemePreset(id: CanvasThemeId = DEFAULT_CANVAS_THEME_ID): CanvasStyle {
  const preset = CANVAS_THEME_PRESETS[isCanvasThemeId(id) ? id : DEFAULT_CANVAS_THEME_ID];
  return { ...preset, palette: { ...preset.palette } };
}

// ---------------------------------------------------------------------------
// Controls — UI + validation metadata, in display order
// ---------------------------------------------------------------------------

export type CanvasStyleGroup =
  | "board"
  | "text"
  | "shapes"
  | "sections"
  | "icons"
  | "connectors"
  | "stickies"
  | "palette";

export interface CanvasStyleControl {
  /** The token; `"palette"` for the per-color ink rows (see `paletteColor`). */
  key: CanvasStyleKey;
  /** Set when `key === "palette"`: the roster color this row edits. */
  paletteColor?: CanvasColor;
  group: CanvasStyleGroup;
  label: string;
  description?: string;
  kind: "number" | "color" | "select" | "boolean";
  /** `number` controls: the clamp range and slider step. */
  min?: number;
  max?: number;
  step?: number;
  /**
   * `number` controls: after clamping, the value snaps to the nearest
   * multiple of `step` (`snapToControlStep`). `min` and `max` must be
   * multiples of `step`, so a snapped value stays in range.
   */
  snap?: boolean;
  /** `select` controls: the allowed values, in display order. */
  options?: readonly { value: string; label: string }[];
  /** Show the control only while another token has this value (e.g. tint tokens under layer-cake fills). */
  visibleWhen?: { key: CanvasStyleKey; equals: string | number | boolean };
}

const FONT_OPTIONS = [
  { value: "sans", label: "Sans (Inter)" },
  { value: "mono", label: "Mono (IBM Plex Mono)" },
] as const;

const LAYER_CAKE_ONLY = { key: "sectionFill", equals: "layer-cake" } as const;

function paletteRow(color: CanvasColor): CanvasStyleControl {
  return {
    key: "palette",
    paletteColor: color,
    group: "palette",
    label: `${color[0]!.toUpperCase()}${color.slice(1)}`,
    description: `Line, border, and tile color for ${color} objects.`,
    kind: "color",
  };
}

/** One control per token (and one row per palette ink), in display order. */
export const CANVAS_STYLE_CONTROLS: readonly CanvasStyleControl[] = [
  // Board
  {
    key: "theme",
    group: "board",
    label: "Theme",
    description: "The preset every other setting starts from; each theme keeps its own edits.",
    kind: "select",
    options: CANVAS_THEME_IDS.map((id) => ({ value: id, label: CANVAS_THEME_LABELS[id] })),
  },
  { key: "boardBackground", group: "board", label: "Background", kind: "color" },
  { key: "gridDotColor", group: "board", label: "Grid dots", kind: "color" },
  {
    key: "hairlineColor",
    group: "board",
    label: "Hairlines",
    description: "Label chip borders, card sticky borders, and white section frames.",
    kind: "color",
  },
  // Text
  { key: "textColor", group: "text", label: "Name color", kind: "color" },
  // Whole hundreds only: resvg (the agent camera) paints the regular face for
  // any other weight, while browsers paint a neighbouring face.
  { key: "textFontWeight", group: "text", label: "Name weight", kind: "number", min: 300, max: 900, step: 100, snap: true },
  {
    key: "textFontSizePx",
    group: "text",
    label: "Name size",
    description: "Shape text and icon labels.",
    kind: "number",
    min: 10,
    max: 28,
    step: 0.5,
  },
  { key: "detailColor", group: "text", label: "Detail color", kind: "color" },
  { key: "detailFont", group: "text", label: "Detail font", kind: "select", options: FONT_OPTIONS },
  { key: "detailFontSizePx", group: "text", label: "Detail size", kind: "number", min: 9, max: 20, step: 0.5 },
  // Shapes
  {
    key: "processCornerRadiusPx",
    group: "shapes",
    label: "Process corner radius",
    description: "The default rounded-rect shape (process and rectangle objects).",
    kind: "number",
    min: 0,
    max: 24,
    step: 0.5,
  },
  {
    key: "shapeCornerRadiusPx",
    group: "shapes",
    label: "Corner radius",
    description: "Other rectangle-family shapes (predefined process).",
    kind: "number",
    min: 0,
    max: 24,
    step: 0.5,
  },
  { key: "shapeBorderWidthPx", group: "shapes", label: "Border width", kind: "number", min: 0.5, max: 8, step: 0.5 },
  {
    key: "shapeFill",
    group: "shapes",
    label: "Fill",
    kind: "select",
    options: [
      { value: "tint", label: "Tint" },
      { value: "card", label: "Card" },
    ],
  },
  {
    key: "cardFill",
    group: "shapes",
    label: "Card fill",
    description: "Card shapes, card stickies, and outlined white icon tiles.",
    kind: "color",
  },
  // Sections
  { key: "sectionCornerRadiusPx", group: "sections", label: "Corner radius", kind: "number", min: 0, max: 24, step: 0.5 },
  { key: "sectionBorderWidthPx", group: "sections", label: "Border width", kind: "number", min: 0.5, max: 6, step: 0.5 },
  { key: "titleChipCornerRadiusPx", group: "sections", label: "Title chip radius", kind: "number", min: 0, max: 16, step: 0.5 },
  { key: "titleChipBorderWidthPx", group: "sections", label: "Title chip border", kind: "number", min: 0.5, max: 4, step: 0.5 },
  {
    key: "sectionFill",
    group: "sections",
    label: "Fill",
    kind: "select",
    options: [
      { value: "flat", label: "Flat wash" },
      { value: "layer-cake", label: "Layer cake" },
    ],
  },
  {
    key: "sectionTintBase",
    group: "sections",
    label: "Tint",
    description: "Ink weight of a top-level section's fill.",
    kind: "number",
    min: 0,
    max: 0.5,
    step: 0.005,
    visibleWhen: LAYER_CAKE_ONLY,
  },
  {
    key: "sectionTintStep",
    group: "sections",
    label: "Tint per level",
    description: "Ink weight added for each level of nesting.",
    kind: "number",
    min: 0,
    max: 0.2,
    step: 0.005,
    visibleWhen: LAYER_CAKE_ONLY,
  },
  {
    key: "sectionTintMax",
    group: "sections",
    label: "Tint cap",
    kind: "number",
    min: 0,
    max: 0.6,
    step: 0.01,
    visibleWhen: LAYER_CAKE_ONLY,
  },
  {
    key: "sectionTintMixBase",
    group: "sections",
    label: "Tint base",
    description: "The color the ink is mixed into.",
    kind: "color",
    visibleWhen: LAYER_CAKE_ONLY,
  },
  {
    key: "sectionBorderOpacity",
    group: "sections",
    label: "Border opacity",
    kind: "number",
    min: 0,
    max: 1,
    step: 0.05,
    visibleWhen: LAYER_CAKE_ONLY,
  },
  {
    key: "headerPlacement",
    group: "sections",
    label: "Header",
    kind: "select",
    options: [
      { value: "floating", label: "Floating chip" },
      { value: "pinned", label: "Pinned to corner" },
    ],
  },
  { key: "headerFont", group: "sections", label: "Header font", kind: "select", options: FONT_OPTIONS },
  { key: "headerUppercase", group: "sections", label: "Uppercase header", kind: "boolean" },
  { key: "headerFontSizePx", group: "sections", label: "Header size", kind: "number", min: 9, max: 24, step: 0.5 },
  {
    key: "headerChipMix",
    group: "sections",
    label: "Header strength",
    description: "Ink weight of the header chip over its section's fill.",
    kind: "number",
    min: 0,
    max: 0.6,
    step: 0.01,
    visibleWhen: LAYER_CAKE_ONLY,
  },
  // Icons
  {
    key: "iconPack",
    group: "icons",
    label: "Icon set",
    kind: "select",
    options: [
      { value: "nucleo", label: "Nucleo" },
      { value: "tabler", label: "Tabler" },
    ],
  },
  {
    key: "iconStyle",
    group: "icons",
    label: "Icon style",
    kind: "select",
    options: [
      { value: "glyph", label: "Glyph" },
      { value: "tile", label: "Tile" },
    ],
  },
  {
    key: "iconTileGlyphColor",
    group: "icons",
    label: "Tile glyph color",
    kind: "color",
    visibleWhen: { key: "iconStyle", equals: "tile" },
  },
  {
    key: "iconTileMaxPx",
    group: "icons",
    label: "Tile size",
    description: "Largest tile side: the tile is at most this big, centered in the icon box, with the caption under it.",
    kind: "number",
    min: 24,
    max: 240,
    step: 4,
    visibleWhen: { key: "iconStyle", equals: "tile" },
  },
  {
    key: "iconTileFill",
    group: "icons",
    label: "Tile fill",
    description: "Solid ink tiles, light tinted tiles with an ink border, or auto: solid for small icons, tinted for large ones.",
    kind: "select",
    options: [
      { value: "auto", label: "Auto (by size)" },
      { value: "solid", label: "Solid" },
      { value: "tint", label: "Tint" },
    ],
    visibleWhen: { key: "iconStyle", equals: "tile" },
  },
  {
    key: "iconTileSolidMaxPx",
    group: "icons",
    label: "Solid tile up to",
    description: "Auto tile fill: tiles up to this size are solid; larger tiles are tinted.",
    kind: "number",
    min: 24,
    max: 240,
    step: 4,
    visibleWhen: { key: "iconStyle", equals: "tile" },
  },
  // Connectors
  { key: "connectorStrokeWidthPx", group: "connectors", label: "Line width", kind: "number", min: 1, max: 8, step: 0.5 },
  { key: "connectorCornerRadiusPx", group: "connectors", label: "Bend radius", kind: "number", min: 0, max: 40, step: 0.5 },
  { key: "labelChipCornerRadiusPx", group: "connectors", label: "Label chip radius", kind: "number", min: 0, max: 15, step: 0.5 },
  { key: "connectorLabelFont", group: "connectors", label: "Label font", kind: "select", options: FONT_OPTIONS },
  { key: "connectorLabelFontSizePx", group: "connectors", label: "Label size", kind: "number", min: 9, max: 24, step: 0.5 },
  { key: "connectorLabelHeightPx", group: "connectors", label: "Label chip height", kind: "number", min: 16, max: 48, step: 1 },
  { key: "connectorLabelBackground", group: "connectors", label: "Label background", kind: "color" },
  { key: "connectorLabelTextColor", group: "connectors", label: "Label text", kind: "color" },
  // Stickies
  {
    key: "stickyStyle",
    group: "stickies",
    label: "Sticky style",
    kind: "select",
    options: [
      { value: "paper", label: "Paper note" },
      { value: "card", label: "Card" },
    ],
  },
  // Palette
  ...CANVAS_COLORS.map(paletteRow),
];

export const CANVAS_STYLE_GROUP_LABELS: Readonly<Record<CanvasStyleGroup, string>> = {
  board: "Board",
  text: "Text",
  shapes: "Shapes",
  sections: "Sections",
  icons: "Icons",
  connectors: "Connectors",
  stickies: "Stickies",
  palette: "Palette",
};

// ---------------------------------------------------------------------------
// Validation + resolution
// ---------------------------------------------------------------------------

type ScalarStyleKey = Exclude<CanvasStyleKey, "theme" | "palette">;

/** Every scalar token's control (theme and the palette rows are handled on their own). */
const SCALAR_CONTROLS = CANVAS_STYLE_CONTROLS.filter(
  (control): control is CanvasStyleControl & { key: ScalarStyleKey } =>
    control.key !== "theme" && control.key !== "palette",
);

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * `value` on the step grid of a `snap` control: the nearest multiple of
 * `step`, ties rounding up (font weights 450 -> 500, 550 -> 600, 650 -> 700:
 * the faces CSS font matching paints for those weights). Any other control
 * returns `value` unchanged.
 */
export function snapToControlStep(control: CanvasStyleControl, value: number): number {
  if (!control.snap || !control.step) return value;
  return Math.round(value / control.step) * control.step;
}

/** `value` validated for `control`, or undefined when it is not a legal value. */
function validTokenValue(control: CanvasStyleControl, value: unknown): string | number | boolean | undefined {
  switch (control.kind) {
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
      return snapToControlStep(control, Math.min(control.max ?? value, Math.max(control.min ?? value, value)));
    case "color":
      return normalizeColor(value) ?? undefined;
    case "select":
      return typeof value === "string" && control.options?.some((option) => option.value === value)
        ? value
        : undefined;
    case "boolean":
      return typeof value === "boolean" ? value : undefined;
  }
}

/** `base` with every valid token in `input` applied (unknown keys, `theme`, and invalid values ignored). */
function applyStyleInput(base: CanvasStyle, input: Record<string, unknown>): CanvasStyle {
  const out: CanvasStyle = { ...base, palette: { ...base.palette } };
  const writable = out as unknown as Record<ScalarStyleKey, unknown>;
  for (const control of SCALAR_CONTROLS) {
    if (!(control.key in input)) continue;
    const value = validTokenValue(control, input[control.key]);
    if (value !== undefined) writable[control.key] = value;
  }
  const palette = input.palette;
  if (isRecord(palette)) {
    for (const color of CANVAS_COLORS) {
      const ink = normalizeColor(palette[color]);
      if (ink) out.palette[color] = ink;
    }
  }
  return out;
}

/**
 * A complete style from any partial bag. The base is the preset of
 * `input.theme` (the default theme, schematic-light, when absent or unknown);
 * every known, valid token in
 * the bag is applied over it — numbers clamped to their control range, colors
 * canonicalized, palette inks merged one by one. Unknown keys and invalid
 * values are dropped, so any parsed JSON is safe input. A settings document
 * (it carries `themes`) resolves through `resolveCanvasStyle`.
 */
export function normalizeCanvasStyle(input: unknown): CanvasStyle {
  const bag = isRecord(input) ? input : {};
  if (isRecord(bag.themes)) return resolveCanvasStyle(bag);
  return applyStyleInput(canvasThemePreset(isCanvasThemeId(bag.theme) ? bag.theme : DEFAULT_CANVAS_THEME_ID), bag);
}

/**
 * The tokens of `style` that differ from its own theme's preset — what a host
 * persists for that theme. Palette inks diff one by one; `palette` is present
 * only when at least one ink differs.
 */
export function canvasStyleOverrides(style: CanvasStyle): CanvasStyleOverrides {
  const resolved = normalizeCanvasStyle(style);
  const preset = CANVAS_THEME_PRESETS[resolved.theme];
  const overrides: CanvasStyleOverrides = {};
  const writable = overrides as Record<ScalarStyleKey, unknown>;
  for (const control of SCALAR_CONTROLS) {
    if (resolved[control.key] !== preset[control.key]) writable[control.key] = resolved[control.key];
  }
  const palette: Partial<CanvasStylePalette> = {};
  for (const color of CANVAS_COLORS) {
    if (resolved.palette[color] !== preset.palette[color]) palette[color] = resolved.palette[color];
  }
  if (Object.keys(palette).length > 0) overrides.palette = palette;
  return overrides;
}

/** A raw override bag for `theme`, validated and reduced to what differs from that theme's preset. */
export function normalizeCanvasStyleOverrides(raw: unknown, theme: CanvasThemeId): CanvasStyleOverrides {
  return canvasStyleOverrides(applyStyleInput(canvasThemePreset(theme), isRecord(raw) ? raw : {}));
}

/** The theme the pre-theme settings format (a flat token bag) customized: figjam, the only look then. */
const LEGACY_SETTINGS_THEME_ID: CanvasThemeId = "figjam";

/** Whether a settings bag without `themes` carries any style token — a pre-theme overrides file. */
function isLegacyOverridesBag(bag: Record<string, unknown>): boolean {
  return "palette" in bag || SCALAR_CONTROLS.some((control) => control.key in bag);
}

/**
 * The settings document from any parsed JSON. `theme` defaults to the
 * default theme (schematic-light) — a missing, empty, or malformed file means
 * schematic-light with no overrides. Each `themes` entry is validated against
 * its own preset, and entries that end up empty are dropped. A file without
 * `themes` is the pre-theme format — a flat bag of token overrides — and
 * becomes the overrides of its theme: the one the bag names, else figjam
 * (pre-theme files were figjam customizations).
 */
export function normalizeCanvasStyleSettings(raw: unknown): CanvasStyleSettings {
  const bag = isRecord(raw) ? raw : {};
  const theme = isCanvasThemeId(bag.theme)
    ? bag.theme
    : !isRecord(bag.themes) && isLegacyOverridesBag(bag)
      ? LEGACY_SETTINGS_THEME_ID
      : DEFAULT_CANVAS_THEME_ID;
  const themes: CanvasStyleSettings["themes"] = {};
  const add = (id: CanvasThemeId, overrides: CanvasStyleOverrides) => {
    if (Object.keys(overrides).length > 0) themes[id] = overrides;
  };
  if (isRecord(bag.themes)) {
    const entries = bag.themes;
    for (const id of CANVAS_THEME_IDS) {
      if (isRecord(entries[id])) add(id, normalizeCanvasStyleOverrides(entries[id], id));
    }
  } else {
    add(theme, normalizeCanvasStyleOverrides(bag, theme));
  }
  return { theme, themes };
}

/** The style a settings document describes: the active theme's preset plus that theme's overrides. */
export function resolveCanvasStyle(settings: unknown): CanvasStyle {
  const { theme, themes } = normalizeCanvasStyleSettings(settings);
  return applyStyleInput(canvasThemePreset(theme), themes[theme] ?? {});
}

/** Workspace-relative file Studio and the Canvas MCP read the settings from. */
export const CANVAS_STYLE_FILENAME = "canvas-style.json";
