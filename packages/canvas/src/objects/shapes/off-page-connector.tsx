"use client";

import type { CanvasPoint } from "../../state/geometry";
import { offPageConnectorPoints } from "../../routing/connection-overlay";
import { OFF_PAGE_CONNECTOR_GEOMETRY } from "../../tokens/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Off-page connector (W5) — downward-pointing pentagon true-outline polygon
 * (connection-overlay.ts's offPageConnectorPoints, the same generator
 * connector attachment uses, a.k.a. Figma's `SHIELD` shapeType) painted
 * behind the label; the button chrome stays fully transparent so only one
 * outline is visible. The label sits above the pointed shoulder via a
 * bottom padding derived from OFF_PAGE_CONNECTOR_GEOMETRY's shoulderRatio
 * (legacy CanvasStage rule, moved here verbatim).
 */
export const offPageConnectorShapeDef: ShapeDef = {
  type: "off-page-connector",
  shape: "off-page-connector",
  outline: {
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
  text: { kind: "label" },
  defaultSize: { width: 120, height: 100 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (off-page-connector shares its
   * selector group there with folder/document-stack/cylinder-horizontal/
   * triangle/parallelogram/pentagon/octagon/star/plus/chevron/trapezoid/
   * manual-input/hexagon/document/or-junction/summing-junction — 17
   * selectors total). Declarations are verbatim; off-page-connector also
   * carries its own follow-up padding-bottom rule in the legacy block
   * (after the group), preserved here in the same source order.
   */
  css: `
        .interactive-canvas-object-off-page-connector {
          align-items: center;
          justify-content: center;
          text-align: center;
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
        .interactive-canvas-object-off-page-connector {
          padding-bottom: ${(1 - OFF_PAGE_CONNECTOR_GEOMETRY.shoulderRatio) * 70}%;
        }
`,
  catalog: { label: "Off-page Connector", keywords: ["off-page", "connector", "flowchart", "shield"] },
};

export const offPageConnectorDef = shapeObjectDef(offPageConnectorShapeDef);
