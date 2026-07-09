"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { TRAPEZOID_OUTLINE, trapezoidPoints } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Trapezoid (W5) — 4-point true-outline polygon (connection-cascade.ts's
 * trapezoidPoints, the same generator connector attachment uses) painted
 * behind the label; the button chrome stays fully transparent so only one
 * outline is visible.
 */
export const trapezoidShapeDef: ShapeDef = {
  type: "trapezoid",
  shape: "trapezoid",
  buttonBorder: "suppressed",
  outline: TRAPEZOID_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-trapezoid",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="trapezoid"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <polygon
          points={pointsAttribute(
            trapezoidPoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }),
          )}
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  /*
   * Moved from CanvasStage's grouped rule (trapezoid shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * manual-input/hexagon/document/or-junction/summing-junction — 17
   * selectors total). Paint declarations moved here; trapezoid carries no
   * additional per-shape follow-up rule in the legacy block.
   */
  css: `
        .interactive-canvas-object-trapezoid {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Trapezoid", keywords: ["trapezoid", "flowchart", "manual-operation"] },
};

export const trapezoidDef = shapeObjectDef(trapezoidShapeDef);
