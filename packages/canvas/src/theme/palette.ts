"use client";

/**
 * palette.ts — the canonical 10-pick ink/fill/wash color table (P0,
 * OBJECT-DEF-OVERHAUL.md §3.1/§3.2, D1/D2/D7/D12).
 *
 * A theme leaf module (sibling of tokens.ts), deliberately NOT inside
 * `state/` or `objects/`: `tokens.ts` and `objects/` must both be able to
 * import it without a layering violation (theme must not import objects/,
 * and objects/ sits above theme) — see OBJECT-DEF-OVERHAUL.md §3.6. This
 * kills the sticky-hex duplication hazard flagged in tokens.ts's
 * STICKY_TOKEN_FILL comment and gives every kind (shape / sticky / section /
 * connector) one shared source for "what does color X look like here".
 *
 * Import discipline (enforced by packages/canvas/src/__tests__/boundaries):
 * this file may import ONLY `state/schema/colors.ts` (the id vocabulary), the
 * pure color math (`./color-math.ts`), and the CanvasStyle type. It must NOT
 * import tokens.ts or anything under objects/.
 *
 * Model:
 *   - ink: line-safe stroke color. Picker swatches use ink, and shapes,
 *     connectors, and section title-chip borders all stroke with it.
 *   - fill: object/chip body color. Shapes and title chips use shape fill;
 *     stickies may use a stickier hue-specific fill from the same family.
 *   - wash: lightest section background tint, kept lighter than objects.
 *
 * Provenance notes: yellow/orange/gray inks reuse sampled FigJam connector
 * strokes (#E8A302 mustard, #EB7500 orange, #757575 gray) so 2px lines read
 * on the #F5F5F5 board; violet ink carries the sampled saturated stroke.
 * Red/green/blue/pink inks are OKLCH picks tuned line-safe against the board
 * — racing red #D5322F, kelly #019142, cobalt #1A5CDF, flamingo #B74D85 —
 * from reference/board-design-reference/analysis/mw2-palette-proposal.html.
 * Teal fill is lightened from the sampled #5AD8CC to #C6FAF6 so it sits in
 * the same pastel band as its siblings; teal wash #EAFDFB is derived. White
 * strokes use the near-neutral stone #757980 with #DBDEE3/#C1C4CB chips.
 */

import type { CanvasColor, CanvasHue } from "../state/schema/colors";
import { CANVAS_COLORS } from "../state/schema/colors";
import type { CanvasStyle } from "./canvas-style";
import { contrastRatio, ensureContrast, mixColors, oklabDistance, oklabLightness, withAlpha } from "./color-math";

export type ShapeColors = {
  fill: string;
  /** Ink border; every pick now renders a visible border. */
  border: string;
};

export type SectionChipColors = {
  fill: string;
  border: string;
};

export type SectionColors = {
  tint: string;
  chip: SectionChipColors;
};

export type Swatch = {
  /** Picker preview hex. White remains #FFFFFF and uses the picker contrast ring. */
  swatch: string;
  shape: ShapeColors;
  section: SectionColors;
  /** Exact sticky fill hex. */
  sticky: string;
  /** Connector stroke hex. */
  connector: string;
};

