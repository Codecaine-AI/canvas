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
import {
  contrastRatio,
  ensureContrast,
  mixColors,
  oklabChroma,
  oklabDistance,
  oklabLightness,
  withAlpha,
  withLightnessChroma,
} from "./color-math";

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
//
// In the layer-cake modes the palette color is the hue's ANCHOR, and two
// WCAG floors turn it into paint (resolveInk, inkFill): strokes take the
// anchor pushed to NON_TEXT_CONTRAST against its own node fill, and fills
// take the anchor at the weight that lands on the lightness a TEXT-safe
// anchor's mix would. A text-step anchor (every hue but light yellow) passes
// both floors as it is, so its paint is the plain mix it always was. A light
// anchor (the yellow solid) keeps its chroma in the pale fills, where a dark
// text step mixed toward white turns beige.

/** Text on a figjam-mode pastel is pushed to this WCAG contrast when a dark theme borrows the mode. */
const MIN_TEXT_CONTRAST = 4.5;
/** WCAG 1.4.11 non-text contrast: a layer-cake stroke keeps this against its node fill. */
const NON_TEXT_CONTRAST = 3;
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
  /** Left rule (card stickies), stickyRuleWidthPx wide. */
  rule: string | null;
  text: string;
  /** The paper sticky's down-biased drop shadow (paper stickies only). */
  shadow: boolean;
  /** A card sticky's soft lift: the shadow color, or null for none (paper stickies, dark boards). */
  cardShadow: string | null;
};

export type ConnectorPaint = {
  stroke: string;
};

/** The palette color of a pick: the ink itself in figjam modes, the hue's anchor in layer-cake modes. */
function paletteColor(color: CanvasColor, style: CanvasStyle): string {
  return style.palette?.[color] ?? swatchFor(color).connector;
}

/**
 * The ink — line / stroke / tile color — of a color pick under `style`. Figjam
 * modes stroke in the palette color as it is. Layer-cake modes push the
 * anchor to NON_TEXT_CONTRAST against the pick's node fill (so against the
 * board too), and leave an anchor that already reads there unchanged.
 */
export function resolveInk(color: CanvasColor, style: CanvasStyle): string {
  if (style.sectionFill !== "layer-cake") return paletteColor(color, style);
  return cachedPaint(style, `ink|${color}`, () => ({
    ink: ensureContrast(paletteColor(color, style), shapeFillBase(color, style), NON_TEXT_CONTRAST),
  })).ink;
}

/**
 * The layer-cake fill of `color` at ink `weight` over `base`: the anchor mixed
 * in at the weight that lands on the OKLab lightness that `weight` of the
 * anchor's text-safe step (MIN_TEXT_CONTRAST on the board) gives. A text-step
 * anchor is its own text-safe step: the plain mix.
 */
function inkFill(color: CanvasColor, base: string, weight: number, style: CanvasStyle): string {
  const anchor = paletteColor(color, style);
  const textSafe = ensureContrast(anchor, style.boardBackground, MIN_TEXT_CONTRAST);
  if (textSafe === anchor) return mixColors(anchor, base, weight);
  return lightnessMatchedMix(anchor, base, oklabLightness(mixColors(textSafe, base, weight)));
}

/** Bisection steps for lightnessMatchedMix: far below one 8-bit channel step. */
const LIGHTNESS_MATCH_STEPS = 24;

/** mix(source, base, t) with t chosen so its OKLab lightness is `lightness` (clamped to the reachable range). */
function lightnessMatchedMix(source: string, base: string, lightness: number): string {
  const darker = oklabLightness(source) < oklabLightness(base);
  let low = 0;
  let high = 1;
  for (let step = 0; step < LIGHTNESS_MATCH_STEPS; step += 1) {
    const middle = (low + high) / 2;
    const tooLight = oklabLightness(mixColors(source, base, middle)) > lightness;
    if (tooLight === darker) low = middle;
    else high = middle;
  }
  return mixColors(source, base, (low + high) / 2);
}

