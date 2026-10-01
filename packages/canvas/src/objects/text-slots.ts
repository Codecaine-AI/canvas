"use client";

import type { InteractiveCanvasObject, InteractiveCanvasObjectType } from "../state/schema";
import { FIRST_USE_COLORS } from "../state/schema/object-defaults";
import { inscribedTextRect } from "./inscribed-text-rects";
import { CENTER_TEXT_INSET_PX } from "./text-slot-constants";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle, type CanvasStyleFont } from "../theme/canvas-style";
import { CANVAS_MONO_FONT_STACK, CANVAS_SANS_FONT_STACK, MONO_ADVANCE_EM } from "../theme/fonts";
import { measureInterTextPx } from "../theme/inter-metrics";
import { resolveIconPaint, resolveShapePaint, resolveStickyPaint } from "../theme/palette";
import { TITLE_CHIP, titleChipLayout, titleChipScale } from "./section/title-chip-layout";

export { CENTER_TEXT_INSET_PX };

/**
 * Text-slot preset library (OBJECT-DEF-OVERHAUL.md §3.3, D3/D6/D14).
 *
 * The invariant that fixes editing: RENDERER AND EDITOR CONSUME THE SAME SLOT
 * DESCRIPTOR. A def *picks* a placement from this small named library rather
 * than inventing per-shape CSS; each preset defines both halves in one place —
 * the at-rest render (rect, alignment, typography) and the in-place editor
 * (same rect, same typography). Adding a placement here automatically makes
 * editing correct for every def that uses it.
 *
 * Placements:
 *  - "center"      inside the shape body, centered — the default for shapes
 *  - "below"       FigJam two-box label: the stored geometry is the glyph
 *                  box, and the content-sized text band sits outside it
 *                  (icon)
 *  - "inset-body"  padded multi-line body area (sticky)
 *  - "title-chip"  floating chip, top-left, zoom counter-scale (section)
 *  - { rect }      escape hatch: object-local rect function (arrow centers
 *                  text in the body excluding the head — replacing the old
 *                  labelStyle margin hacks)
 */

/** Object-local rectangle (px, relative to the object's top-left corner). */
export interface LocalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type TextPlacement =
  | "center"
  | "below"
  | "inset-body"
  | "title-chip"
  | { rect: (object: InteractiveCanvasObject) => LocalRect };

/**
 * Typography a slot carries — applied identically to the at-rest text and the
 * in-place editor (D14: at rest vs mid-edit is pixel-identical, caret aside).
 */
export interface SlotTypography {
  fontSizePx: number;
  fontWeight: number;
  /** CSS line-height value — unitless ("1.2") or px ("36px"). */
  lineHeight: string;
  textAlign: "center" | "left";
  /** One fixed dark text color everywhere (D8) — presets pick their exact value. */
  color: string;
  /** Omit to inherit the canvas font (code block sets a mono stack). */
  fontFamily?: string;
}

export interface TextSlot {
  placement: TextPlacement;
  typography: SlotTypography;
  /** "chip-scale" counter-scales when zoomed out (title-chip); everything else renders at natural document scale. */
  zoom: "natural" | "chip-scale";
  /** Below this object height the text is hidden so the glyph stays legible. */
  compactBelowHeightPx?: number;
  /** Vertical anchoring of the text block within the slot rect. */
  verticalAlign: "top" | "center" | "bottom";
  multiline: boolean;
}

/** Everything the renderer/editor needs, resolved for one object at one zoom. */
export interface ResolvedTextSlot {
  rect: LocalRect;
  /** The slot's typography under the canvas style (see resolveSlotTypography). */
  typography: SlotTypography;
  verticalAlign: TextSlot["verticalAlign"];
  multiline: boolean;
  /** True when the compact threshold hides the text entirely. */
  hidden: boolean;
  /** View counter-scale factor (title-chip when zoomed out); 1 everywhere else. */
  scale: number;
  /**
   * The detail line this slot paints under the name, or null when there is
   * none: the object has no detail, the kind never paints one in its slot
   * (stickies, sections), or a center slot is too short to hold a name line
   * plus the detail line.
   */
  detail: ResolvedSlotDetail | null;
}

