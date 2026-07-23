"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { PLUS_OUTLINE, plusPoints } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Plus (W5, 12-point cross/plus polygon) — true-outline polygon (connection-
 * overlay.ts's plusPoints, the same generator connector attachment uses)
 * painted behind the label; the button trim stays fully transparent so
 * only one outline is visible. Legacy `hidesVisibleText` suppressed BOTH the
 * label span and the body span for plus (along with or-junction/summing-
 * junction) — `text: "none"` reproduces that exactly, since
 * base.tsx's shared ShapeObjectView gates both the label span
 * (`shape.text.kind === "label"`) and the body span
 * (`shape.text.kind !== "none"`) on the text-zone kind, so "none" drops both.
 */
export const plusShapeDef: ShapeDef = {
  type: "plus",
  shape: "plus",
  buttonBorder: "suppressed",
  outline: PLUS_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-plus",
    silhouette: ({ object, colors, strokeWidth }) => {
      const localBounds = { x: 0, y: 0, width: object.geometry.width, height: object.geometry.height };
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="plus"
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={pointsAttribute(plusPoints(localBounds))}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  text: "none",
  /*
   * Moved from CanvasStage's grouped rule (plus shares its selector group
   * there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/chevron/off-page-connector/
   * trapezoid/manual-input/hexagon/or-junction/summing-junction).
   * Paint declarations moved here; plus carries no additional per-shape
   * follow-up rule in the legacy block.
   */
  css: `
        .interactive-canvas-object-plus {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Plus", keywords: ["plus", "cross", "add", "flowchart"] },
};

export const plusDef = shapeObjectDef(plusShapeDef);
