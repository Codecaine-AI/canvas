"use client";

import type { InteractiveCanvasObject, InteractiveCanvasObjectType } from "../state/schema";
import { inscribedTextRect } from "./inscribed-text-rects";
import { CENTER_TEXT_INSET_PX } from "./text-slot-constants";

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
 *  - { rect }      escape hatch: object-local rect function (arrow/chevron
 *                  center text in the body excluding head/notch — replacing
 *                  the old labelStyle margin hacks; code block's body area)
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
  typography: SlotTypography;
  verticalAlign: TextSlot["verticalAlign"];
  multiline: boolean;
  /** True when the compact threshold hides the text entirely. */
  hidden: boolean;
  /** View counter-scale factor (title-chip when zoomed out); 1 everywhere else. */
  scale: number;
}

// ---------------------------------------------------------------------------
// Shared shape-text baseline (D6): center-justified, bold, dark (D8).
// ---------------------------------------------------------------------------

/** The one object-text color (D8) — dark/near-black, never derived per palette pick. */
export const OBJECT_TEXT_COLOR = "#000000";

export const BELOW_TEXT_TYPES = ["icon"] as const;
export type BelowTextType = (typeof BELOW_TEXT_TYPES)[number];

export const BELOW_TEXT_TYPE_CONFIG: Readonly<
  Record<BelowTextType, { compactBelowHeightPx?: number }>
> = {
  icon: {},
} as const;

export const BELOW_TEXT_FONT_SIZE_PX = 15;
export const BELOW_TEXT_FONT_WEIGHT = 700;
export const BELOW_TEXT_LINE_HEIGHT = 1.2;
export const BELOW_TEXT_LINE_HEIGHT_PX = BELOW_TEXT_FONT_SIZE_PX * BELOW_TEXT_LINE_HEIGHT;
export const BELOW_BAND_GAP_PX = 6;
export const BELOW_BAND_MIN_WIDTH_PX = 200;

const BELOW_TEXT_TYPE_SET = new Set<InteractiveCanvasObjectType>(BELOW_TEXT_TYPES);
const BELOW_TEXT_CHAR_WIDTH_PX = BELOW_TEXT_FONT_SIZE_PX * 0.62;

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

/** Pure wrapped-line estimator shared by rendering, editing, tests, and SSR. */
export function estimateSlotLineCount(
  text: string,
  availableWidthPx: number,
  _typography: SlotTypography,
): number {
  return estimateWrappedLineCount(text, availableWidthPx);
}

export function isBelowTextType(type: InteractiveCanvasObjectType): type is BelowTextType {
  return BELOW_TEXT_TYPE_SET.has(type);
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

/** Pure wrapped-line estimator shared by below-band sizing and tests. */
export function estimateWrappedText(
  text: string,
  availableWidthPx: number,
): WrappedTextEstimate {
  if (text === "") return { lines: 0, longestLineWidthPx: 0 };
  const width = Math.max(1, availableWidthPx);
  let totalLines = 0;
  let longestLineWidthPx = 0;

  function commitLine(lineWidth: number): void {
    totalLines += 1;
    longestLineWidthPx = Math.max(longestLineWidthPx, lineWidth);
  }

  for (const hardLine of text.split("\n")) {
    const words = hardLine.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      commitLine(0);
      continue;
    }

    let currentWidth = 0;

    for (const word of words) {
      let wordWidth = word.length * BELOW_TEXT_CHAR_WIDTH_PX;
      if (wordWidth > width) {
        if (currentWidth > 0) {
          commitLine(currentWidth);
          currentWidth = 0;
        }
        while (wordWidth > width) {
          commitLine(width);
          wordWidth -= width;
        }
        currentWidth = wordWidth;
        continue;
      }

      if (currentWidth === 0) {
        currentWidth = wordWidth;
      } else if (currentWidth + BELOW_TEXT_CHAR_WIDTH_PX + wordWidth <= width) {
        currentWidth += BELOW_TEXT_CHAR_WIDTH_PX + wordWidth;
      } else {
        commitLine(currentWidth);
        currentWidth = wordWidth;
      }
    }

    if (currentWidth > 0) commitLine(currentWidth);
  }

  return { lines: totalLines, longestLineWidthPx };
}