/** A detail line resolved for one slot (contract §4). */
export interface ResolvedSlotDetail {
  /** The detail as its one painted line: whitespace runs collapsed, trimmed — not yet ellipsized. */
  text: string;
  typography: DetailTypography;
  /** Gap between the name block and the line (renderers drop it when the name is empty). */
  gapPx: number;
}

// ---------------------------------------------------------------------------
// Shared shape-text baseline (D6): center-justified, bold, dark (D8).
// ---------------------------------------------------------------------------

/**
 * The figjam object-text color (D8), kept for back-compat: it equals
 * FIGJAM_CANVAS_STYLE.textColor, and live renders resolve the active style's
 * `textColor` through resolveSlotTypography.
 */
export const OBJECT_TEXT_COLOR = "#000000";

export const BELOW_TEXT_TYPES = ["icon"] as const;
export type BelowTextType = (typeof BELOW_TEXT_TYPES)[number];

export const BELOW_TEXT_TYPE_CONFIG: Readonly<
  Record<BelowTextType, { compactBelowHeightPx?: number }>
> = {
  icon: {},
} as const;

/** The figjam name size (= FIGJAM_CANVAS_STYLE.textFontSizePx); live renders use the style's `textFontSizePx`. */
export const BELOW_TEXT_FONT_SIZE_PX = 15;
/** The figjam name weight (= FIGJAM_CANVAS_STYLE.textFontWeight); live renders use the style's `textFontWeight`. */
export const BELOW_TEXT_FONT_WEIGHT = 700;
export const BELOW_TEXT_LINE_HEIGHT = 1.2;
export const BELOW_TEXT_LINE_HEIGHT_PX = BELOW_TEXT_FONT_SIZE_PX * BELOW_TEXT_LINE_HEIGHT;
export const BELOW_BAND_GAP_PX = 6;
export const BELOW_BAND_MIN_WIDTH_PX = 200;

const BELOW_TEXT_TYPE_SET = new Set<InteractiveCanvasObjectType>(BELOW_TEXT_TYPES);
/** The caption estimator's average advance, in em. */
const BELOW_TEXT_CHAR_WIDTH_EM = 0.62;
/**
 * Room added past a caption line's measured Inter width when that width sets
 * the band: browser layout snaps box and text widths to 1/64px, so a line
 * measured to fit exactly could still wrap live without it.
 */
const BELOW_BAND_FIT_SLACK_PX = 1;

export const SHAPE_TEXT_TYPOGRAPHY: SlotTypography = {
  fontSizePx: BELOW_TEXT_FONT_SIZE_PX,
  fontWeight: BELOW_TEXT_FONT_WEIGHT,
  lineHeight: String(BELOW_TEXT_LINE_HEIGHT),
  textAlign: "center",
  color: OBJECT_TEXT_COLOR,
};

/** Minimum content height for an auto-sized textarea: one line box. */
export function slotLineHeightPx(typography: SlotTypography): number {
  return typography.lineHeight.endsWith("px")
    ? Number.parseFloat(typography.lineHeight)
    : Number.parseFloat(typography.lineHeight) * typography.fontSizePx;
}

/** Whole lines of `lineHeightPx` that fit `rectHeightPx` — one at minimum (the -webkit-line-clamp count). */
export function textSlotClampLineCount(rectHeightPx: number, lineHeightPx: number): number {
  const safeHeight = Number.isFinite(rectHeightPx) ? Math.max(0, rectHeightPx) : 0;
  const safeLineHeight =
    Number.isFinite(lineHeightPx) && lineHeightPx > 0 ? lineHeightPx : 1;
  return Math.max(1, Math.floor(safeHeight / safeLineHeight));
}

