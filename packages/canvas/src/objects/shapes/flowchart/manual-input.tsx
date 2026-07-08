"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { MANUAL_INPUT_OUTLINE, manualInputPoints } from "../../geometry";
import { MANUAL_INPUT_GEOMETRY } from "../../shape-geometry-constants";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

export { MANUAL_INPUT_GEOMETRY };

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Manual input (W5) — slanted-top-edge true-outline polygon (connection-
 * overlay.ts's manualInputPoints, the same generator connector attachment
 * uses) painted behind the label; the button chrome stays fully transparent
 * so only one outline is visible..
 */
export const manualInputShapeDef: ShapeDef = {
  type: "manual-input",
  shape: "manual-input",
  buttonBorder: "suppressed",
  outline: MANUAL_INPUT_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-manual-input",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="manual-input"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <polygon
          points={pointsAttribute(
            manualInputPoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }),
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
   * Moved from CanvasStage's grouped rule (manual-input shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/hexagon/document/or-junction/summing-junction — 17 selectors
   * total). Paint declarations moved here.
   */
  css: `
        .interactive-canvas-object-manual-input {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Manual input", keywords: ["manual-input", "flowchart", "slanted"] },
};

export const manualInputDef = shapeObjectDef(manualInputShapeDef);
