"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { OFF_PAGE_CONNECTOR_OUTLINE, offPageConnectorPoints } from "../../geometry";
import { OFF_PAGE_CONNECTOR_GEOMETRY } from "../../shape-geometry-constants";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

export { OFF_PAGE_CONNECTOR_GEOMETRY };

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Off-page connector (W5) — downward-pointing pentagon true-outline polygon
 * (connection-overlay.ts's offPageConnectorPoints, the same generator
 * connector attachment uses, a.k.a. Figma's `SHIELD` shapeType) painted
 * behind the label; the button chrome stays fully transparent so only one
 * outline is visible..
 */
export const offPageConnectorShapeDef: ShapeDef = {
  type: "off-page-connector",
  shape: "off-page-connector",
  buttonBorder: "suppressed",
  outline: OFF_PAGE_CONNECTOR_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-off-page-connector",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="off-page-connector"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <polygon
          points={pointsAttribute(
            offPageConnectorPoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }),
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
   * Moved from CanvasStage's grouped rule (off-page-connector shares its
   * selector group there with folder/document-stack/cylinder-horizontal/
   * triangle/parallelogram/pentagon/octagon/star/plus/chevron/trapezoid/
   * manual-input/hexagon/document/or-junction/summing-junction — 17
   * selectors total). Paint declarations moved here.
   */
  css: `
        .interactive-canvas-object-off-page-connector {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Off-page connector", keywords: ["off-page", "connector", "flowchart", "shield"] },
};

export const offPageConnectorDef = shapeObjectDef(offPageConnectorShapeDef);