export const CANVAS_PALETTE: Record<CanvasColor, Swatch> = {
  gray: {
    swatch: "#757575",
    shape: { fill: "#E6E6E6", border: "#757575" },
    section: { tint: "#F9F9F9", chip: { fill: "#E6E6E6", border: "#757575" } },
    sticky: "#E6E6E6",
    connector: "#757575",
  },
  red: {
    swatch: "#D5322F",
    shape: { fill: "#FFD2CC", border: "#D5322F" },
    section: { tint: "#FEF3F1", chip: { fill: "#FFD2CC", border: "#D5322F" } },
    sticky: "#FFBFB7",
    connector: "#D5322F",
  },
  orange: {
    swatch: "#EB7500",
    shape: { fill: "#FFE0C2", border: "#EB7500" },
    section: { tint: "#FFF7F0", chip: { fill: "#FFE0C2", border: "#EB7500" } },
    sticky: "#FFE0C2",
    connector: "#EB7500",
  },
  yellow: {
    swatch: "#E8A302",
    shape: { fill: "#FFECBD", border: "#E8A302" },
    section: { tint: "#FFFBF0", chip: { fill: "#FFECBD", border: "#E8A302" } },
    sticky: "#FFE299",
    connector: "#E8A302",
  },
  green: {
    swatch: "#019142",
    shape: { fill: "#C5E9CB", border: "#019142" },
    section: { tint: "#F0F8F2", chip: { fill: "#C5E9CB", border: "#019142" } },
    sticky: "#C5E9CB",
    connector: "#019142",
  },
  teal: {
    swatch: "#369E94",
    shape: { fill: "#C6FAF6", border: "#369E94" },
    section: { tint: "#EAFDFB", chip: { fill: "#C6FAF6", border: "#369E94" } },
    sticky: "#C6FAF6",
    connector: "#369E94",
  },
  blue: {
    swatch: "#1A5CDF",
    shape: { fill: "#CDDFFF", border: "#1A5CDF" },
    section: { tint: "#F1F6FE", chip: { fill: "#CDDFFF", border: "#1A5CDF" } },
    sticky: "#B9D2FF",
    connector: "#1A5CDF",
  },
  violet: {
    swatch: "#9747FF",
    shape: { fill: "#DCCCFF", border: "#9747FF" },
    section: { tint: "#F8F5FF", chip: { fill: "#DCCCFF", border: "#9747FF" } },
    sticky: "#DCCCFF",
    connector: "#9747FF",
  },
  pink: {
    swatch: "#B74D85",
    shape: { fill: "#F9D1E3", border: "#B74D85" },
    section: { tint: "#FDF3F7", chip: { fill: "#F9D1E3", border: "#B74D85" } },
    sticky: "#F9D1E3",
    connector: "#B74D85",
  },
  white: {
    swatch: "#FFFFFF",
    shape: { fill: "#FFFFFF", border: "#757980" },
    section: { tint: "#FFFFFF", chip: { fill: "#DBDEE3", border: "#C1C4CB" } },
    sticky: "#FFFFFF",
    connector: "#757980",
  },
};

export { CANVAS_COLORS };
export type { CanvasColor, CanvasHue };

function swatchFor(color: CanvasColor): Swatch {
  const entry = CANVAS_PALETTE[color];
  if (!entry) {
    throw new Error(`palette.ts: unknown CanvasColor "${color}"`);
  }
  return entry;
}

/** Resolves a color pick to its shape fill/ink-border pair. */
export function resolveShapeColors(color: CanvasColor): ShapeColors {
  return swatchFor(color).shape;
}

/** Resolves a color pick to its section wash + title-chip colors. */
export function resolveSectionColors(color: CanvasColor): SectionColors {
  return swatchFor(color).section;
}

/** Resolves a color pick to its exact sticky fill hex. */
export function resolveStickyFill(color: CanvasColor): string {
  return swatchFor(color).sticky;
}

/** Resolves a color pick to its connector ink stroke hex. */
export function resolveConnectorStroke(color: CanvasColor): string {
  return swatchFor(color).connector;
}

/** Resolves a color pick to its picker-preview swatch hex. */
export function resolveSwatchPreview(color: CanvasColor): string {
  return swatchFor(color).swatch;
}

// ---------------------------------------------------------------------------
// Theme-aware paints — every kind's colors under a CanvasStyle
// ---------------------------------------------------------------------------
//
// The figjam modes (`tint` shapes, `flat` sections, `glyph` icons, `paper`
// stickies) read the role tables above, so with the figjam palette they
// return exactly what the renderers have always painted. The schematic modes
// derive every color from the palette ink plus a few surface tokens (see the
// rules on each resolver). Inks come from `style.palette`, so a palette
// override recolors lines, borders, and tiles in every mode.

/** Text on a figjam-mode pastel is pushed to this WCAG contrast when a dark theme borrows the mode. */
const MIN_TEXT_CONTRAST = 4.5;
/** Section header detail: WCAG contrast floor against its chip. */
const HEADER_DETAIL_MIN_CONTRAST = 3;
/** Section header detail starts as the ink mixed into the chip at this weight. */
const HEADER_DETAIL_INK_WEIGHT = 0.6;
/** Layer-cake chip border: the ink at this opacity. */
const SECTION_CHIP_BORDER_OPACITY = 0.5;
/**
 * Dark guard: least perceptual (OKLab) distance kept between a section fill
 * and the card fill — a tint that differs from the cards in hue is already
 * clear of them; one that shares their hue must differ in lightness.
 */
