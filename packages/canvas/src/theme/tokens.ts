"use client";

/**
 * tokens.ts — the ONE global theme token module (co-location alignment, 2026-07-07;
 * SHRUNK by the P1 color cutover, OBJECT-DEF-OVERHAUL.md §3.6).
 *
 * The old color-resolution cascade (toneMix / canvasToneStyle /
 * PALETTE_TOKEN_HUE / paletteTokenStyle / STICKY_TOKEN_FILL /
 * resolveObjectColors / SECTION_FAMILIES / resolveSectionColors /
 * CANVAS_PALETTE_TOKENS) is gone: objects store one `color?: CanvasColor`
 * pick and every kind resolves it through the palette role tables in the
 * top-level leaf module `palette.ts` (resolveShapeColors /
 * resolveSectionColors / resolveStickyFill / resolveConnectorStroke, and the
 * theme-aware resolveShapePaint / resolveSectionPaint / … family). Board,
 * text, and per-kind colors are CanvasStyle tokens now (theme/canvas-style.ts);
 * what remains here is genuinely global, non-color-cascade UI theming: the
 * editor-chrome CSS variables, the universal stroke width, and the text size
 * hierarchy. Values were originally sampled from FigJam reference exports
 * (board-design-reference/); every `*Px` figure is LOGICAL px (independent
 * of canvas zoom).
 *
 * Layering: theme depends on nothing but state/schema types. It must never
 * pull from objects/ (objects sit above theme).
 */

import type { CanvasObjectStyle } from "../state/schema";
import { DEFAULT_CANVAS_STYLE, FIGJAM_CANVAS_STYLE, type CanvasStyle } from "./canvas-style";

export const canvasSurfaceStyle = {
  "--interactive-canvas-grid": "color-mix(in oklab, var(--border) 52%, transparent)",
  "--interactive-canvas-guide": "color-mix(in oklab, var(--primary) 42%, transparent)",
  "--interactive-canvas-highlight": "color-mix(in oklab, var(--primary) 18%, transparent)",
} as const;

/**
 * Default shape stroke width, logical px — kept for back-compat; the live
 * value is `CanvasStyle.shapeBorderWidthPx` (theme/canvas-style.ts).
 */
export const SHAPE_STROKE_WIDTH_PX = DEFAULT_CANVAS_STYLE.shapeBorderWidthPx;

/**
 * Border width for an object's trim (logical px): the workspace canvas
 * style's shape border (`canvasStyle.shapeBorderWidthPx`), overridable per
 * object via `style.strokeWidth`.
 */
export function resolveObjectStrokeWidth(
  style: CanvasObjectStyle | undefined,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): number {
  if (style?.strokeWidth !== undefined && style.strokeWidth > 0) return style.strokeWidth;
  return canvasStyle.shapeBorderWidthPx;
}

/**
 * Corner radius of a rect-family shape's trim (logical px), by its effective
 * render shape (`style.shape`; absent = the rounded rect): the default
 * rounded rect — process and rectangle objects — takes the canvas style's
 * `processCornerRadiusPx`, every other rect-family silhouette (predefined
 * process) `shapeCornerRadiusPx`.
 */
export function resolveShapeCornerRadius(
  renderShape: string | undefined,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): number {
  return (renderShape ?? "rounded-rect") === "rounded-rect"
    ? canvasStyle.processCornerRadiusPx
    : canvasStyle.shapeCornerRadiusPx;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Text size hierarchy, logical px (figjam defaults; themed sizes are CanvasStyle tokens). */
export const TEXT_SIZES_PX = {
  /** Section title chip — the live value is `CanvasStyle.headerFontSizePx`. */
  chipLabel: FIGJAM_CANVAS_STYLE.headerFontSizePx,
  stickyBody: 24,
  stickyLineHeight: 36,
  stickyAuthor: 12,
  boldLabel: 20,
  /** Shape text and icon labels — the live value is `CanvasStyle.textFontSizePx`. */
  shapeText: FIGJAM_CANVAS_STYLE.textFontSizePx,
} as const;