/** The fill an `ink-card` node of `color` paints (the card itself in other shape modes). */
function shapeFillBase(color: CanvasColor, style: CanvasStyle): string {
  if (style.shapeFill !== "ink-card") return style.cardFill;
  if (color === "white") return style.boardBackground;
  const lightness = oklabLightness(style.cardFill) - SHAPE_CARD_LIGHTNESS_DROP;
  // Gray's ink is a near-neutral whose faint hue a chroma target would blow up: gray takes the neutral.
  if (color === "gray") return withLightnessChroma(style.cardFill, lightness + SHAPE_CARD_GRAY_LIGHTNESS_LIFT, 0);
  return withLightnessChroma(paletteColor(color, style), lightness, SHAPE_CARD_CHROMA_BY_COLOR[color] ?? SHAPE_CARD_CHROMA);
}

/** Light vs dark theme, judged by the board surface. */
export function isLightBoard(style: CanvasStyle): boolean {
  return oklabLightness(style.boardBackground) >= 0.5;
}

/** `text` unchanged when it reads on `background`, else pushed to MIN_TEXT_CONTRAST. */
function readableOn(text: string, background: string): string {
  return contrastRatio(text, background) >= MIN_TEXT_CONTRAST
    ? text
    : ensureContrast(text, background, MIN_TEXT_CONTRAST);
}

/**
 * An `ink-card` node fill is set in OKLCH, not mixed: the anchor's hue at the
 * card's lightness less SHAPE_CARD_LIGHTNESS_DROP (OKLab L 0.859), at
 * SHAPE_CARD_CHROMA; gray takes a lighter neutral (#DCDCDC) and white the
 * board surface. A node is the figure and its section the ground: the node is
 * the darker, more colorful field, and every section level is a pale tint
 * above it (L 0.95 to 0.96 at top level, about 0.91 at the deepest).
 *
 * Round 3 put nodes at L 0.944, chroma 0.04, just above sections at L 0.89 to
 * 0.91, so a node and a section of one hue stood 0.03 to 0.05 apart and Ford
 * read them as one color (UI climb, after round 2: "items / objects having
 * the same color as the background are still causing readability issues").
 * Now a hued or gray node stands at least 0.049 L and 0.059 OKLab from any
 * section it can sit in, and 0.069 from a section of its own hue.
 *
 * Picked over white node cards with a colored stroke, which named the kind by
 * the 2px border alone (round 2's complaint), and over sections at L 0.965,
 * which faded into the page.
 */
const SHAPE_CARD_LIGHTNESS_DROP = 0.12;
/** OKLCH chroma of an `ink-card` node fill (cut back where sRGB holds less at that lightness). */
const SHAPE_CARD_CHROMA = 0.08;
/**
 * Hues whose node chroma differs. At L 0.859 yellow at 0.08 is a khaki; at
 * 0.11 it reads yellow (#F0CC79). Orange asks for 0.09 and gets about the
 * most sRGB holds there (#FFC298), so it reads orange, not peach.
 */
const SHAPE_CARD_CHROMA_BY_COLOR: Partial<Record<CanvasColor, number>> = { yellow: 0.11, orange: 0.09 };

/**
 * How far a gray node sits above the hued node lightness: L 0.895 (#DEDEDE),
 * not 0.859 (#D0D0D0). At one OKLab lightness a neutral reads darker than a
 * colored fill (the Helmholtz-Kohlrausch effect), so round 4's #D0D0D0 was
 * the heaviest fill on gray-heavy boards, a "concrete slab" that read as
 * disabled (UI climb round 4: argon and fable on 01, 02, 03, 04, 08, 10, h1,
 * h5). Picked from L 0.885, 0.9 and a warm 0.895 on board 02: the warm one
 * read greige. The gray node stays darker than every section: 0.06 L under a
 * gray section, 0.035 under any depth-3 level, where gray nodes sit on the
 * climb boards, and 0.015 under the deepest tint, where its ink border
 * carries it.
 */
const SHAPE_CARD_GRAY_LIGHTNESS_LIFT = 0.036;

/**
 * Shape fill / border / text. `tint`: the pastel role-table fill with an ink
 * border (figjam). `card`: fill = cardFill, border = ink, text = textColor.
 * `ink-card`: fill = the anchor hue in OKLCH (shapeFillBase; gray a neutral,
 * white the board), border = ink, text = textColor kept at 4.5:1.
 */
