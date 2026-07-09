"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { HEXAGON_OUTLINE, hexagonPoints } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Hexagon (Flowchart "preparation" symbol) — a single SVG polygon tracing
 * the true 6-point outline (flat-top orientation, connection-cascade.ts
 * hexagonPoints) so an explicit stroke/fill traces the actual silhouette,
 * not the bounding box.
 */
export const hexagonShapeDef: ShapeDef = {
  type: "hexagon",
  shape: "hexagon",
  buttonBorder: "suppressed",
  outline: HEXAGON_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-hexagon",
    silhouette: ({ object, colors, strokeWidth }) => {
      const points = pointsAttribute(
        hexagonPoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }),
      );
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="hexagon"
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
   * Moved from CanvasStage's grouped rule (hexagon shares its selector group
   * there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/manual-input/or-junction/summing-junction — 17 selectors
   * total). Paint declarations moved here; hexagon carries no additional
   * per-shape follow-up rule in the legacy block (unlike folder/
   * document-stack/triangle/off-page-connector/manual-input/star, which do).
   */
  css: `
        .interactive-canvas-object-hexagon {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Hexagon", keywords: ["hexagon", "polygon", "six-sided", "preparation"] },
};

export const hexagonDef = shapeObjectDef(hexagonShapeDef);
