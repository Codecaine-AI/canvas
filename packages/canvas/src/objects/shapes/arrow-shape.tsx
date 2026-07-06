"use client";

import type { CanvasPoint } from "../../model/geometry";
import { arrowShapePoints } from "../../routing/connection-overlay";
import { ARROW_SHAPE_GEOMETRY } from "../../render/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Arrow-shape (W2/W4, fat chevron) — a single SVG polygon tracing the full
 * 7-point silhouette (body + head + notch) — the same outline connector
 * attachment uses (connection-overlay.ts arrowShapePoints) — so an explicit
 * stroke traces the whole chevron, not just a body rect.
 */
export const arrowShapeShapeDef: ShapeDef = {
  type: "arrow-shape",
  shape: "arrow-shape",
  outline: {
    className: "interactive-canvas-object-arrow-shape",
    silhouette: ({ object, colors, strokeWidth }) => {
      const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
      const points = pointsAttribute(
        arrowShapePoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }, direction),
      );
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-arrow-shape-silhouette"
          data-canvas-arrow-direction={direction}
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
  text: {
    kind: "label",
    labelStyle: (object) => {
      const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
      // Center the label within the chevron BODY (the head side carries no
      // text in FigJam), not the full bounding box.
      return {
        [direction === "left" ? "marginLeft" : "marginRight"]: `${ARROW_SHAPE_GEOMETRY.headWidthRatio * 100}%`,
      };
    },
  },
  defaultSize: { width: 361, height: 100 },
  defaultTone: "process",
  css: `
        /* W2/W4 — arrow-shape: the SVG silhouette (interactive-canvas-arrow-
           shape-silhouette) paints the full 7-point chevron (fill + stroke),
           so the button chrome stays fully transparent — one outline only. */
        .interactive-canvas-object-arrow-shape {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: ${ARROW_SHAPE_GEOMETRY.bodyCornerRadiusPx}px;
          background: transparent !important;
          overflow: visible;
        }
        .interactive-canvas-arrow-shape-silhouette {
          z-index: 0;
        }
        .interactive-canvas-object-arrow-shape .interactive-canvas-object-label {
          position: relative;
          z-index: 1;
        }
`,
  catalog: { label: "Arrow", keywords: ["arrow", "chevron", "arrow-shape"] },
};

export const arrowShapeDef = shapeObjectDef(arrowShapeShapeDef);