export function resolveShapePaint(color: CanvasColor, style: CanvasStyle): ShapePaint {
  return cachedPaint(style, `shape|${color}`, () => shapePaint(color, style));
}

function shapePaint(color: CanvasColor, style: CanvasStyle): ShapePaint {
  const border = resolveInk(color, style);
  if (style.shapeFill === "card") {
    return { fill: style.cardFill, border, text: style.textColor };
  }
  if (style.shapeFill === "ink-card") {
    const fill = shapeFillBase(color, style);
    return { fill, border, text: readableOn(style.textColor, fill) };
  }
  const fill = swatchFor(color).shape.fill;
  return { fill, border, text: readableOn(style.textColor, fill) };
}

/**
 * Icon object paint. `glyph` (figjam): the bare glyph in the ink, closed
 * interiors in the shape fill. `tile`: tile = ink (a light anchor's solid,
 * solidTileFill), glyph = iconTileGlyphColor, or the text color where that
 * falls under 4.5:1 on the tile (light yellow and orange: a dark glyph, as
 * the design system's on-solid);
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
  const tile = solidTileFill(color, ink, style);
  return { tileFill: tile, tileBorder: null, glyph: tileGlyphOn(tile, style), glyphFill: null, label };
}

/**
 * A solid tile's body: the ink, or in the layer-cake modes the anchor itself
 * where the anchor is a light solid, not a text step (light yellow and
 * orange). The ink is that solid pushed to 3:1 against the node, a darker
 * mustard and rust that judges read as murky behind the dark on-solid glyph
 * (UI climb round 2: yellow on 06, 09, 12, h6 from all three judges; orange
 * on 14, h1, h3, h4, h5). The solid under the text color is the design
 * system's own solid / on-solid pair: 7.8:1 on yellow, 5.0:1 on orange.
 */
function solidTileFill(color: CanvasColor, ink: string, style: CanvasStyle): string {
  if (style.sectionFill !== "layer-cake") return ink;
  const anchor = paletteColor(color, style);
  return ensureContrast(anchor, style.boardBackground, MIN_TEXT_CONTRAST) === anchor ? ink : anchor;
}