export function estimateWrappedLineCount(text: string, availableWidthPx: number): number {
  return estimateWrappedText(text, availableWidthPx).lines;
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

/** Content band size for below-glyph text. The gap is owned by the slot rect. */
export function belowBandSize(
  text: string,
  object: InteractiveCanvasObject,
): BelowBandSize {
  if (!isBelowTextType(object.type) || text === "") {
    return { lines: 0, widthPx: 0, heightPx: 0 };
  }
  const slot = belowTextSlotForType(object.type);
  if (belowTextHidden(object, slot)) {
    return { lines: 0, widthPx: 0, heightPx: 0 };
  }
  const maxWidth = belowBandMaxWidthPx(object);
  const estimate = estimateWrappedText(text, maxWidth);
  return {
    lines: estimate.lines,
    widthPx: Math.min(maxWidth, estimate.longestLineWidthPx),
    heightPx: estimate.lines * BELOW_TEXT_LINE_HEIGHT_PX,
  };
}

function belowTextSlotForType(_type: BelowTextType): TextSlot {
  return BELOW_TEXT_SLOT;
}

export function belowExtendedBoundsPx(object: InteractiveCanvasObject): LocalRect {
  const glyph = {
    x: 0,
    y: 0,
    width: object.geometry.width,
    height: object.geometry.height,
  };
  const band = belowBandSize(object.text, object);
  if (band.lines === 0) return glyph;
  const bandRect = {
    x: (object.geometry.width - band.widthPx) / 2,
    y: object.geometry.height + BELOW_BAND_GAP_PX,
    width: band.widthPx,
    height: band.heightPx,
  };
  const minX = Math.min(glyph.x, bandRect.x);
  const maxX = Math.max(glyph.x + glyph.width, bandRect.x + bandRect.width);
  const maxY = Math.max(glyph.y + glyph.height, bandRect.y + bandRect.height);
  return {
    x: minX,
    y: 0,
    width: maxX - minX,
    height: maxY,
  };
}

// ---------------------------------------------------------------------------
// Section title chip geometry (moved from objects/section/def.tsx — the chip
// IS the title-chip preset, and the editor overlay consumes the same numbers).
// ---------------------------------------------------------------------------

export const TITLE_CHIP = {
  heightPx: 27,
  borderWidthPx: 2,
  textColor: OBJECT_TEXT_COLOR,
  fontSizePx: 16,
  fontWeight: 700,
  paddingXPx: 10,
  insetFromSectionCornerPx: 3,
  maxZoomOutScale: 6,
  // Sub-linear zoom-out growth: 1 = constant screen size (full 1/zoom
  // compensation, reads oversized next to the shrunken content), 0 = no
  // growth. 0.6 keeps titles readable from afar without dwarfing the board.
  zoomOutGrowth: 0.6,
} as const;

/** Heuristic screen width of the title chip at zoom 1 — mirrors the chip's CSS auto-sizing. */
export function estimateTitleChipWidthPx(text: string): number {
  const { fontSizePx, paddingXPx, borderWidthPx } = TITLE_CHIP;
  return Math.max(72, text.length * fontSizePx * 0.62 + paddingXPx * 2 + borderWidthPx * 2);
}

/**
 * FigJam-style counter-scale for the section title chip: when zoomed out the
 * chip grows by (1/zoom)^zoomOutGrowth — sub-linear, so titles read from afar
 * yet still shrink somewhat with the board instead of staying full-size on
 * screen. Uniform across all sections regardless of their width (a long
 * title truncates to its section via `titleChipMaxWidthPx` rather than
 * shrinking, so labels never come out in mismatched sizes). At zoom >= 1 the
 * scale is 1 (the chip renders at its natural document size).
 */
export function titleChipScale(zoom: number): number {
  const { maxZoomOutScale, zoomOutGrowth } = TITLE_CHIP;
  return Math.min(Math.max((1 / zoom) ** zoomOutGrowth, 1), maxZoomOutScale);
}

/**
 * Pre-transform width budget for a scaled chip: the scaled chip may span up
 * to its section's inner width but never spill past it — overflow renders as
 * an ellipsis instead of a mid-letter clip at the section's overflow:hidden
 * edge.
 */
export function titleChipMaxWidthPx(sectionWidthPx: number, scale: number): number {
  const inner = sectionWidthPx - TITLE_CHIP.insetFromSectionCornerPx * 2;
  return Math.max(0, inner / scale);
}

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
  options?: { draftText?: string },
): ResolvedTextSlot {
  const { width, height } = object.geometry;
  const hidden = belowTextHidden(object, slot);
  const scale = slot.zoom === "chip-scale" ? titleChipScale(zoom) : 1;

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
    const band = belowBandSize(options?.draftText ?? object.text, object);
    rect = {
      x: (width - band.widthPx) / 2,
      y: height + BELOW_BAND_GAP_PX,
      width: band.widthPx,
      height: Math.max(1, band.lines) * slotLineHeightPx(slot.typography),
    };
  } else if (slot.placement === "inset-body") {
    rect = {
      x: INSET_BODY_PADDING_PX.left,
      y: INSET_BODY_PADDING_PX.top,
      width: Math.max(0, width - INSET_BODY_PADDING_PX.left - INSET_BODY_PADDING_PX.right),
      height: Math.max(0, height - INSET_BODY_PADDING_PX.top - INSET_BODY_PADDING_PX.bottom),
    };
  } else {
    // title-chip: width tracks the text (heuristic mirror of the chip's CSS
    // auto width), capped to the section's inner width at every zoom.
    const estimated = estimateTitleChipWidthPx(object.text);
    const chipWidth = Math.min(estimated, titleChipMaxWidthPx(width, scale));
    rect = {
      x: TITLE_CHIP.insetFromSectionCornerPx,
      y: TITLE_CHIP.insetFromSectionCornerPx,
      width: chipWidth,
      height: TITLE_CHIP.heightPx,
    };
  }

  return {
    rect,
    typography: slot.typography,
    verticalAlign: slot.verticalAlign,
    multiline: slot.multiline,
    hidden,
    scale,
  };
}

/** Stable name for a slot's placement (data attributes, tests). */
export function textPlacementName(
  placement: TextPlacement,
): "center" | "below" | "inset-body" | "title-chip" | "rect" {
  return typeof placement === "object" ? "rect" : placement;
}
