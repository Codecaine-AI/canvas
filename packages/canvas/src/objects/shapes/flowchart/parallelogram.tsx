"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { PARALLELOGRAM_OUTLINE, parallelogramPoints } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Parallelogram (W5) — a single SVG polygon tracing the skewed-quadrilateral
 * silhouette (connectors/connection-cascade.ts parallelogramPoints, the same
 * true outline connector attachment uses), painted behind the label/body
 * content; the button trim stays fully transparent so only one outline is
 * visible. Direction: "left" mirrors the skew horizontally (legacy
 * `horizontalDirection`); anything else (including absent `direction`) is
 * "right".
 */
export const parallelogramShapeDef: ShapeDef = {
  type: "parallelogram",
  shape: "parallelogram",
  buttonBorder: "suppressed",
  outline: PARALLELOGRAM_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-parallelogram",
    silhouette: ({ object, colors, strokeWidth }) => {
      const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
      const localBounds = { x: 0, y: 0, width: object.geometry.width, height: object.geometry.height };
      const points = pointsAttribute(parallelogramPoints(localBounds, direction));
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="parallelogram"
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={points}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  /*
   * Moved from CanvasStage's grouped rule (parallelogram shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * pentagon/octagon/star/plus/chevron/off-page-connector/trapezoid/
   * manual-input/hexagon/or-junction/summing-junction — 17 selectors total).
   * Paint declarations moved here; parallelogram itself carries no additional
   * per-shape follow-up rule in the legacy block (unlike triangle/folder/
   * document-stack).
   */
  css: `
        .interactive-canvas-object-parallelogram {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Parallelogram", keywords: ["parallelogram", "shape"] },
};

export const parallelogramDef = shapeObjectDef(parallelogramShapeDef);