/** The tile glyph color on a solid `ink` tile: iconTileGlyphColor, or the text color where that reads better and the glyph would fall under MIN_TEXT_CONTRAST. */
function tileGlyphOn(ink: string, style: CanvasStyle): string {
  const glyph = style.iconTileGlyphColor;
  if (contrastRatio(glyph, ink) >= MIN_TEXT_CONTRAST) return glyph;
  return contrastRatio(style.textColor, ink) > contrastRatio(glyph, ink) ? style.textColor : glyph;
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
export function resolveIconTilePaint(
  color: CanvasColor,
  style: CanvasStyle,
  sizePx: number,
  brandColor?: string | null,
): IconTilePaint {
  if (brandColor) return cachedPaint(style, `brand-icon|${brandColor}`, () => brandIconPaint(brandColor, style));
  const paint = resolveIconPaint(color, style);
  if (paint.tileFill === null) return { ...paint, tileMode: null, tileBorderWidthPx: 0 };
  const tileMode = iconTileModeFor(style, sizePx);
  if (paint.tileBorder !== null) return { ...paint, tileMode, tileBorderWidthPx: ICON_TILE_OUTLINE_WIDTH_PX };
  if (tileMode === "solid") return { ...paint, tileMode, tileBorderWidthPx: 0 };
  const ink = resolveInk(color, style);
  return {
    ...paint,
    tileFill: style.sectionFill === "layer-cake"
      ? inkFill(color, style.cardFill, ICON_TILE_TINT_WEIGHT, style)
      : mixColors(ink, style.cardFill, ICON_TILE_TINT_WEIGHT),
    tileBorder: ink,
    glyph: ink,
    tileMode,
    tileBorderWidthPx: style.shapeBorderWidthPx,
  };
}

/**
 * Least contrast a brand mark keeps against what it sits on before it falls
 * back to the ink. Logos are exempt from WCAG 1.4.11's 3:1 for graphics, and
 * a 3:1 floor would drop real brand colors (Claude's #D97757 is 2.9:1 on the
 * light card); 2:1 still keeps the mark visible, and catches the brands that
 * vanish: black marks on the dark card, Hugging Face yellow, React and
 * Supabase on the light card. Canvas-owned: no token names this.
 */
export const BRAND_MARK_MIN_CONTRAST = 2;

/** The brand color where it keeps BRAND_MARK_MIN_CONTRAST on `background`, else the ink (the monochrome logo). */
function visibleBrandColor(brandColor: string, background: string, ink: string): string {
  return contrastRatio(brandColor, background) >= BRAND_MARK_MIN_CONTRAST ? brandColor : ink;
}

/**
 * A brand logo's paint (a `brand-*` glyph, objects/shapes/icon/icon-glyphs.ts):
 * the mark keeps its own brand color (the Simple Icons `hex`), never the
 * object's color pick, which would tint every logo one hue. Glyph style: the
 * bare mark on the board. Tile style: the mark on a neutral card tile edged by
 * a hairline, so it reads as a badge beside the ink tiles without taking a
 * hue that is not its own. Either way the mark falls back to the ink where its
 * color would vanish (BRAND_MARK_MIN_CONTRAST).
 */
function brandIconPaint(brandColor: string, style: CanvasStyle): IconTilePaint {
  const label = style.textColor;
  if (style.iconStyle !== "tile") {
    const glyph = visibleBrandColor(brandColor, style.boardBackground, style.textColor);
    return { tileFill: null, tileBorder: null, glyph, glyphFill: null, label, tileMode: null, tileBorderWidthPx: 0 };
  }
  return {
    tileFill: style.cardFill,
    tileBorder: style.hairlineColor,
    glyph: visibleBrandColor(brandColor, style.cardFill, style.textColor),
    glyphFill: null,
    label,
    tileMode: "tint",
    tileBorderWidthPx: ICON_TILE_OUTLINE_WIDTH_PX,
  };
}

/**
 * A section header's brand logo (objects/section/title-chip-layout.ts):
 * the same brand policy as an icon object (brandIconPaint). Tile style: the
 * mark on the neutral card tile. Glyph style: the bare mark on the header
 * chip (`colors.iconTile` is the chip fill there), falling back to the
 * section's own glyph ink where the brand color would vanish.
 */
export function brandHeaderIconColors(
  brandColor: string,
  colors: Pick<SectionPaint, "iconTile" | "iconTileBorder" | "iconGlyph">,
  style: CanvasStyle,
): Pick<SectionPaint, "iconTile" | "iconTileBorder" | "iconGlyph"> {
  if (style.iconStyle !== "tile") {
    return { ...colors, iconGlyph: visibleBrandColor(brandColor, colors.iconTile, colors.iconGlyph) };
  }
  const paint = brandIconPaint(brandColor, style);
  return { iconTile: paint.tileFill ?? colors.iconTile, iconTileBorder: paint.tileBorder, iconGlyph: paint.glyph };
}

/**
 * Sticky paint. `paper` (figjam): the sticky role-table fill, no border, a
 * shadow. `card`: cardFill, hairline border, a neutral left rule (the gray
 * ink, stickyRuleWidthPx), and on a light board a soft lift in the text
 * color (cardShadow).
 *
 * A card note is an annotation, not a category: its rule is the gray ink
 * whatever the color pick. The pick's own ink put an olive bar (yellow, the
 * sticky default) on every note, which clashed with the cool sections round
 * it. The lift is what sets a note off the near-white board: the card fill
 * sits within 0.02 OKLab of the page, so a hairline alone left notes
 * floating as bare text. Dark boards raise the card fill itself instead.
 * Beside `ink-card` nodes (the light schematic preset) the card is cream
 * paper with a firm edge and no rule (paperCardStickyPaint).
 */
export function resolveStickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  return cachedPaint(style, `sticky|${color}`, () => stickyPaint(color, style));
}

/** Card sticky lift: the text color at this opacity (light boards only). */
const CARD_STICKY_SHADOW_OPACITY = 0.14;