/** Pure wrapped-line estimator shared by rendering, editing, tests, and SSR. */
export function estimateSlotLineCount(
  text: string,
  availableWidthPx: number,
  typography: SlotTypography,
): number {
  return estimateWrappedLineCount(text, availableWidthPx, typography.fontSizePx);
}

export function isBelowTextType(type: InteractiveCanvasObjectType): type is BelowTextType {
  return BELOW_TEXT_TYPE_SET.has(type);
}

/**
 * The tile square of a tile-style icon, object-local: side
 * min(width, height, maxSidePx), centered in the object box both ways.
 */
export function iconTileRectPx(width: number, height: number, maxSidePx = Number.POSITIVE_INFINITY): LocalRect {
  const side = Math.max(0, Math.min(width, height, maxSidePx));
  return { x: (width - side) / 2, y: (height - side) / 2, width: side, height: side };
}

/**
 * Where an icon object's picture paints, object-local: in the tile style the
 * tile (capped at `iconTileMaxPx`, centered — iconTileRectPx); otherwise, and
 * for every non-icon object, the whole object box. The caption band hangs
 * under this box, connectors meet it, and painted/hit bounds build on it
 * (belowExtendedBoundsPx, objects/geometry.ts).
 */
export function iconGlyphBoxPx(
  object: Pick<InteractiveCanvasObject, "type" | "geometry" | "style">,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): LocalRect {
  const { width, height } = object.geometry;
  const isIcon = object.type === "icon" || object.style?.shape === "icon";
  return isIcon && canvasStyle.iconStyle === "tile"
    ? iconTileRectPx(width, height, canvasStyle.iconTileMaxPx)
    : { x: 0, y: 0, width, height };
}

export function belowTextCompactThresholdPx(
  type: InteractiveCanvasObjectType,
): number | undefined {
  return isBelowTextType(type) ? BELOW_TEXT_TYPE_CONFIG[type].compactBelowHeightPx : undefined;
}

export type WrappedTextEstimate = {
  lines: number;
  longestLineWidthPx: number;
};

/**
 * One estimated caption line: its text (null for a line holding a piece of a
 * word too wide to fit — the estimate splits those by width, not by
 * character) and its estimated width.
 */
type EstimatedLine = { text: string | null; widthPx: number };

/** The estimator's greedy wrap at 0.62em per character, line by line. */
function estimateWrappedLines(
  text: string,
  availableWidthPx: number,
  fontSizePx: number = BELOW_TEXT_FONT_SIZE_PX,
): EstimatedLine[] {
  if (text === "") return [];
  const width = Math.max(1, availableWidthPx);
  const charWidthPx = fontSizePx * BELOW_TEXT_CHAR_WIDTH_EM;
  const lines: EstimatedLine[] = [];

  for (const hardLine of text.split("\n")) {
    const words = hardLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push({ text: "", widthPx: 0 });
      continue;
    }

    let currentText: string | null = "";
    let currentWidth = 0;

    for (const word of words) {
      let wordWidth = word.length * charWidthPx;
      if (wordWidth > width) {
        if (currentWidth > 0) {
          lines.push({ text: currentText, widthPx: currentWidth });
          currentWidth = 0;
        }
        while (wordWidth > width) {
          lines.push({ text: null, widthPx: width });
          wordWidth -= width;
        }
        currentText = null;
        currentWidth = wordWidth;
        continue;
      }

      if (currentWidth === 0) {
        currentText = word;
        currentWidth = wordWidth;
      } else if (currentWidth + charWidthPx + wordWidth <= width) {
        currentText = currentText === null ? null : `${currentText} ${word}`;
        currentWidth += charWidthPx + wordWidth;
      } else {
        lines.push({ text: currentText, widthPx: currentWidth });
        currentText = word;
        currentWidth = wordWidth;
      }
    }

    if (currentWidth > 0) lines.push({ text: currentText, widthPx: currentWidth });
  }

  return lines;
}

