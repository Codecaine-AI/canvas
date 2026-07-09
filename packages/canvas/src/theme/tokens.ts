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
 * resolveSectionColors / resolveStickyFill / resolveConnectorStroke). What
 * remains here is genuinely global, non-color-cascade UI theming: the canvas
 * surface CSS variables, the universal stroke width, and the text size
 * hierarchy. Values were originally sampled from FigJam reference exports
 * (board-design-reference/); every `*Px` figure is LOGICAL px (independent
 * of canvas zoom).
 *
 * Layering: theme depends on nothing but state/schema types. It must never
 * pull from objects/ (objects sit above theme).
 */

import type { CanvasObjectStyle } from "../state/schema";

export const canvasSurfaceStyle = {
  "--interactive-canvas-grid": "color-mix(in oklab, var(--border) 52%, transparent)",
  "--interactive-canvas-guide": "color-mix(in oklab, var(--primary) 42%, transparent)",
  "--interactive-canvas-highlight": "color-mix(in oklab, var(--primary) 18%, transparent)",
} as const;

/** Universal shape stroke width, logical px (consumed by resolveObjectStrokeWidth). */
export const SHAPE_STROKE_WIDTH_PX = 4;

/**
 * Border width for an object's chrome (logical px): the FigJam universal
 * shape stroke (SHAPE_STROKE_WIDTH_PX, 4px), overridable per object via
 * `style.strokeWidth`.
 */
export function resolveObjectStrokeWidth(style: CanvasObjectStyle | undefined): number {
  if (style?.strokeWidth !== undefined && style.strokeWidth > 0) return style.strokeWidth;
  return SHAPE_STROKE_WIDTH_PX;
}

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/** Text size hierarchy, logical px. */
export const TEXT_SIZES_PX = {
  chipLabel: 16,
  stickyBody: 24,
  stickyLineHeight: 36,
  stickyAuthor: 12,
  boldLabel: 20,
  shapeText: 15,
} as const;
