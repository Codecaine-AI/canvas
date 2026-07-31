"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { OCTAGON_OUTLINE, octagonPoints } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Octagon (Basic) — a single SVG polygon tracing the true 8-point outline
 * (flat-top orientation, connection-cascade.ts octagonPoints) so an explicit
 * stroke/fill traces the actual silhouette, not the bounding box.
 */
export const octagonShapeDef: ShapeDef = {
  type: "octagon",
  shape: "octagon",
  buttonBorder: "suppressed",
  outline: OCTAGON_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-octagon",
    silhouette: ({ object, colors, strokeWidth }) => {
      const points = pointsAttribute(
        octagonPoints({ x: 0, y: 0, width: object.geometry.width, height: object.geometry.height }),
      );
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="octagon"
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
   * Moved from CanvasStage's grouped rule (octagon shares this
   * transparent-button treatment with triangle). Paint declarations moved
   * here; octagon carries no additional per-shape follow-up rule.
   */
  css: `
        .interactive-canvas-object-octagon {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Octagon", keywords: ["octagon", "polygon", "eight-sided"] },
};

export const octagonDef = shapeObjectDef(octagonShapeDef);