/**
 * Beside `ink-card` nodes a card note is cream paper: the yellow anchor's hue
 * at OKLab L 0.977, chroma 0.03, edged in the label chip's firm gray and
 * lifted, with no left rule.
 *
 * Round 4 made sections near white (L 0.955) on a near-white page section
 * (the panel, L 0.979), and the note was the panel itself: it sat on the page
 * in the page's own color and a shade above a gray section, so judges read it
 * as a borderless box or loose text with a bar (UI climb round 4: 46 of 138
 * findings, every board with notes). A tint off the gray axis sets the note
 * apart from both near-whites by hue, not by darkness, so it stays lighter
 * than every node and never reads as one.
 *
 * Picked from three variants on boards 01, 02, 07 and h3: a white card with a
 * firmer edge and a deeper lift still merged with the page, and a gold left
 * rule on the cream read olive, the bar Ford had turned down before. The
 * charcoal rule is gone: the paper alone says "note".
 */
const NOTE_PAPER_LIGHTNESS = 0.977;
const NOTE_PAPER_CHROMA = 0.03;

function paperCardStickyPaint(style: CanvasStyle): StickyPaint {
  const fill = withLightnessChroma(paletteColor("yellow", style), NOTE_PAPER_LIGHTNESS, NOTE_PAPER_CHROMA);
  return {
    fill,
    border: resolveLabelChipBorder(style),
    rule: null,
    text: readableOn(style.textColor, fill),
    shadow: false,
    cardShadow: withAlpha(style.textColor, CARD_STICKY_SHADOW_OPACITY),
  };
}

function stickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  if (style.stickyStyle === "card" && style.shapeFill === "ink-card") return paperCardStickyPaint(style);
  if (style.stickyStyle === "card") {
    return {
      fill: style.cardFill,
      border: style.hairlineColor,
      rule: resolveInk("gray", style),
      text: style.textColor,
      shadow: false,
      cardShadow: isLightBoard(style) ? withAlpha(style.textColor, CARD_STICKY_SHADOW_OPACITY) : null,
    };
  }
  const fill = swatchFor(color).sticky;
  // The paper body has always been the text color at 80% (INSET_BODY_TEXT_SLOT: rgba(0, 0, 0, 0.8)).
  const text = withAlpha(readableOn(style.textColor, fill), PAPER_STICKY_TEXT_OPACITY);
  return { fill, border: null, rule: null, text, shadow: true, cardShadow: null };
}

/**
 * A connector label chip's edge. Figjam: the hairline. Layer-cake modes: the
 * hairline moved LABEL_CHIP_BORDER_INK_WEIGHT of the way to the gray ink, as
 * the design system's border.strong moves the default border toward gray.
 * The hairline (#E6E5E3) sits at 1.24:1 on the page-colored chip, so a chip
 * between sections read as a gap in its line, not a tag (UI climb round 2:
 * boards 08, 09, 11, 13, 14, h1, h2, h5); the edge now reads 1.8:1.
 */
export function resolveLabelChipBorder(style: CanvasStyle): string {
  if (style.sectionFill !== "layer-cake") return style.hairlineColor;
  return cachedPaint(style, "label-chip-border", () => ({
    border: mixColors(resolveInk("gray", style), style.hairlineColor, LABEL_CHIP_BORDER_INK_WEIGHT),
  })).border;
}

/** Gray ink weight in a layer-cake label chip edge (resolveLabelChipBorder). */
const LABEL_CHIP_BORDER_INK_WEIGHT = 0.3;

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
 * `layer-cake`: fill = opaque sRGB mix(anchor, sectionTintMixBase, t(d)) (inkFill: for a text-step anchor the plain mix) with
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
 * = mix(hairline, cardFill, 0.5); below the page the label chip's firmer
 * edge in place of the hairline); on a dark board white takes the gray rule,
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
    ...sectionIconPaint(color, chipFill, style),
  };
}