const DARK_GUARD_MIN_CARD_DISTANCE = 0.03;
/** The guard is on only when the mix base itself stands this far (OKLab L) from the cards. */
const DARK_GUARD_MIN_LIGHTNESS_GAP = 0.03;
/** Dark guard: how far the ink weight moves per try. */
const DARK_GUARD_WEIGHT_STEP = 0.005;
/** Dark guard: a moved level must still read at least this much (OKLab L) apart from its parent level. */
const LAYER_MIN_LIGHTNESS_GAP = 0.015;
/** Paper sticky body text: the text color at this opacity. */
const PAPER_STICKY_TEXT_OPACITY = 0.8;

/**
 * Resolved paints per style object: every renderer resolves the same few
 * (kind, color, depth) paints over and over (a section's frame and its chip
 * each ask once per render), and the schematic section paint runs color math
 * — mixes, OKLab distances, contrast searches — so each style keeps its
 * results. Keyed weakly by the style object: styles are immutable values
 * (presets are frozen; renderers resolve one per settings change), and a
 * dropped style drops its cache. Paints come back frozen — they are shared.
 */
const PAINT_CACHE = new WeakMap<CanvasStyle, Map<string, unknown>>();

function cachedPaint<T extends object>(style: CanvasStyle, key: string, compute: () => T): T {
  let cache = PAINT_CACHE.get(style);
  if (!cache) {
    cache = new Map();
    PAINT_CACHE.set(style, cache);
  }
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  const paint = Object.freeze(compute());
  cache.set(key, paint);
  return paint;
}

export type ShapePaint = {
  fill: string;
  border: string;
  text: string;
};

export type SectionPaint = {
  /** Section body (opaque). */
  fill: string;
  /** Frame border. */
  border: string;
  /** Header chip body (opaque). */
  chipFill: string;
  /** Header chip border (a pinned header draws only its right and bottom edges). */
  chipBorder: string;
  /** Header title. */
  headerText: string;
  /** Header detail run after the title. */
  headerDetail: string;
  /** Header icon tile. In glyph mode there is no tile: this is the chip fill, so even a drawn tile is invisible. */
  iconTile: string;
  /** Header icon tile border — only the outlined white tile has one. */
  iconTileBorder: string | null;
  /** Header icon glyph. */
  iconGlyph: string;
};

export type IconPaint = {
  /** Tile body; null in glyph mode (no tile). */
  tileFill: string | null;
  tileBorder: string | null;
  /** Glyph stroke — and fill, for fill-painted (brand) glyphs. */
  glyph: string;
  /** Glyph mode only: paint for the glyph's own closed interiors (null on tiles). */
  glyphFill: string | null;
  /** Label text under the icon. */
  label: string;
};

export type StickyPaint = {
  fill: string;
  border: string | null;
  /** 2px left rule (card stickies). */
  rule: string | null;
  text: string;
  shadow: boolean;
};

export type ConnectorPaint = {
  stroke: string;
};

/** The ink — line / stroke / tile color — of a color pick under `style`. */
export function resolveInk(color: CanvasColor, style: CanvasStyle): string {
  return style.palette?.[color] ?? swatchFor(color).connector;
}

/** Light vs dark theme, judged by the board surface. */
function isLightBoard(style: CanvasStyle): boolean {
  return oklabLightness(style.boardBackground) >= 0.5;
}

/** `text` unchanged when it reads on `background`, else pushed to MIN_TEXT_CONTRAST. */
function readableOn(text: string, background: string): string {
  return contrastRatio(text, background) >= MIN_TEXT_CONTRAST
    ? text
    : ensureContrast(text, background, MIN_TEXT_CONTRAST);
}

/**
 * Shape fill / border / text. `tint`: the pastel role-table fill with an ink
 * border (figjam). `card`: fill = cardFill, border = ink, text = textColor.
 */
export function resolveShapePaint(color: CanvasColor, style: CanvasStyle): ShapePaint {
  return cachedPaint(style, `shape|${color}`, () => shapePaint(color, style));
}

function shapePaint(color: CanvasColor, style: CanvasStyle): ShapePaint {
  const border = resolveInk(color, style);
  if (style.shapeFill === "card") return { fill: style.cardFill, border, text: style.textColor };
  const fill = swatchFor(color).shape.fill;
  return { fill, border, text: readableOn(style.textColor, fill) };
}

/**
 * Icon object paint. `glyph` (figjam): the bare glyph in the ink, closed
 * interiors in the shape fill. `tile`: tile = ink, glyph = iconTileGlyphColor;
 * `white` on a light board becomes an outlined tile (cardFill, ink border,
 * ink glyph) instead of a solid near-black square.
 */