/** Pure wrapped-line estimator shared by below-band sizing and tests (figjam name size by default). */
export function estimateWrappedText(
  text: string,
  availableWidthPx: number,
  fontSizePx: number = BELOW_TEXT_FONT_SIZE_PX,
): WrappedTextEstimate {
  const lines = estimateWrappedLines(text, availableWidthPx, fontSizePx);
  return {
    lines: lines.length,
    longestLineWidthPx: lines.reduce((longest, line) => Math.max(longest, line.widthPx), 0),
  };
}

export function estimateWrappedLineCount(
  text: string,
  availableWidthPx: number,
  fontSizePx: number = BELOW_TEXT_FONT_SIZE_PX,
): number {
  return estimateWrappedText(text, availableWidthPx, fontSizePx).lines;
}

function belowTextHidden(object: InteractiveCanvasObject, slot: TextSlot): boolean {
  const compactThreshold = belowTextCompactThresholdPx(object.type) ?? slot.compactBelowHeightPx;
  return compactThreshold !== undefined && object.geometry.height < compactThreshold;
}

export type BelowBandSize = {
  lines: number;
  widthPx: number;
  heightPx: number;
};

export function belowBandMaxWidthPx(object: Pick<InteractiveCanvasObject, "geometry">): number {
  return Math.max(object.geometry.width, BELOW_BAND_MIN_WIDTH_PX);
}

/**
 * Content band size for below-glyph text: the wrapped name lines, then —
 * when the object has a detail — the gap and the one detail line (contract
 * §4: the band grows by the detail). `lines` counts name lines only. The
 * detail widens the band up to its max width (where it ellipsizes); name and
 * detail metrics come from `canvasStyle` (`textFontSizePx` / weight, the
 * detail font — callers without one size with the default style). The gap to
 * the glyph is owned by the slot rect.
 */
export function belowBandSize(
  text: string,
  object: InteractiveCanvasObject,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): BelowBandSize {
  const detailText = slotDetailText(object);
  if (!isBelowTextType(object.type) || (text === "" && detailText === "")) {
    return { lines: 0, widthPx: 0, heightPx: 0 };
  }
  const slot = belowTextSlotForType(object.type);
  if (belowTextHidden(object, slot)) {
    return { lines: 0, widthPx: 0, heightPx: 0 };
  }
  const maxWidth = belowBandMaxWidthPx(object);
  const fontSizePx = canvasStyle.textFontSizePx;
  const estimate = estimateWrappedLines(text, maxWidth, fontSizePx);
  // The estimate decides the lines; the band is then at least as wide as
  // each of them really measures in the name font (+ slack), so neither
  // renderer — both wrap inside this width at real Inter advances — breaks a
  // line the estimate kept whole. 0.62em runs narrow for short words of wide
  // glyphs ("Code", "Bun"), which otherwise broke mid-word.
  let widthPx = 0;
  for (const line of estimate) {
    widthPx = Math.max(widthPx, line.widthPx);
    if (line.text === null || line.text === "") continue;
    const measured = measureInterTextPx(line.text, fontSizePx, canvasStyle.textFontWeight);
    if (measured + BELOW_BAND_FIT_SLACK_PX > line.widthPx) {
      widthPx = Math.max(widthPx, measured + BELOW_BAND_FIT_SLACK_PX);
    }
  }
  widthPx = Math.min(maxWidth, widthPx);
  let heightPx = estimate.length * fontSizePx * BELOW_TEXT_LINE_HEIGHT;
  if (detailText !== "") {
    const typography = detailTypography(canvasStyle);
    widthPx = Math.max(widthPx, Math.min(maxWidth, estimateDetailWidthPx(detailText, typography)));
    heightPx += (estimate.length > 0 ? DETAIL_LINE_GAP_PX : 0) + typography.lineHeightPx;
  }
  return { lines: estimate.length, widthPx, heightPx };
}

