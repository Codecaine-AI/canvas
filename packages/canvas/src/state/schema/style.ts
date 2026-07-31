"use client";

export type CanvasSectionStrokeStyle = "solid" | "dashed" | "none";

/**
 * Per-object style bag (P1 color cutover, OBJECT-DEF-OVERHAUL.md D10):
 * the legacy color fields — `tone`, `paletteToken`, explicit `fill`/`stroke`
 * hexes — are DELETED from the schema (hard migration, no legacy read path).
 * Color now lives on the object itself as `color?: CanvasColor`
 * (state/schema/objects.ts); only the render-shape selector and the stroke
 * width/style knobs remain here.
 */
export type CanvasObjectStyle = {
  shape?:
    | "rounded-rect"
    | "diamond"
    | "note"
    | "marker"
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    | "section"
    | "arrow-shape"
    | "predefined-process"
    // The universal shape core (operational-maps surface trim), one
    // same-named variant per type:
    | "ellipse"
    | "triangle"
    | "octagon"
    | "icon";
  /**
   * Stroke width in logical px. Overrides the universal FigJam shape stroke
   * (SHAPE_STROKE_WIDTH_PX = 4) applied to shape ink borders.
   */
  strokeWidth?: number;
  /** Section border style. Sections default to solid when omitted. */
  strokeStyle?: CanvasSectionStrokeStyle;
};
