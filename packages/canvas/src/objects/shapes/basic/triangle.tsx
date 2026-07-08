"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { TRIANGLE_OUTLINE, trianglePoints } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Triangle (W5) — a single SVG polygon tracing the isosceles-triangle
 * silhouette (routing/connection-overlay.ts trianglePoints, the same true
 * outline connector attachment uses), painted behind the label/body content;
 * the button chrome stays fully transparent so only one outline is visible.
 * Direction: "down" flips apex-to-base vertically (legacy `triangleDirection`);
 * anything else (including absent `direction`) is "up".
 */
export const triangleShapeDef: ShapeDef = {
  type: "triangle",
  shape: "triangle",
  buttonBorder: "suppressed",
  outline: TRIANGLE_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-triangle",
    silhouette: ({ object, colors, strokeWidth }) => {
      const direction: "up" | "down" = object.direction === "down" ? "down" : "up";
      const localBounds = { x: 0, y: 0, width: object.geometry.width, height: object.geometry.height };
      const points = pointsAttribute(trianglePoints(localBounds, direction));
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="triangle"
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
   * Moved from CanvasStage's grouped rule (triangle shares its selector group
   * there with folder/document-stack/cylinder-horizontal/parallelogram/
   * pentagon/octagon/star/plus/chevron/off-page-connector/trapezoid/
   * manual-input/hexagon/or-junction/summing-junction).
   */
  css: `
        .interactive-canvas-object-triangle {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Triangle", keywords: ["triangle", "shape"] },
};

export const triangleDef = shapeObjectDef(triangleShapeDef);
