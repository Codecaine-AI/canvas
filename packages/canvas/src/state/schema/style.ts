"use client";

import type { CanvasPaletteToken, InteractiveCanvasTone } from "./object-types";

export type CanvasSectionStrokeStyle = "solid" | "dashed" | "none";

export type CanvasObjectStyle = {
  tone?: InteractiveCanvasTone;
  shape?:
    | "rounded-rect"
    | "diamond"
    | "pill"
    | "note"
    | "marker"
    | "document"
    | "person"
    | "database"
    | "chat"
    // W2 — FigJam sections + V2 Flow shape vocabulary:
    | "section"
    | "arrow-shape"
    | "predefined-process"
    | "code-block"
    | "chip-icon"
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
  /** Semantic palette token (D16) — takes precedence over `tone` when set. */
  paletteToken?: CanvasPaletteToken;
  /**
   * Explicit fill color (W4) — any CSS color. Wins over the `paletteToken`/
   * `tone` theme-mix when set; the FigJam pastel PAIR palette
   * (theme/tokens.ts PASTEL_PAIRS) is the intended vocabulary.
   */
  fill?: string;
  /** Explicit border/stroke color (W4) — wins over the theme-mix border when set. */
  stroke?: string;
  /**
   * Stroke width in logical px. Only meaningful when `stroke` is set;
   * defaults to the FigJam universal shape stroke (SHAPE_STROKE_WIDTH_PX = 4).
   */
  strokeWidth?: number;
  /** Section border style. Sections default to solid when omitted. */
  strokeStyle?: CanvasSectionStrokeStyle;
};