export function resolveIconPaint(color: CanvasColor, style: CanvasStyle): IconPaint {
  return cachedPaint(style, `icon|${color}`, () => iconPaint(color, style));
}

function iconPaint(color: CanvasColor, style: CanvasStyle): IconPaint {
  const ink = resolveInk(color, style);
  const label = style.textColor;
  if (style.iconStyle !== "tile") {
    return { tileFill: null, tileBorder: null, glyph: ink, glyphFill: resolveShapePaint(color, style).fill, label };
  }
  if (color === "white" && isLightBoard(style)) {
    return { tileFill: style.cardFill, tileBorder: ink, glyph: ink, glyphFill: null, label };
  }
  return { tileFill: ink, tileBorder: null, glyph: style.iconTileGlyphColor, glyphFill: null, label };
}

/** Ink weight of a tinted icon tile over the card fill. */
const ICON_TILE_TINT_WEIGHT = 0.16;
/** Border width of the outlined `white` tile (light boards), px. */
const ICON_TILE_OUTLINE_WIDTH_PX = 1;

/** The tile body an icon gets in the tile style. */
export type IconTileMode = "solid" | "tint";

export type IconTilePaint = IconPaint & {
  /** The tile body (`iconTileFill` resolved for this icon's size); null in glyph style. */
  tileMode: IconTileMode | null;
  /** Width of the tile border, px (0 without one). */
  tileBorderWidthPx: number;
};

/**
 * The tile body an icon whose glyph box is `sizePx` (the smaller side of its
 * box) gets: `iconTileFill`, with `auto` = solid up to `iconTileSolidMaxPx`
 * and tinted above, so large icons do not become heavy solid blocks.
 */
export function iconTileModeFor(style: CanvasStyle, sizePx: number): IconTileMode {
  if (style.iconTileFill === "solid" || style.iconTileFill === "tint") return style.iconTileFill;
  return sizePx <= style.iconTileSolidMaxPx ? "solid" : "tint";
}

/**
 * resolveIconPaint for an icon of glyph-box size `sizePx`, with the tile body
 * `iconTileFill` picks (resolveIconPaint itself is unchanged: it is the solid
 * tile). `solid`: the ink tile under the tile glyph color. `tint`: a light
 * ink tint — mix(ink, cardFill, 0.16), opaque — bordered in the ink at the
 * shape border width, with an ink glyph. `white` on a light board keeps its
 * outlined tile (card fill, 1px ink border, ink glyph) at every size. Glyph
 * style ignores the size.
 */
export function resolveIconTilePaint(color: CanvasColor, style: CanvasStyle, sizePx: number): IconTilePaint {
  const paint = resolveIconPaint(color, style);
  if (paint.tileFill === null) return { ...paint, tileMode: null, tileBorderWidthPx: 0 };
  const tileMode = iconTileModeFor(style, sizePx);
  if (paint.tileBorder !== null) return { ...paint, tileMode, tileBorderWidthPx: ICON_TILE_OUTLINE_WIDTH_PX };
  if (tileMode === "solid") return { ...paint, tileMode, tileBorderWidthPx: 0 };
  const ink = resolveInk(color, style);
  return {
    ...paint,
    tileFill: mixColors(ink, style.cardFill, ICON_TILE_TINT_WEIGHT),
    tileBorder: ink,
    glyph: ink,
    tileMode,
    tileBorderWidthPx: style.shapeBorderWidthPx,
  };
}

/**
 * Sticky paint. `paper` (figjam): the sticky role-table fill, no border, a
 * shadow. `card`: cardFill, hairline border, a 2px left rule in the ink, no
 * shadow.
 */
export function resolveStickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  return cachedPaint(style, `sticky|${color}`, () => stickyPaint(color, style));
}

function stickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  if (style.stickyStyle === "card") {
    return {
      fill: style.cardFill,
      border: style.hairlineColor,
      rule: resolveInk(color, style),
      text: style.textColor,
      shadow: false,
    };
  }
  const fill = swatchFor(color).sticky;
  // The paper body has always been the text color at 80% (INSET_BODY_TEXT_SLOT: rgba(0, 0, 0, 0.8)).
  const text = withAlpha(readableOn(style.textColor, fill), PAPER_STICKY_TEXT_OPACITY);
  return { fill, border: null, rule: null, text, shadow: true };
}