function belowTextSlotForType(_type: BelowTextType): TextSlot {
  return BELOW_TEXT_SLOT;
}

/**
 * The caption band's rect, object-local: `band` centered under the glyph box
 * (iconGlyphBoxPx — the tile in the tile style), BELOW_BAND_GAP_PX below it.
 */
function belowBandRectPx(glyph: LocalRect, band: Pick<BelowBandSize, "widthPx" | "heightPx">): LocalRect {
  return {
    x: glyph.x + (glyph.width - band.widthPx) / 2,
    y: glyph.y + glyph.height + BELOW_BAND_GAP_PX,
    width: band.widthPx,
    height: band.heightPx,
  };
}

/**
 * The painted picture, object-local: glyph box (the tile in the tile style —
 * iconGlyphBoxPx) ∪ caption band (name lines + detail line). Painted bounds
 * read it directly; objects/geometry.ts builds hit bounds (∪ the object box)
 * and connection bounds (the glyph box's columns, down through the band) on
 * it. Default style when `canvasStyle` is omitted.
 */
export function belowExtendedBoundsPx(
  object: InteractiveCanvasObject,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): LocalRect {
  const glyph = iconGlyphBoxPx(object, canvasStyle);
  const band = belowBandSize(object.text, object, canvasStyle);
  if (band.heightPx === 0) return glyph;
  const bandRect = belowBandRectPx(glyph, band);
  const minX = Math.min(glyph.x, bandRect.x);
  const maxX = Math.max(glyph.x + glyph.width, bandRect.x + bandRect.width);
  const maxY = Math.max(glyph.y + glyph.height, bandRect.y + bandRect.height);
  return {
    x: minX,
    y: glyph.y,
    width: maxX - minX,
    height: maxY - glyph.y,
  };
}

// ---------------------------------------------------------------------------
// Detail line (contract §4): ONE muted line under the name — inside a shape's
// center/rect slot (name + detail center as one block, and the name loses
// lines before the detail disappears) and at the end of an icon's below band
// (the band grows by it). Stickies never paint one (their body is markdown);
// sections paint theirs in the header chip, not in a text slot. Live and
// static renderers both read it from ResolvedTextSlot.detail.
// ---------------------------------------------------------------------------

/** Gap between the name block and the detail line. */
export const DETAIL_LINE_GAP_PX = 3;
/** Detail line-height as a multiple of its font size. */
export const DETAIL_LINE_HEIGHT = 1.3;
/** IBM Plex Mono detail weight. */
export const DETAIL_MONO_FONT_WEIGHT = 500;
/** Inter detail weight. */
export const DETAIL_SANS_FONT_WEIGHT = 400;
/**
 * Average Inter advance, in em, the below band sizes a sans detail with —
 * the same char-count heuristic the name band uses (errs wide, so the band
 * never ellipsizes a detail the renderers would show whole).
 */
const DETAIL_SANS_ESTIMATE_CHAR_EM = 0.62;

/** How a detail line paints under one canvas style. */
export interface DetailTypography {
  font: CanvasStyleFont;
  /** CSS font stack (theme/fonts.ts). */
  fontFamily: string;
  fontSizePx: number;
  fontWeight: number;
  lineHeightPx: number;
  color: string;
}

/** The detail line's font, size, weight, line box, and color under `canvasStyle`. */
export function detailTypography(canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE): DetailTypography {
  const mono = canvasStyle.detailFont === "mono";
  return {
    font: mono ? "mono" : "sans",
    fontFamily: mono ? CANVAS_MONO_FONT_STACK : CANVAS_SANS_FONT_STACK,
    fontSizePx: canvasStyle.detailFontSizePx,
    fontWeight: mono ? DETAIL_MONO_FONT_WEIGHT : DETAIL_SANS_FONT_WEIGHT,
    lineHeightPx: canvasStyle.detailFontSizePx * DETAIL_LINE_HEIGHT,
    color: canvasStyle.detailColor,
  };
}

