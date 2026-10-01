"use client";

import { iconGlyphStrokeWidthForViewBox, type IconGlyphDefinition } from "./icon-glyphs";
import { iconTileRectPx, type LocalRect } from "../../text-slots";

/**
 * Icon object glyph geometry for both icon styles (CanvasStyle.iconStyle),
 * shared by the live IconShapeBody and the static SVG renderer so the two
 * draw the same boxes. Pure data + math: no React, no DOM.
 *
 *  - `glyph` (figjam): the bare glyph, scaled to fit the object box
 *    (preserveAspectRatio meet), stroked at a constant rendered weight
 *    (`iconGlyphStrokeWidthForViewBox` over the box's smaller side).
 *  - `tile`: a rounded square in that same glyph box — the
 *    min(width, height, CanvasStyle.iconTileMaxPx) square, centered both
 *    ways (text-slots.ts iconTileRectPx; the caption hangs under the tile,
 *    and connectors meet it) — with the glyph centered on it:
 *    inset ICON_TILE.glyphInsetRatio of the tile side on every edge, but
 *    never wider than ICON_TILE.maxGlyphPx, so a large tile does not carry a
 *    giant glyph. The glyph is a pictogram that scales WITH its tile up to
 *    that cap: its stroke is fixed in glyph units (iconTileGlyphStrokeWidth),
 *    so a tile reads like the approved schematic mockups (44px tile, 24px
 *    Tabler glyph, 1.75 stroke) at every size. The tile's paint — solid ink,
 *    or a light tint above `iconTileSolidMaxPx` — is theme/palette.ts
 *    resolveIconTilePaint.
 *
 * Fill-paint glyphs (the `brand-*` Simple Icons logos) take no stroke in
 * either style: they fill with the glyph color.
 */

export const ICON_TILE = {
  /** Tile corner radius, px. */
  cornerRadiusPx: 3,
  /** Glyph inset from each tile edge, as a fraction of the tile side (≈ the mockups' 10px on a 44px tile). */
  glyphInsetRatio: 0.22,
  /** Largest glyph a tile carries, px: beyond it the glyph stays this size, centered. */
  maxGlyphPx: 56,
  /**
   * The box size whose `iconGlyphStrokeWidthForViewBox` weight every tile
   * glyph strokes with, in its own glyph units: ≈1.76 units on Tabler's
   * 24-unit grid (the mockups' 1.75), 1.32 on Nucleo's 18-unit grid.
   */
  strokeReferencePx: 64,
} as const;

export interface IconTileLayout {
  /** The tile square, object-local px. */
  tile: LocalRect;
  /** The inset box the glyph is drawn into, object-local px. */
  glyph: LocalRect;
}

/**
 * The tile square (min(width, height, maxSidePx), centered — the style's
 * `iconTileMaxPx`; uncapped when omitted) and the glyph box centered inside
 * it: min(side × (1 − 2 × glyphInsetRatio), maxGlyphPx). Tile borders paint
 * inside the tile edge, so they never move the glyph.
 */
export function iconTileLayout(width: number, height: number, maxSidePx?: number): IconTileLayout {
  const tile = iconTileRectPx(width, height, maxSidePx);
  const side = tile.width;
  const glyphSide = Math.min(Math.max(0, side * (1 - ICON_TILE.glyphInsetRatio * 2)), ICON_TILE.maxGlyphPx);
  const inset = (side - glyphSide) / 2;
  return {
    tile,
    glyph: { x: tile.x + inset, y: tile.y + inset, width: glyphSide, height: glyphSide },
  };
}

/** Stroke width, in the glyph's own viewBox units, of a glyph drawn on a tile (see ICON_TILE.strokeReferencePx). */
export function iconTileGlyphStrokeWidth(viewBoxSize: number): number {
  return iconGlyphStrokeWidthForViewBox(ICON_TILE.strokeReferencePx, viewBoxSize);
}

/**
 * Stroke width, in glyph viewBox units, of a bare (glyph-style) icon whose box's
 * smaller side is `sizePx` — the constant rendered weight on every grid.
 */
export function iconBareGlyphStrokeWidth(sizePx: number, glyph: Pick<IconGlyphDefinition, "viewBoxSize"> | undefined): number {
  return iconGlyphStrokeWidthForViewBox(sizePx, glyph?.viewBoxSize ?? 18);
}

/** Whether a glyph's closed shapes can take an interior fill (SVG chord-closes open paths, so all-open line art never does). */
export function glyphHasClosedInterior(glyph: Pick<IconGlyphDefinition, "elements">): boolean {
  return glyph.elements.some(
    (element) => element.kind === "circle" || (element.kind === "path" && /[zZ]/.test(element.d)),
  );
}
