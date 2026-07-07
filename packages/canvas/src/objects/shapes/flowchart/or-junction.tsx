"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Or-junction (W5 — FigJam parity shape set) — a plain circle silhouette
 * with an inscribed "+" cross, endpoints on the ellipse outline (the two
 * cardinal midpoints). No visible text: `hidesVisibleText` in the legacy
 * branch suppressed BOTH the label and the body for this shape, so `text.kind`
 * is "none" here (base.tsx's shared view renders neither span for "none").
 */
export const orJunctionShapeDef: ShapeDef = {
  type: "or-junction",
  shape: "or-junction",
  outline: {
    className: "interactive-canvas-object-or-junction",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="or-junction"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill={colors.fill} stroke={colors.border} strokeWidth={strokeWidth} />
        {/* FigJam or-junction carries an inscribed "+" — endpoints sit on the
            ellipse outline (cardinals for the cross). */}
        <line x1="50%" y1="0%" x2="50%" y2="100%" stroke={colors.border} strokeWidth={strokeWidth} />
        <line x1="0%" y1="50%" x2="100%" y2="50%" stroke={colors.border} strokeWidth={strokeWidth} />
      </svg>
    ),
  },
  text: { kind: "none" },
  defaultSize: { width: 100, height: 100 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (or-junction shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/manual-input/hexagon/document/summing-junction — 17 selectors
   * total). Declarations are verbatim; or-junction carries no additional
   * per-shape follow-up rule in the legacy block.
   */
  css: `
        .interactive-canvas-object-or-junction {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Or Junction", keywords: ["or", "junction", "flow", "gateway"] },
};

export const orJunctionDef = shapeObjectDef(orJunctionShapeDef);
