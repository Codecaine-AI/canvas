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
  /** A card sticky's inline `code` chip body, or null on paper stickies (their chip is the figjam black at 8%). */
  codeChip: string | null;
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
    ink: ensureContrast(style.shapeFill === "ink-card" ? chromaCappedInk(paletteColor(color, style)) : paletteColor(color, style), shapeFillBase(color, style), NON_TEXT_CONTRAST),
  })).ink;
}

/**
 * Most OKLCH chroma a layer-cake ink keeps. The design-system text steps of
 * red (#C62121, 0.199) and pink (#AD1A72, 0.193) stood well above every other
 * ink (0.09 to 0.157), so their strokes and tiles shouted over the muted
 * palette (UI climb round 6: astra on 02, 06, 12, h3, h5 and h6; kimi on the
 * magenta icons of 01, 11, 13 and h6). The cap sits at violet's chroma, so
 * only red and pink move, each at its own lightness and hue.
 */
const INK_CHROMA_MAX = 0.16;

/** `anchor` at its own lightness and hue with its chroma cut to INK_CHROMA_MAX. */
function chromaCappedInk(anchor: string): string {
  return oklabChroma(anchor) <= INK_CHROMA_MAX ? anchor : withLightnessChroma(anchor, oklabLightness(anchor), INK_CHROMA_MAX);
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

/**
 * The painted `ink-card` node fill: shapeFillBase, the tone the inks are set
 * against, moved by NODE_FILL_RETONE, so retuning the node fills leaves every
 * ink line (borders, wires, section edges, note stripes) where it was.
 */
function retonedNodeFill(color: CanvasColor, base: string, style: CanvasStyle): string {
  if (color === "white") return base;
  if (color === "gray") return withLightnessChroma(paletteColor("blue", style), oklabLightness(base) + GRAY_NODE_RETONE.lightness, GRAY_NODE_RETONE.chroma);
  const { lightness = -NODE_FILL_DEEPER_STEP, chroma, hue = 0 } = NODE_FILL_RETONE[color] ?? {};
  return withLightnessChroma(base, oklabLightness(base) + lightness, chroma ?? oklabChroma(base), hue);
}

/**
 * How far a hued node fill sits under its ink ground, OKLab L (0.859 to
 * 0.844). A violet node in the violet 'Agents' section stood out by tone
 * alone and sank (stage A round 8: sol and opus on the nodes sheet); the
 * deeper step lifts every node off its section and leaves sections as they
 * were. Text holds 9.9:1 or more.
 */
const NODE_FILL_DEEPER_STEP = 0.015;
/**
 * Hues that leave the deeper step. Yellow at L 0.859 read as a muddy
 * mustard or ochre (stage A rounds 8 to 10: sol and opus on every yellow
 * node): a clean yellow sits near its own peak lightness, so it stands as
 * light as the node-on-section guard allows (0.045 L under the deepest
 * section), a touch toward lemon and more colorful, a butter yellow
 * (#F3D06D, L 0.867, chroma 0.125). Orange, the other light hue, keeps its
 * #FFC298. Violet takes chroma 0.09, more colorful than its own pale
 * section (0.02 to 0.036), and one step deeper
 * again, so a violet node in a violet section stands out by color as well
 * as tone (round 10: opus on 'Agents'). Red and pink drop to chroma 0.072:
 * the salmon and pink read a touch loud beside the softer fills (round 9:
 * opus). Teal turns 6 degrees toward cyan, clear of the green beside it
 * (round 9: opus on 'Worker', 'Indexer' and 'Usage').
 */
const NODE_FILL_RETONE: Partial<Record<CanvasColor, { lightness?: number; chroma?: number; hue?: number }>> = {
  yellow: { lightness: 0.008, chroma: 0.125, hue: 4 },
  orange: { lightness: 0 },
  violet: { lightness: -2 * NODE_FILL_DEEPER_STEP, chroma: 0.09 },
  red: { chroma: 0.072 },
  pink: { chroma: 0.072 },
  teal: { hue: 6 },
};

/**
 * The gray node: a faint cool slate (chroma 0.007 at the blue anchor's hue),
 * a touch under the neutral #DCDCDC. The neutral read dull and flat beside
 * the clear hues and on mint and blue sections (stage A round 9: opus on
 * 'Scheduler', 'Queue', 'Archive' and the 'In stock?' diamond); a cool
 * gray reads clean where a warm one read greige (UI climb round 4).
 */
const GRAY_NODE_RETONE = { lightness: -0.004, chroma: 0.007 } as const;

/**
 * A light-board `ink-card` white node edges in the gray ink, not its own ink
 * (the text color): the near-black edge was far heavier than the hued nodes'
 * mid-tone inks (stage A round 8: opus on the nodes sheet). The gray ink sits
 * at the hued inks' lightness and holds 3:1 on every section fill. On a dark
 * board white and gray nodes share the card fill, so white keeps its own ink.
 */
function whiteNodeEdgeAsGray(color: CanvasColor, style: CanvasStyle): boolean {
  return color === "white" && style.shapeFill === "ink-card" && isLightBoard(style);
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
const SHAPE_CARD_CHROMA_BY_COLOR: Partial<Record<CanvasColor, number>> = { yellow: 0.11, orange: 0.09, blue: 0.065 };

/**
 * How far a gray node sits above the hued node lightness: L 0.894 (#DCDCDC),
 * not 0.859 (#D0D0D0). At one OKLab lightness a neutral reads darker than a
 * colored fill (the Helmholtz-Kohlrausch effect), so round 4's #D0D0D0 was
 * the heaviest fill on gray-heavy boards, a "concrete slab" that read as
 * disabled (UI climb round 4: argon and fable on 01, 02, 03, 04, 08, 10, h1,
 * h5). Picked from L 0.885, 0.9 and a warm 0.895 on board 02: the warm one
 * read greige. The gray node stays darker than every section: 0.06 L under a
 * gray section, 0.035 under any depth-3 level, where gray nodes sit on the
 * climb boards, and 0.014 under the deepest tint, where its ink border
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
  const border = resolveInk(whiteNodeEdgeAsGray(color, style) ? "gray" : color, style);
  if (style.shapeFill === "card") {
    return { fill: style.cardFill, border, text: style.textColor };
  }
  if (style.shapeFill === "ink-card") {
    const fill = retonedNodeFill(color, shapeFillBase(color, style), style);
    return { fill, border: color === "yellow" ? goldNodeEdge(style, fill) : border, text: readableOn(style.textColor, fill) };
  }
  const fill = swatchFor(color).shape.fill;
  return { fill, border, text: readableOn(style.textColor, fill) };
}

/**
 * The yellow node's edge: an amber gold (OKLCH L 0.59, chroma 0.13, the
 * anchor's hue turned 8 degrees warm) held at NON_TEXT_CONTRAST on the
 * butter fill, not the yellow ink. The ink is the anchor darkened toward
 * olive (#916F01), and that brown edge made the yellow fill read dull and
 * muddy (stage A rounds 9 and 10: sol on 'Review', 'Approval' and 'Valid?').
 */
function goldNodeEdge(style: CanvasStyle, fill: string): string {
  return ensureContrast(withLightnessChroma(paletteColor("yellow", style), 0.59, 0.13, -8), fill, NON_TEXT_CONTRAST);
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
/** Border width of a node-paint tile, the outlined `white` tile and a brand tile, px (the section frame weight). */
const ICON_TILE_OUTLINE_WIDTH_PX = 1.5;

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
 * `iconTileFill` picks (resolveIconPaint itself stays the solid tile the
 * small section header badges draw). `solid`: a small node — the pick's node
 * fill (resolveShapePaint), edged and drawn in its ink, so a tile reads in
 * the same pastel-and-ink system as the nodes beside it. Solid ink tiles
 * shouted next to the pastel nodes, and the outlined `white` tile among them
 * read as a second tile system (stage A round 2: opus on the wires sheet).
 * `tint`: a light ink tint — mix(ink, cardFill, 0.16), opaque — bordered in
 * the ink at the shape border width, with an ink glyph; `white` on a light
 * board keeps its outlined tile there. Glyph style ignores the size.
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
  const ink = resolveInk(color, style);
  if (tileMode === "solid") {
    const shape = resolveShapePaint(color, style);
    return { ...paint, tileFill: shape.fill, tileBorder: shape.border, glyph: ink, tileMode, tileBorderWidthPx: ICON_TILE_OUTLINE_WIDTH_PX };
  }
  if (paint.tileBorder !== null) return { ...paint, tileMode, tileBorderWidthPx: ICON_TILE_OUTLINE_WIDTH_PX };
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
 * Least contrast a one-color brand mark keeps against its tile or board: the
 * WCAG 1.4.11 floor for graphics. A brand color that falls short is pushed
 * there at its own hue and chroma (brandMarkColor), so React stays a cyan and
 * Supabase a green instead of turning into the monochrome logo, which judges
 * read as off-brand (stage A round 2: React, Supabase, Bun).
 */
export const BRAND_MARK_MIN_CONTRAST = 3;
/**
 * The floor for one shape of a full-color brand mark on a dark tile
 * (resolveBrandMarkFill). The marks are drawn for light pages, so on a dark
 * tile their deep shapes (the Redis reds, the PostgreSQL blue) move up to stay
 * visible; on a light tile every shape keeps its own color, since the light
 * ones (the Python yellow, the Bun face) are part of the mark. Neutral shapes
 * never move.
 */
const BRAND_SHAPE_MIN_CONTRAST = 2;
/** Bisection steps for the brand color lightness search: far below one 8-bit channel step. */
const BRAND_LIGHTNESS_STEPS = 24;
/** OKLCH chroma under which a brand color counts as neutral (black, white, near-gray). */
const BRAND_NEUTRAL_CHROMA = 0.03;

/**
 * `color` on `background` with at least `floor` contrast. A chromatic color
 * that falls short moves toward a deep (or, on a dark board, light) shade of
 * its own hue and chroma. A dark neutral on a dark background (a black logo
 * on the dark card) takes the text color; a light neutral keeps its color (it
 * is a detail drawn over the mark's own colors).
 */
function brandMarkColor(color: string, background: string, floor: number, style: CanvasStyle): string {
  if (contrastRatio(color, background) >= floor) return color;
  if (oklabChroma(color) < BRAND_NEUTRAL_CHROMA) {
    return oklabLightness(color) < 0.5 && oklabLightness(background) < 0.5 ? style.textColor : color;
  }
  // The lightness nearest the color's own that reaches the floor, at its hue and chroma (clipped to sRGB).
  const darker = oklabLightness(background) >= 0.5;
  const chroma = oklabChroma(color);
  let near = oklabLightness(color);
  let far = darker ? 0 : 1;
  for (let step = 0; step < BRAND_LIGHTNESS_STEPS; step += 1) {
    const middle = (near + far) / 2;
    if (contrastRatio(withLightnessChroma(color, middle, chroma), background) >= floor) far = middle;
    else near = middle;
  }
  return withLightnessChroma(color, far, chroma);
}

/**
 * A full-color brand mark's own color for one shape (an IconGlyphElement
 * `fill`), as drawn on `background` (its tile, chip or the board).
 */
export function resolveBrandMarkFill(fill: string, background: string, style: CanvasStyle): string {
  // Neutral shapes keep their color too: a black outline or eye sits against the mark's own light fills (the Bun face).
  if (oklabLightness(background) >= 0.5 || oklabChroma(fill) < BRAND_NEUTRAL_CHROMA) return fill;
  return cachedPaint(style, `brand-fill|${fill}|${background}`, () => ({
    fill: brandMarkColor(fill, background, BRAND_SHAPE_MIN_CONTRAST, style),
  })).fill;
}

/** Share of the gray ink in a brand tile's edge (the rest is the tile fill). */
const BRAND_TILE_EDGE_INK_WEIGHT = 0.55;

/**
 * A brand logo's paint (a `brand-*` glyph, objects/shapes/icon/icon-glyphs.ts):
 * the mark keeps its own brand color (the Simple Icons `hex`, or a full-color
 * mark's per-shape colors), never the object's color pick, which would tint
 * every logo one hue. Glyph style: the bare mark on the board. Tile style: the
 * mark on a `white` node's fill, edged in a soft gray (the gray ink at
 * BRAND_TILE_EDGE_INK_WEIGHT) at the node-tile edge width, so a logo sits in
 * the same tile system as the pastel tiles without taking a hue that is not
 * its own. The card hairline it had (1.24:1) left the tile edge nearly gone
 * on the page (stage A round 2).
 */
function brandIconPaint(brandColor: string, style: CanvasStyle): IconTilePaint {
  const label = style.textColor;
  if (style.iconStyle !== "tile") {
    const glyph = brandMarkColor(brandColor, style.boardBackground, BRAND_MARK_MIN_CONTRAST, style);
    return { tileFill: null, tileBorder: null, glyph, glyphFill: null, label, tileMode: null, tileBorderWidthPx: 0 };
  }
  const tileFill = resolveShapePaint("white", style).fill;
  return {
    tileFill,
    tileBorder: mixColors(resolveInk("gray", style), tileFill, BRAND_TILE_EDGE_INK_WEIGHT),
    glyph: brandMarkColor(brandColor, tileFill, BRAND_MARK_MIN_CONTRAST, style),
    glyphFill: null,
    label,
    tileMode: "tint",
    tileBorderWidthPx: ICON_TILE_OUTLINE_WIDTH_PX,
  };
}

/**
 * A section header's brand logo (objects/section/title-chip-layout.ts):
 * the same brand policy as an icon object (brandIconPaint). Tile style: the
 * mark on the neutral brand tile. Glyph style: the bare mark on the header
 * chip (`colors.iconTile` is the chip fill there).
 */
export function brandHeaderIconColors(
  brandColor: string,
  colors: Pick<SectionPaint, "iconTile" | "iconTileBorder" | "iconGlyph">,
  style: CanvasStyle,
): Pick<SectionPaint, "iconTile" | "iconTileBorder" | "iconGlyph"> {
  if (style.iconStyle !== "tile") {
    return { ...colors, iconGlyph: brandMarkColor(brandColor, colors.iconTile, BRAND_MARK_MIN_CONTRAST, style) };
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
 * Outside the light schematic preset a card note is an annotation, not a
 * category: its rule is the gray ink whatever the color pick. The lift is what sets a note off the near-white board: the card fill
 * sits within 0.02 OKLab of the page, so a hairline alone left notes
 * floating as bare text. Dark boards raise the card fill itself instead.
 * Beside `ink-card` nodes (the light schematic preset) the card is a tinted
 * callout in the pick's own hue (noteCardStickyPaint).
 */
export function resolveStickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  return cachedPaint(style, `sticky|${color}`, () => stickyPaint(color, style));
}

/** Card sticky lift: the text color at this opacity (light boards only). */
const CARD_STICKY_SHADOW_OPACITY = 0.14;
/** Card code chips keep the existing text tint outside the tinted-callout theme. */
const CARD_STICKY_CODE_CHIP_ALPHA = 0.045;

/**
 * Beside `ink-card` nodes a card note is a tinted callout in its own color
 * pick: a wash of the pick's ink (OKLab L 0.952, chroma 0.03), a hairline
 * edge one step deeper in the same hue, a muted mid tone of it (L 0.68,
 * chroma 0.115) as the 3px left rule, and a tight lift. Gray is a neutral
 * wash; white is a white card. Both take a slate rule.
 *
 * Stage A round 0 (notes sheet 7.49): every pick painted one cream card with
 * a tan edge, the look Ford had turned down. Round 1 (7.75): washes at L 0.98
 * hit the sRGB edge at chroma 0.01 for red, blue, violet and pink, so those
 * read as empty boxes beside mint green and teal; yellow still read cream;
 * rules at chroma 0.15 clipped to a loud cyan on teal; the wide lift was
 * louder than a side note. At L 0.952 every hue reaches chroma 0.03, and the
 * wash still sits lighter than every node fill (L 0.85 to 0.93) and differs
 * from the gray sections (L 0.96) by hue. Inline code takes a deeper step of
 * the same wash so it separates from the note body.
 */
const NOTE_FILL_LIGHTNESS = 0.952;
const NOTE_FILL_CHROMA = 0.03;
const NOTE_EDGE_LIGHTNESS = 0.88;
const NOTE_EDGE_CHROMA = 0.05;
const NOTE_RULE_LIGHTNESS = 0.68;
const NOTE_RULE_CHROMA = 0.115;
/** Neutral rules: slate on the gray wash, near charcoal on the white card, which has no wash to carry it. */
const NOTE_GRAY_RULE_LIGHTNESS = 0.62;
const NOTE_WHITE_RULE_LIGHTNESS = 0.45;
const NOTE_CODE_CHIP_LIGHTNESS = 0.9;
const NOTE_CODE_CHIP_CHROMA = 0.03;
const NOTE_SHADOW_OPACITY = 0.06;
/**
 * The yellow note: a clean lemon wash (OKLCH hue 102, chroma 0.065), not the
 * hue-87 ink, whose pale wash is the beige paper Ford turned down. Yellow
 * reads weak at the other hues' chroma, so its wash and gold rule run deeper.
 */
const NOTE_YELLOW = {
  fill: { anchor: "#FFEE00", lightness: 0.977, chroma: 0.072 },
  edge: { anchor: "#FFE600", lightness: 0.9, chroma: 0.09 },
  rule: { anchor: "#FFD000", lightness: 0.8, chroma: 0.16 },
  codeChip: { anchor: "#FFE600", lightness: 0.92, chroma: 0.07 },
} as const;

function noteCardStickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  const ink = resolveInk(color, style);
  const neutral = color === "gray" || color === "white";
  const tone = (part: keyof typeof NOTE_YELLOW, lightness: number, chroma: number) => {
    if (color === "yellow") {
      const yellow = NOTE_YELLOW[part];
      return withLightnessChroma(yellow.anchor, yellow.lightness, yellow.chroma);
    }
    return withLightnessChroma(ink, lightness, neutral ? 0 : chroma);
  };
  const fill = color === "white" ? "#FFFFFF" : tone("fill", NOTE_FILL_LIGHTNESS, NOTE_FILL_CHROMA);
  return {
    fill,
    border: tone("edge", NOTE_EDGE_LIGHTNESS, NOTE_EDGE_CHROMA),
    rule: tone(
      "rule",
      color === "white" ? NOTE_WHITE_RULE_LIGHTNESS : color === "gray" ? NOTE_GRAY_RULE_LIGHTNESS : NOTE_RULE_LIGHTNESS,
      NOTE_RULE_CHROMA,
    ),
    text: readableOn(style.textColor, fill),
    shadow: false,
    cardShadow: withAlpha(style.textColor, NOTE_SHADOW_OPACITY),
    codeChip: tone("codeChip", NOTE_CODE_CHIP_LIGHTNESS, NOTE_CODE_CHIP_CHROMA),
  };
}

function stickyPaint(color: CanvasColor, style: CanvasStyle): StickyPaint {
  if (style.stickyStyle === "card" && style.shapeFill === "ink-card") return noteCardStickyPaint(color, style);
  if (style.stickyStyle === "card") {
    return {
      fill: style.cardFill,
      border: style.hairlineColor,
      rule: resolveInk("gray", style),
      text: style.textColor,
      shadow: false,
      cardShadow: isLightBoard(style) ? withAlpha(style.textColor, CARD_STICKY_SHADOW_OPACITY) : null,
      codeChip: withAlpha(style.textColor, CARD_STICKY_CODE_CHIP_ALPHA),
    };
  }
  const fill = swatchFor(color).sticky;
  // The paper body has always been the text color at 80% (INSET_BODY_TEXT_SLOT: rgba(0, 0, 0, 0.8)).
  const text = withAlpha(readableOn(style.textColor, fill), PAPER_STICKY_TEXT_OPACITY);
  return { fill, border: null, rule: null, text, shadow: true, cardShadow: null, codeChip: null };
}

/**
 * A connector label chip's edge. Figjam: the hairline. Layer-cake modes: the
 * hairline moved LABEL_CHIP_BORDER_INK_WEIGHT of the way to the wire's own
 * stroke, so a chip on a colored wire wears that wire's hue and a chip on a
 * neutral wire the gray ink. The hairline (#E6E5E3) sits at 1.24:1 on the
 * page-colored chip, so a chip between sections read as a gap in its line,
 * not a tag (UI climb round 2: boards 08, 09, 11, 13, 14, h1, h2, h5); a gray
 * edge kept on a red wire read as loosely tied to it (stage A round 0).
 */
export function resolveLabelChipBorder(style: CanvasStyle, wireStroke: string): string {
  if (style.sectionFill !== "layer-cake") return style.hairlineColor;
  return cachedPaint(style, `label-chip-border|${wireStroke}`, () => ({
    border: mixColors(wireStroke, style.hairlineColor, LABEL_CHIP_BORDER_INK_WEIGHT),
  })).border;
}

/** Wire stroke weight in a layer-cake label chip edge (resolveLabelChipBorder). */
const LABEL_CHIP_BORDER_INK_WEIGHT = 0.4;

/**
 * Connector stroke = the ink. In the layer-cake modes `white` (whose ink is
 * the text color, the loudest line on a board) strokes a quiet neutral
 * instead: the gray ink moved WHITE_WIRE_BOARD_WEIGHT toward the board, kept
 * at NON_TEXT_CONTRAST on the darkest section fill it can cross.
 */
export function resolveConnectorPaint(color: CanvasColor, style: CanvasStyle): ConnectorPaint {
  return cachedPaint(style, `connector|${color}`, () => ({
    stroke: color === "white" && style.sectionFill === "layer-cake" ? quietWireStroke(style) : resolveInk(color, style),
  }));
}

/** How far the `white` wire moves from the gray ink toward the board. */
const WHITE_WIRE_BOARD_WEIGHT = 0.3;
/** Deepest section nesting the `white` wire's contrast floor is checked against (the tint caps well before it). */
const WHITE_WIRE_MAX_DEPTH = 6;

function quietWireStroke(style: CanvasStyle): string {
  const quiet = mixColors(resolveInk("gray", style), style.boardBackground, 1 - WHITE_WIRE_BOARD_WEIGHT);
  let stroke = ensureContrast(quiet, style.boardBackground, NON_TEXT_CONTRAST);
  for (const color of CANVAS_COLORS) {
    for (let depth = PAGE_SECTION_DEPTH; depth <= WHITE_WIRE_MAX_DEPTH; depth += 1) {
      stroke = ensureContrast(stroke, resolveSectionPaint(color, depth, style).fill, NON_TEXT_CONTRAST);
    }
  }
  return stroke;
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
    // Below the page a white section is a pure white card, a clear tone
    // above gray and a step above the page, with the gray section's chip, so
    // one chip system runs through every hue (stage A round 4: a
    // card-colored white read as an empty gray box beside gray, under a
    // heavier gray chip).
    const nested = depth > PAGE_SECTION_DEPTH;
    const edge = nested ? nestedWhiteSectionEdge(style) : style.hairlineColor;
    const fill = nested ? WHITE_SECTION_FILL : style.boardBackground;
    const chipFill = nested ? mixColors(resolveInk("gray", style), fill, style.headerChipMix) : mixColors(edge, fill, 0.5);
    return {
      fill,
      border: edge,
      chipFill,
      chipBorder: nested ? withAlpha(resolveInk("gray", style), SECTION_CHIP_BORDER_OPACITY) : edge,
      headerText: style.textColor,
      ...sectionIconPaint("white", chipFill, style),
    };
  }
  const paintColor: CanvasColor = color === "white" ? "gray" : color;
  const ink = resolveInk(paintColor, style);
  const fill = paintColor === "gray" && style.shapeFill === "ink-card"
    ? inkFill("gray", style.sectionTintMixBase, graySectionWeight(depth, style), style)
    : layerCakeFill(paintColor, paintColor === "gray" ? Math.min(depth, GRAY_SECTION_MAX_DEPTH) : depth, style);
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

/**
 * The edge of a white section below the page: the gray ink moved
 * NESTED_WHITE_SECTION_EDGE_INK_WEIGHT of the way from the hairline. A
 * nested white group sits on a gray parent one fill step from it, often with
 * a dashed frame, so its edge carries the group (UI climb round 6: astra on
 * 07 and 10, "the pale dashed boundary nearly disappears").
 */
function nestedWhiteSectionEdge(style: CanvasStyle): string {
  return cachedPaint(style, "nested-white-section-edge", () => ({
    edge: mixColors(resolveInk("gray", style), style.hairlineColor, NESTED_WHITE_SECTION_EDGE_INK_WEIGHT),
  })).edge;
}

const NESTED_WHITE_SECTION_EDGE_INK_WEIGHT = 0.5;

/** A white section below the page on a light board. */
const WHITE_SECTION_FILL = "#FFFFFF";

/**
 * A gray section beside `ink-card` nodes: GRAY_SECTION_INK_WEIGHT at top
 * level, a clear tone under the white section (stage A round 4: white and
 * gray read as one fill, so white looked unstyled), then
 * GRAY_SECTION_STEP_SCALE of each hue's step per level, so a gray child
 * still sits a tone below its parent (round 4: gray 'Rules' on violet read
 * near-white) without turning the disabled slab a full step gives, and gray
 * nodes (L 0.894) keep their ground.
 */
function graySectionWeight(depth: number, style: CanvasStyle): number {
  const top = layerCakeWeight(TOP_LEVEL_SECTION_DEPTH, style);
  const weight = layerCakeWeight(depth, style);
  if (top <= 0) return weight;
  return roundWeight(weight <= top
    ? (GRAY_SECTION_INK_WEIGHT * weight) / top
    : GRAY_SECTION_INK_WEIGHT + (weight - top) * GRAY_SECTION_STEP_SCALE);
}

const GRAY_SECTION_INK_WEIGHT = 0.062;
const GRAY_SECTION_STEP_SCALE = 0.5;

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
  const fillAt = (weight: number) => sectionChroma(inkFill(color, base, weight, style), color, weight, style);
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
 * OKLCH chroma of a top-level layer-cake section fill beside `ink-card`
 * nodes. Deeper levels grow with their ink weight (sectionChroma), so each
 * level steps off its parent in tone AND color, not hue alone. A section is
 * ground and its nodes the figure (chroma 0.065 to 0.11), so a big field is
 * never the most colorful thing in it: uncapped, a yellow field painted a
 * butter judges called the loudest fill on board 12 (UI climb round 2). Set,
 * not only capped: a mix gave blue, green, teal and violet 0.008 at top
 * level, a gray that told siblings apart by the frame alone (stage A round 4).
 */
const SECTION_CHROMA = 0.02;

/**
 * How section chroma grows with the ink weight: (weight / top-level weight)
 * to this power. Slower than the mix, so the deepest level stays 0.065
 * OKLab from a node of its own hue.
 */
const SECTION_CHROMA_GROWTH = 0.75;

/**
 * Hues whose section chroma differs. Yellow needs more chroma to read as its
 * hue at section lightness: below about 0.03 it is greige or cream.
 */
const SECTION_CHROMA_BY_COLOR: Partial<Record<CanvasColor, number>> = { yellow: 0.03 };

/**
 * Hue turn (OKLCH degrees) of a section fill from its ink. Red (h 18) and
 * pink (h 341) washes sat 37 degrees apart, so a red section in a pink one
 * read as its parent (stage A round 4: 'Labels' in 'Carriers', 'Offers' in
 * 'Growth'). Red turns warm and pink cool, each still clear of orange (h 67)
 * and violet (h 303).
 */
const SECTION_HUE_SHIFT_BY_COLOR: Partial<Record<CanvasColor, number>> = { red: 6, pink: -8, blue: 8 };

/**
 * `fill` (a section level at ink `weight`) at the same lightness, its hue
 * turned by SECTION_HUE_SHIFT_BY_COLOR, at the chroma for `color` scaled by
 * `weight` over the top-level weight. Only beside `ink-card` nodes; other
 * shape modes keep the fill.
 */
function sectionChroma(fill: string, color: CanvasColor, weight: number, style: CanvasStyle): string {
  if (style.shapeFill !== "ink-card" || color === "gray") return fill;
  const topLevelWeight = layerCakeWeight(TOP_LEVEL_SECTION_DEPTH, style);
  if (topLevelWeight <= 0) return fill;
  const chroma = (SECTION_CHROMA_BY_COLOR[color] ?? SECTION_CHROMA) * (weight / topLevelWeight) ** SECTION_CHROMA_GROWTH;
  return withLightnessChroma(fill, oklabLightness(fill), chroma, SECTION_HUE_SHIFT_BY_COLOR[color] ?? 0);
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