/** A detail as the one line it paints: whitespace runs (newlines included) collapsed to single spaces, trimmed. */
export function collapseDetailText(detail: string | undefined): string {
  return typeof detail === "string" ? detail.replace(/\s+/g, " ").trim() : "";
}

/**
 * The detail line `object`'s text slot paints ("" for none). Stickies and
 * sections never paint one in a slot, whatever the document holds.
 */
export function slotDetailText(object: Pick<InteractiveCanvasObject, "type" | "detail">): string {
  if (object.type === "sticky" || object.type === "section") return "";
  return collapseDetailText(object.detail);
}

/**
 * Width a detail run is budgeted for when a band sizes itself to it: exact
 * for mono (one MONO_ADVANCE_EM cell per codepoint, as render/text-metrics.ts
 * measureMonoTextPx measures), the char-count heuristic for sans. Wrapping
 * and ellipsis decisions measure real advances in the renderers.
 */
export function estimateDetailWidthPx(text: string, typography: DetailTypography): number {
  let glyphs = 0;
  for (const _char of text) glyphs += 1;
  const em = typography.font === "mono" ? MONO_ADVANCE_EM : DETAIL_SANS_ESTIMATE_CHAR_EM;
  return glyphs * em * typography.fontSizePx;
}

/**
 * `slot`'s typography under the workspace canvas style. The shape-text
 * baseline (center / below / rect slots) takes the style's name size, weight,
 * and name color — the shape paint's text color in a body slot, the icon label
 * color in the below band — and the sticky body preset takes the sticky
 * paint's text color. Any other typography (the title chip, a custom slot)
 * is returned as given. Under the default style every value equals the
 * preset's own, so figjam renders are unchanged.
 */
export function resolveSlotTypography(
  slot: TextSlot,
  object: Pick<InteractiveCanvasObject, "color">,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): SlotTypography {
  const base = slot.typography;
  let color: string;
  let fontWeight = base.fontWeight;
  let fontSizePx = base.fontSizePx;
  if (base === SHAPE_TEXT_TYPOGRAPHY) {
    const pick = object.color ?? FIRST_USE_COLORS.shape;
    color =
      slot.placement === "below"
        ? resolveIconPaint(pick, canvasStyle).label
        : resolveShapePaint(pick, canvasStyle).text;
    fontWeight = canvasStyle.textFontWeight;
    fontSizePx = canvasStyle.textFontSizePx;
  } else if (base === INSET_BODY_TEXT_SLOT.typography) {
    color = resolveStickyPaint(object.color ?? FIRST_USE_COLORS.sticky, canvasStyle).text;
  } else {
    return base;
  }
  return color === base.color && fontWeight === base.fontWeight && fontSizePx === base.fontSizePx
    ? base
    : { ...base, color, fontWeight, fontSizePx };
}

/**
 * The most lines the name may paint in `resolved` (the live
 * -webkit-line-clamp, the static clampLines): the slot height less the detail
 * line's reserve, one line at minimum.
 */
export function slotNameLineCapacity(resolved: ResolvedTextSlot): number {
  const reserve = resolved.detail
    ? resolved.detail.gapPx + resolved.detail.typography.lineHeightPx
    : 0;
  return textSlotClampLineCount(resolved.rect.height - reserve, slotLineHeightPx(resolved.typography));
}

/**
 * The detail line a slot paints, or null. Center / rect slots paint it only
 * while the name block's first line (when there is a name) plus the detail
 * line fit the slot height (shorter, the detail drops and the name keeps the
 * slot) — a detail-only shape needs just the detail line. `named` is true
 * whenever a name line paints above it: a non-empty name, or the in-place
 * editor's textarea. The below band always makes room. Title chips
 * (sections) and inset bodies (stickies) never do.
 */
