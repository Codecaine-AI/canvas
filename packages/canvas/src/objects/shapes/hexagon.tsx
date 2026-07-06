"use client";

import type { CanvasPoint } from "../../model/geometry";
import { hexagonPoints } from "../../routing/connection-overlay";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Hexagon (Flowchart "preparation" symbol) — a single SVG polygon tracing
 * the true 6-point outline (flat-top orientation, connection-overlay.ts
 * hexagonPoints) so an explicit stroke/fill traces the actual silhouette,
 * not the bounding box.
 */
export const hexagonShapeDef: ShapeDef = {
  type: "hexagon",
  shape: "hexagon",
  outline: {
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
  text: { kind: "label" },
  defaultSize: { width: 150, height: 100 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (hexagon shares its selector group
   * there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/chevron/off-page-connector/
   * trapezoid/manual-input/or-junction/summing-junction — 17 selectors
   * total). Declarations are verbatim; hexagon carries no additional
   * per-shape follow-up rule in the legacy block (unlike folder/
   * document-stack/triangle/off-page-connector/manual-input/star, which do).
   */
  css: `
        .interactive-canvas-object-hexagon {
          align-items: center;
          justify-content: center;
          text-align: center;
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
