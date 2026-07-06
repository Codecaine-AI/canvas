"use client";

import type { CanvasPoint } from "../../model/geometry";
import { starPoints } from "../../routing/connection-overlay";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Star (W5) — 5-point star true-outline polygon (connection-overlay.ts's
 * starPoints, the same generator connector attachment uses) painted behind
 * the label; the button chrome stays fully transparent so only one outline
 * is visible. The label also carries a smaller font-size than the base
 * `.interactive-canvas-object-label` rule so it fits inside the star's
 * narrow inscribed area (legacy CanvasStage rule, moved here verbatim).
 */
export const starShapeDef: ShapeDef = {
  type: "star",
  shape: "star",
  outline: {
    className: "interactive-canvas-object-star",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="star"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <polygon
          points={pointsAttribute(
            starPoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }),
          )}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  text: { kind: "label" },
  defaultSize: { width: 140, height: 140 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (star shares its selector group
   * there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/plus/chevron/off-page-connector/
   * trapezoid/manual-input/hexagon/document/or-junction/summing-junction —
   * 17 selectors total). Declarations are verbatim; star also carries its
   * own follow-up label-font-size rule in the legacy block (after the
   * group), preserved here in the same source order.
   */
  css: `
        .interactive-canvas-object-star {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
        .interactive-canvas-object-star .interactive-canvas-object-label {
          font-size: 12px;
        }
`,
  catalog: { label: "Star", keywords: ["star", "favorite", "rating"] },
};

export const starDef = shapeObjectDef(starShapeDef);
