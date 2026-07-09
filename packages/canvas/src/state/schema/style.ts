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
    | "pill"
    | "note"
    | "marker"
    | "document"
    | "database"
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    | "section"
    | "arrow-shape"
    | "predefined-process"
    // W5 — FigJam parity shape set (Wave A), one same-named variant per new type:
    | "ellipse"
    | "triangle"
    | "parallelogram"
    | "pentagon"
    | "octagon"
    | "star"
    | "plus"
    | "chevron"
    | "folder"
    | "document-stack"
    | "off-page-connector"
    | "trapezoid"
    | "manual-input"
    | "hexagon"
    | "internal-storage"
    | "or-junction"
    | "summing-junction"
    | "cylinder-horizontal"
    | "page-corner"
    | "icon";
  /**
   * Stroke width in logical px. Overrides the universal FigJam shape stroke
   * (SHAPE_STROKE_WIDTH_PX = 4) applied to shape ink borders.
   */
  strokeWidth?: number;
  /** Section border style. Sections default to solid when omitted. */
  strokeStyle?: CanvasSectionStrokeStyle;
};