function resolveSlotDetail(
  slot: TextSlot,
  object: InteractiveCanvasObject,
  rect: LocalRect,
  typography: SlotTypography,
  hidden: boolean,
  canvasStyle: CanvasStyle,
  named: boolean,
): ResolvedSlotDetail | null {
  const text = slotDetailText(object);
  if (text === "" || hidden || rect.width <= 0) return null;
  const placement = textPlacementName(slot.placement);
  if (placement === "title-chip" || placement === "inset-body") return null;
  const detail = { text, typography: detailTypography(canvasStyle), gapPx: DETAIL_LINE_GAP_PX };
  if (placement === "below") return detail;
  const nameReserve = named ? slotLineHeightPx(typography) + detail.gapPx : 0;
  return rect.height >= nameReserve + detail.typography.lineHeightPx ? detail : null;
}

// ---------------------------------------------------------------------------
// Section title chip geometry — the chip IS the title-chip preset, and the
// editor overlay consumes the same numbers. The layout (placement, icon,
// title, detail, scale, width budget) lives with the section in
// objects/section/title-chip-layout.ts; re-exported here for back-compat.
// ---------------------------------------------------------------------------

export {
  TITLE_CHIP,
  estimateTitleChipWidthPx,
  titleChipMaxWidthPx,
  titleChipScale,
} from "./section/title-chip-layout";

// ---------------------------------------------------------------------------
// The presets.
// ---------------------------------------------------------------------------

/** "center" — inside the shape body, centered both ways. The default for shapes. */
export const CENTER_TEXT_SLOT: TextSlot = {
  placement: "center",
  typography: SHAPE_TEXT_TYPOGRAPHY,
  zoom: "natural",
  verticalAlign: "center",
  multiline: true,
};

/** "below" — bold band under the icon glyph. */
export function belowTextSlot(options?: { compactBelowHeightPx?: number }): TextSlot {
  return {
    placement: "below",
    typography: SHAPE_TEXT_TYPOGRAPHY,
    zoom: "natural",
    verticalAlign: "top",
    multiline: true,
    ...(options?.compactBelowHeightPx !== undefined
      ? { compactBelowHeightPx: options.compactBelowHeightPx }
      : null),
  };
}

export const BELOW_TEXT_SLOT: TextSlot = belowTextSlot();

/** Sticky body inset (px) — FigJam-sampled (STICKY text inset left/top). */
export const INSET_BODY_PADDING_PX = { left: 21, top: 28, right: 21, bottom: 21 } as const;

/** "inset-body" — padded multi-line body area (sticky). Renders simple markdown at rest (D18). */
export const INSET_BODY_TEXT_SLOT: TextSlot = {
  placement: "inset-body",
  typography: {
    fontSizePx: 24,
    fontWeight: 400,
    lineHeight: "36px",
    textAlign: "left",
    color: "rgba(0, 0, 0, 0.8)",
  },
  zoom: "natural",
  verticalAlign: "top",
  multiline: true,
};

/** "title-chip" — floating chip, top-left, zoom counter-scaled (section). */
export const TITLE_CHIP_TEXT_SLOT: TextSlot = {
  placement: "title-chip",
  typography: {
    fontSizePx: TITLE_CHIP.fontSizePx,
    fontWeight: TITLE_CHIP.fontWeight,
    lineHeight: `${TITLE_CHIP.heightPx}px`,
    textAlign: "left",
    color: TITLE_CHIP.textColor,
  },
  zoom: "chip-scale",
  verticalAlign: "center",
  multiline: false,
};

/** The escape hatch: a def-provided object-local rect, shape-baseline typography unless overridden. */
export function rectTextSlot(
  rect: (object: InteractiveCanvasObject) => LocalRect,
  options?: Partial<Omit<TextSlot, "placement">>,
): TextSlot {
  return {
    placement: { rect },
    typography: SHAPE_TEXT_TYPOGRAPHY,
    zoom: "natural",
    verticalAlign: "center",
    multiline: true,
    ...options,
  };
}

