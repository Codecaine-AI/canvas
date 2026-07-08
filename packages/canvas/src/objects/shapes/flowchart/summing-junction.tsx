"use client";

import { JUNCTION_OUTLINE } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Summing-junction (W5 — FigJam parity shape set) — a plain circle
 * silhouette with an inscribed "x", endpoints on the ellipse outline (the
 * 45deg parametric points, cos45 ~= 0.3536). No visible text:
 * `hidesVisibleText` in the legacy branch suppressed BOTH the label and the
 * body for this shape, so `text.kind` is "none" here (base.tsx's shared view
 * renders neither span for "none").
 */
export const summingJunctionShapeDef: ShapeDef = {
  type: "summing-junction",
  shape: "summing-junction",
  buttonBorder: "suppressed",
  outline: JUNCTION_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-summing-junction",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="summing-junction"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={colors.fill} stroke={colors.border} strokeWidth={strokeWidth} />
        {/* FigJam summing-junction carries an inscribed "x" — endpoints sit on
            the ellipse outline (the 45deg parametric points, cos45 ~= 0.3536, for the X). */}
        <line x1="14.64%" y1="14.64%" x2="85.36%" y2="85.36%" stroke={colors.border} strokeWidth={strokeWidth} />
        <line x1="14.64%" y1="85.36%" x2="85.36%" y2="14.64%" stroke={colors.border} strokeWidth={strokeWidth} />
      </svg>
    ),
  },
  text: "none",
  /*
   * Moved from CanvasStage's grouped rule (summing-junction shares its
   * selector group there with folder/document-stack/cylinder-horizontal/
   * triangle/parallelogram/pentagon/octagon/star/plus/chevron/off-page-
   * connector/trapezoid/manual-input/hexagon/document/or-junction — 17
   * selectors total). Paint declarations moved here; summing-junction carries no
   * additional per-shape follow-up rule in the legacy block.
   */
  css: `
        .interactive-canvas-object-summing-junction {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Summing junction", keywords: ["summing", "junction", "flow", "gateway"] },
};

export const summingJunctionDef = shapeObjectDef(summingJunctionShapeDef);