function layerCakeSectionPaint(color: CanvasColor, depth: number, style: CanvasStyle): SectionPaint {
  if (color === "white" && isLightBoard(style)) {
    // A white section inside another (any level below the page) takes the
    // label chip's firmer gray edge: the hairline (1.2:1) on a near-white
    // parent let it vanish (UI climb round 4: boards 07 and 10). The page
    // frame keeps the hairline.
    const edge = depth > PAGE_SECTION_DEPTH ? resolveLabelChipBorder(style) : style.hairlineColor;
    const chipFill = mixColors(edge, style.cardFill, 0.5);
    return {
      fill: style.cardFill,
      border: edge,
      chipFill,
      chipBorder: edge,
      headerText: style.textColor,
      ...sectionIconPaint("white", chipFill, style),
    };
  }
  const paintColor: CanvasColor = color === "white" ? "gray" : color;
  const ink = resolveInk(paintColor, style);
  // Gray gains nothing from a deeper step but darkness: past the top-level
  // tone it reads as a disabled slab, and its chip loses contrast.
  const fill = layerCakeFill(paintColor, paintColor === "gray" ? Math.min(depth, GRAY_SECTION_MAX_DEPTH) : depth, style);
  const chipFill = mixColors(ink, fill, style.headerChipMix);
  return {
    fill,
    border: withAlpha(ink, style.sectionBorderOpacity),
    chipFill,
    chipBorder: withAlpha(ink, SECTION_CHIP_BORDER_OPACITY),
    headerText: style.textColor,
    ...sectionIconPaint(paintColor, chipFill, style),
  };
}

/** The deepest level a gray layer-cake section deepens to: the top-level section's tone (depth 2 under the page). */
const GRAY_SECTION_MAX_DEPTH = 2;

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

function layerCakeFill(color: CanvasColor, depth: number, style: CanvasStyle): string {
  const level = Number.isFinite(depth) ? Math.max(1, Math.floor(depth)) : 1;
  const base = style.sectionTintMixBase;
  const fillAt = (weight: number) => sectionChromaCapped(inkFill(color, base, weight, style), color, weight, style);
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

/**
 * Most OKLCH chroma a top-level layer-cake section fill keeps beside
 * `ink-card` nodes. Deeper levels may grow with their ink weight
 * (sectionChromaCapped), as a mix's chroma does, so a nested level still
 * steps off its parent when both would sit at the cap. A section is ground
 * and its nodes the figure, so a big field must never be the most colorful
 * thing in it: uncapped, a yellow field painted a butter judges called the
 * loudest fill on board 12 (UI climb round 2). The title chip and the frame
 * still carry the full hue, and the lightness is kept.
 */
const SECTION_CHROMA_MAX = 0.02;

/**
 * Hues whose section cap differs. Yellow needs about twice the chroma to read
 * as its hue at section lightness: at 0.02 it is greige, the khaki of UI
 * climb round 0.
 */
const SECTION_CHROMA_MAX_BY_COLOR: Partial<Record<CanvasColor, number>> = { yellow: 0.04 };

/**
 * `fill` (a section level at ink `weight`) with its chroma cut, at the same
 * lightness and hue, to the cap for `color` scaled by `weight` over the
 * top-level weight.
 * Only beside `ink-card` nodes; other shape modes keep the fill.
 */
function sectionChromaCapped(fill: string, color: CanvasColor, weight: number, style: CanvasStyle): string {
  if (style.shapeFill !== "ink-card") return fill;
  const topLevelWeight = layerCakeWeight(TOP_LEVEL_SECTION_DEPTH, style);
  const cap = ((SECTION_CHROMA_MAX_BY_COLOR[color] ?? SECTION_CHROMA_MAX) * weight) / topLevelWeight;
  if (oklabChroma(fill) <= cap) return fill;
  return withLightnessChroma(fill, oklabLightness(fill), cap);
}

/** Nesting depth of a top-level section under the board's page section (state/section-depth.ts). */
const TOP_LEVEL_SECTION_DEPTH = 2;
/** Nesting depth of the board's page section itself. */
const PAGE_SECTION_DEPTH = 1;

/** The header icon follows the icon objects' tile/glyph paint; glyph mode has no tile. */
function sectionIconPaint(
  color: CanvasColor,
  chipFill: string,
  style: CanvasStyle,
): Pick<SectionPaint, "iconTile" | "iconTileBorder" | "iconGlyph"> {
  const icon = resolveIconPaint(color, style);
  return { iconTile: icon.tileFill ?? chipFill, iconTileBorder: icon.tileBorder, iconGlyph: icon.glyph };
}
