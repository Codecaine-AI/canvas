"use client";

import type { CanvasPoint } from "../../state/geometry";
import { trianglePoints } from "../../routing/connection-overlay";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

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
  outline: {
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
  text: { kind: "label" },
  defaultSize: { width: 140, height: 120 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (triangle shares its selector group
   * there with folder/document-stack/cylinder-horizontal/parallelogram/
   * pentagon/octagon/star/plus/chevron/off-page-connector/trapezoid/
   * manual-input/hexagon/or-junction/summing-junction — 17 selectors total),
   * PLUS triangle's own per-shape follow-up rule. Both rules target this same
   * selector at equal specificity; the follow-up (justify-content: flex-end)
   * must stay declared AFTER the group-copy (justify-content: center) so the
   * cascade keeps flex-end winning, exactly as legacy source order did.
   */
  css: `
        .interactive-canvas-object-triangle {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
        .interactive-canvas-object-triangle {
          justify-content: flex-end;
          padding: 18% 18% 10%;
        }
`,
  catalog: { label: "Triangle", keywords: ["triangle", "shape"] },
};

export const triangleDef = shapeObjectDef(triangleShapeDef);