/** Connector stroke = the ink. */
export function resolveConnectorPaint(color: CanvasColor, style: CanvasStyle): ConnectorPaint {
  return cachedPaint(style, `connector|${color}`, () => ({ stroke: resolveInk(color, style) }));
}

/**
 * Section paint at nesting `depth` (1 = top-level section; see
 * state/section-depth.ts).
 *
 * `flat` (figjam): the role-table wash, frame border = chip fill, chip border
 * = ink (white keeps its light-gray chip border); the header detail is
 * detailColor (contrast-guarded).
 *
 * `layer-cake`: fill = opaque sRGB mix(ink, sectionTintMixBase, t(d)) with
 * t(d) = min(sectionTintMax, sectionTintBase + sectionTintStep·(d−1)), border
 * = ink at sectionBorderOpacity, chip = mix(ink, fill, headerChipMix), chip
 * border = ink at 50%, header detail = mix(ink, chip, 0.6) pushed toward the
 * ink until it reaches 3:1 against the chip. Dark guard: when a fill sits
 * within 0.03 (OKLab distance) of the card fill, t moves to the nearest
 * weight — up or down, within [sectionTintBase / 2, sectionTintMax] — whose
 * fill clears the cards while staying a distinct layer above its parent;
 * when none does the level gives up the cards, never its place below its
 * parent (see layerCakeFill). `white` on a light
 * board is a plain card-colored section (hairline frame and chip border, chip
 * = mix(hairline, cardFill, 0.5)); on a dark board white takes the gray rule,
 * as in the approved schematic mockups.
 */
export function resolveSectionPaint(
  color: CanvasColor,
  depth: number,
  style: CanvasStyle,
): SectionPaint {
  // Flat paints ignore depth, so every level shares one cache entry.
  return style.sectionFill === "layer-cake"
    ? cachedPaint(style, `section|${color}|${depth}`, () => layerCakeSectionPaint(color, depth, style))
    : cachedPaint(style, `section|${color}`, () => flatSectionPaint(color, style));
}

function flatSectionPaint(color: CanvasColor, style: CanvasStyle): SectionPaint {
  const family = swatchFor(color).section;
  const chipFill = family.chip.fill;
  const headerText = readableOn(style.textColor, chipFill);
  return {
    fill: family.tint,
    // Per spec the section border IS the title chip's fill color.
    border: chipFill,
    chipFill,
    chipBorder: color === "white" ? family.chip.border : resolveInk(color, style),
    headerText,
    headerDetail: ensureContrast(style.detailColor, chipFill, HEADER_DETAIL_MIN_CONTRAST, headerText),
    ...sectionIconPaint(color, chipFill, style),
  };
}

function layerCakeSectionPaint(color: CanvasColor, depth: number, style: CanvasStyle): SectionPaint {
  if (color === "white" && isLightBoard(style)) {
    const chipFill = mixColors(style.hairlineColor, style.cardFill, 0.5);
    return {
      fill: style.cardFill,
      border: style.hairlineColor,
      chipFill,
      chipBorder: style.hairlineColor,
      headerText: style.textColor,
      headerDetail: headerDetailColor(resolveInk("white", style), chipFill),
      ...sectionIconPaint("white", chipFill, style),
    };
  }
  const paintColor: CanvasColor = color === "white" ? "gray" : color;
  const ink = resolveInk(paintColor, style);
  const fill = layerCakeFill(ink, depth, style);
  const chipFill = mixColors(ink, fill, style.headerChipMix);
  return {
    fill,
    border: withAlpha(ink, style.sectionBorderOpacity),
    chipFill,
    chipBorder: withAlpha(ink, SECTION_CHIP_BORDER_OPACITY),
    headerText: style.textColor,
    headerDetail: headerDetailColor(ink, chipFill),
    ...sectionIconPaint(paintColor, chipFill, style),
  };
}

/** Rounds an ink weight so float noise (0.07 + 0.035 = 0.10500000000000001) never flips a channel's rounding. */
function roundWeight(weight: number): number {
  return Math.round(weight * 1e6) / 1e6;
}

/** Layer-cake ink weight t(d) before the dark guard. */
function layerCakeWeight(level: number, style: CanvasStyle): number {
  return roundWeight(
    Math.min(style.sectionTintMax, style.sectionTintBase + style.sectionTintStep * (level - 1)),
  );
}

