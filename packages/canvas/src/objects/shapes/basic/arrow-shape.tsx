"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { ARROW_SHAPE_OUTLINE, ARROW_SHAPE_GEOMETRY, arrowShapePoints } from "../../geometry";
import { CENTER_TEXT_INSET_PX, rectTextSlot, type LocalRect } from "../../text-slots";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";
import type { InteractiveCanvasObject } from "../../../state/schema";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Object-local text rect: horizontally keeps the legacy tail-side body band
 * that excludes the chevron head; vertically stays inside the 0.60H body bar
 * with a 4px guard on each edge.
 */
export function arrowShapeTextRect(object: InteractiveCanvasObject): LocalRect {
  const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
  const contentWidth = Math.max(0, object.geometry.width - CENTER_TEXT_INSET_PX.x * 2);
  const bodyWidth = contentWidth * (1 - ARROW_SHAPE_GEOMETRY.headWidthRatio);
  const bodyInset = (object.geometry.height * (1 - ARROW_SHAPE_GEOMETRY.bodyHeightRatio)) / 2;
  return {
    x:
      direction === "left"
        ? CENTER_TEXT_INSET_PX.x + (contentWidth - bodyWidth)
        : CENTER_TEXT_INSET_PX.x,
    y: bodyInset + 4,
    width: bodyWidth,
    height: Math.max(0, object.geometry.height * ARROW_SHAPE_GEOMETRY.bodyHeightRatio - 8),
  };
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
  buttonBorder: "suppressed",
  outline: ARROW_SHAPE_OUTLINE,
  silhouette: {
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
  // Rect-function slot: center the text within the arrow BODY (the head side
  // carries no text in FigJam), not the full bounding box — replaces the old
  // labelStyle margin hack with the same resulting center.
  text: rectTextSlot(arrowShapeTextRect),
  css: `
        /* W2/W4 — arrow-shape: the SVG silhouette (interactive-canvas-arrow-
           shape-silhouette) paints the full 7-point chevron (fill + stroke),
           so the button chrome stays fully transparent — one outline only. */
        .interactive-canvas-object-arrow-shape {
          border: none;
          border-radius: ${ARROW_SHAPE_GEOMETRY.bodyCornerRadiusPx}px;
          background: transparent !important;
          overflow: visible;
        }
        .interactive-canvas-arrow-shape-silhouette {
          z-index: 0;
        }
`,
  catalog: { label: "Arrow", keywords: ["arrow", "chevron", "arrow-shape"] },
};

export const arrowShapeDef = shapeObjectDef(arrowShapeShapeDef);