// ---------------------------------------------------------------------------
// Resolution — the ONE rect/typography source both the at-rest renderer
// (objects/object-shell.tsx ObjectSlotText) and the in-place editor
// (stage/editor/features/text-editing) consume.
// ---------------------------------------------------------------------------

export function resolveTextSlot(
  slot: TextSlot,
  object: InteractiveCanvasObject,
  zoom = 1,
  options?: {
    draftText?: string;
    /**
     * Workspace canvas style: the typography's name color/weight, the detail
     * line's font and size (and so the below band), and the title-chip width
     * (its border width). Omitted = the default style.
     */
    canvasStyle?: CanvasStyle;
  },
): ResolvedTextSlot {
  const { width, height } = object.geometry;
  const hidden = belowTextHidden(object, slot);
  const scale = slot.zoom === "chip-scale" ? titleChipScale(zoom) : 1;
  const canvasStyle = options?.canvasStyle ?? DEFAULT_CANVAS_STYLE;
  const typography = resolveSlotTypography(slot, object, canvasStyle);

  let rect: LocalRect;
  if (typeof slot.placement === "object") {
    rect = slot.placement.rect(object);
  } else if (slot.placement === "center") {
    rect = inscribedTextRect(object) ?? {
      x: CENTER_TEXT_INSET_PX.x,
      y: CENTER_TEXT_INSET_PX.y,
      width: Math.max(0, width - CENTER_TEXT_INSET_PX.x * 2),
      height: Math.max(0, height - CENTER_TEXT_INSET_PX.y * 2),
    };
  } else if (slot.placement === "below") {
    const band = belowBandSize(options?.draftText ?? object.text, object, canvasStyle);
    // At least one name line box (the editor's textarea), then the detail
    // line's reserve when the object has one.
    const detailLine = detailTypography(canvasStyle).lineHeightPx;
    const detailReserve = slotDetailText(object) !== "" && !hidden ? DETAIL_LINE_GAP_PX + detailLine : 0;
    // Directly under the glyph box — the tile, in the tile style.
    rect = belowBandRectPx(iconGlyphBoxPx(object, canvasStyle), {
      widthPx: band.widthPx,
      heightPx: Math.max(1, band.lines) * slotLineHeightPx(typography) + detailReserve,
    });
  } else if (slot.placement === "inset-body") {
    rect = {
      x: INSET_BODY_PADDING_PX.left,
      y: INSET_BODY_PADDING_PX.top,
      width: Math.max(0, width - INSET_BODY_PADDING_PX.left - INSET_BODY_PADDING_PX.right),
      height: Math.max(0, height - INSET_BODY_PADDING_PX.top - INSET_BODY_PADDING_PX.bottom),
    };
  } else {
    // title-chip: the section header chip's painted box (objects/section/
    // title-chip-layout.ts) — floating (inset) or pinned (flush in the
    // corner), its width tracking the icon, title, and detail (a mirror of
    // the chip's CSS auto width), capped to the section's inner width at
    // every zoom.
    rect = titleChipLayout(object, canvasStyle, zoom).box;
  }

  return {
    rect,
    typography,
    verticalAlign: slot.verticalAlign,
    multiline: slot.multiline,
    hidden,
    scale,
    // A draft means the in-place editor is open: its textarea is a name line.
    detail: resolveSlotDetail(
      slot,
      object,
      rect,
      typography,
      hidden,
      canvasStyle,
      options?.draftText !== undefined || object.text !== "",
    ),
  };
}

/** Stable name for a slot's placement (data attributes, tests). */
export function textPlacementName(
  placement: TextPlacement,
): "center" | "below" | "inset-body" | "title-chip" | "rect" {
  return typeof placement === "object" ? "rect" : placement;
}