function layerCakeFill(ink: string, depth: number, style: CanvasStyle): string {
  const level = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
  const base = style.sectionTintMixBase;
  const fillAt = (weight: number) => mixColors(ink, base, weight);
  // Moving the weight only separates the fill from the cards when the mix
  // base itself stands clear of them (a dark board under raised cards); on a
  // light theme base and card are both white and the guard stays off.
  if (Math.abs(oklabLightness(base) - oklabLightness(style.cardFill)) < DARK_GUARD_MIN_LIGHTNESS_GAP) {
    return fillAt(layerCakeWeight(level, style));
  }
  // The guard walks the levels from the top so a moved level can never fold
  // onto its parent: a level whose natural t(d) fill sits on the cards takes
  // the NEAREST weight (up first on a tie — deeper keeps the hue, shallower
  // washes it out) that clears the cards AND stays a distinct layer above its
  // parent level. When no weight in [t0 / 2, tmax] does, the level gives up
  // the cards (they still carry their ink border) but never the layering: it
  // keeps its own t(d) while that is a distinct layer above its parent, else
  // the nearest deeper weight that is one, else the cap — so a parent the
  // guard moved past this level's t(d) is never repeated below the cap.
  // Levels whose t(d) does not grow (past the cap, or a zero step) reuse the
  // level above.
  const floor = roundWeight(style.sectionTintBase / 2);
  const ceiling = style.sectionTintMax;
  let weight = layerCakeWeight(1, style);
  let parentWeight = Number.NEGATIVE_INFINITY;
  let parentLightness = Number.NEGATIVE_INFINITY;
  let previousNatural = Number.NEGATIVE_INFINITY;
  const distinctLayer = (candidate: number) =>
    candidate > parentWeight &&
    Math.abs(oklabLightness(fillAt(candidate)) - parentLightness) >= LAYER_MIN_LIGHTNESS_GAP;
  const acceptable = (candidate: number) =>
    oklabDistance(fillAt(candidate), style.cardFill) >= DARK_GUARD_MIN_CARD_DISTANCE && distinctLayer(candidate);
  const fallback = (natural: number) => {
    if (distinctLayer(natural)) return natural;
    for (
      let candidate = roundWeight(Math.max(natural, parentWeight) + DARK_GUARD_WEIGHT_STEP);
      candidate <= ceiling;
      candidate = roundWeight(candidate + DARK_GUARD_WEIGHT_STEP)
    ) {
      if (distinctLayer(candidate)) return candidate;
    }
    // No distinct layer fits under the cap: the cap itself — the parent's own
    // weight only when the parent already sits there.
    return ceiling;
  };
  for (let current = 1; current <= level; current += 1) {
    const natural = layerCakeWeight(current, style);
    if (natural <= previousNatural) continue;
    previousNatural = natural;
    let guarded = natural;
    if (!acceptable(natural)) {
      guarded = Number.NaN;
      for (let offset = DARK_GUARD_WEIGHT_STEP; ; offset += DARK_GUARD_WEIGHT_STEP) {
        const up = roundWeight(natural + offset);
        const down = roundWeight(natural - offset);
        const canGoUp = up <= ceiling;
        const canGoDown = down >= floor;
        if (!canGoUp && !canGoDown) break;
        if (canGoUp && acceptable(up)) {
          guarded = up;
          break;
        }
        if (canGoDown && acceptable(down)) {
          guarded = down;
          break;
        }
      }
      if (Number.isNaN(guarded)) guarded = fallback(natural);
    }
    weight = guarded;
    parentWeight = weight;
    parentLightness = oklabLightness(fillAt(weight));
  }
  return fillAt(weight);
}

function headerDetailColor(ink: string, chipFill: string): string {
  return ensureContrast(
    mixColors(ink, chipFill, HEADER_DETAIL_INK_WEIGHT),
    chipFill,
    HEADER_DETAIL_MIN_CONTRAST,
    ink,
  );
}

/** The header icon follows the icon objects' tile/glyph paint; glyph mode has no tile. */
function sectionIconPaint(
  color: CanvasColor,
  chipFill: string,
  style: CanvasStyle,
): Pick<SectionPaint, "iconTile" | "iconTileBorder" | "iconGlyph"> {
  const icon = resolveIconPaint(color, style);
  return { iconTile: icon.tileFill ?? chipFill, iconTileBorder: icon.tileBorder, iconGlyph: icon.glyph };
}
