"use client";

import type { CanvasPoint } from "../../state/geometry";
import { manualInputPoints } from "../../routing/connection-overlay";
import { MANUAL_INPUT_GEOMETRY } from "../../tokens/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Manual input (W5) — slanted-top-edge true-outline polygon (connection-
 * overlay.ts's manualInputPoints, the same generator connector attachment
 * uses) painted behind the label; the button chrome stays fully transparent
 * so only one outline is visible. The label sits below the slanted top edge
 * via a top padding derived from MANUAL_INPUT_GEOMETRY's dropRatio (legacy
 * CanvasStage rule, moved here verbatim).
 */
export const manualInputShapeDef: ShapeDef = {
  type: "manual-input",
  shape: "manual-input",
  outline: {
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
  text: { kind: "label" },
  defaultSize: { width: 150, height: 100 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (manual-input shares its selector
   * group there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/hexagon/document/or-junction/summing-junction — 17 selectors
   * total). Declarations are verbatim; manual-input also carries its own
   * follow-up padding-top rule in the legacy block (after the group),
   * preserved here in the same source order.
   */
  css: `
        .interactive-canvas-object-manual-input {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
        .interactive-canvas-object-manual-input {
          padding-top: ${MANUAL_INPUT_GEOMETRY.dropRatio * 80}%;
        }
`,
  catalog: { label: "Manual Input", keywords: ["manual-input", "flowchart", "slanted"] },
};

export const manualInputDef = shapeObjectDef(manualInputShapeDef);
