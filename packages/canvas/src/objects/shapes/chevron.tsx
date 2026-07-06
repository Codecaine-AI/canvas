"use client";

import type { CanvasPoint } from "../../model/geometry";
import { chevronPoints } from "../../routing/connection-overlay";
import { CHEVRON_GEOMETRY } from "../../tokens/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Chevron (W5, "fast-forward"-style pointer, distinct from arrow-shape's
 * thinner 7-point sliver) — 6-point true-outline polygon (connection-
 * overlay.ts's chevronPoints, the same generator connector attachment uses)
 * painted behind the label; the button chrome stays fully transparent so
 * only one outline is visible. The label is inset toward the pointed head
 * side by the notch width so it centers within the body, not the full bbox
 * (legacy CanvasStage labelStyle chevron leg, moved here verbatim).
 */
export const chevronShapeDef: ShapeDef = {
  type: "chevron",
  shape: "chevron",
  outline: {
    className: "interactive-canvas-object-chevron",
    silhouette: ({ object, colors, strokeWidth }) => {
      const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
      const localBounds = { x: 0, y: 0, width: object.geometry.width, height: object.geometry.height };
      return (
        <svg
          aria-hidden="true"
          className="interactive-canvas-true-outline-silhouette"
          data-canvas-shape-silhouette="chevron"
          viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
        >
          <polygon
            points={pointsAttribute(chevronPoints(localBounds, direction))}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </svg>
      );
    },
  },
  text: {
    kind: "label",
    labelStyle: (object) => {
      const direction: "left" | "right" = object.direction === "left" ? "left" : "right";
      return {
        [direction === "left" ? "marginLeft" : "marginRight"]: `${CHEVRON_GEOMETRY.notchWidthRatio * 100}%`,
      };
    },
  },
  defaultSize: { width: 160, height: 120 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (chevron shares its selector group
   * there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/off-page-connector/trapezoid/
   * manual-input/hexagon/or-junction/summing-junction). Declarations are
   * verbatim; chevron carries no additional per-shape follow-up rule in the
   * legacy block.
   */
  css: `
        .interactive-canvas-object-chevron {
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
  catalog: { label: "Chevron", keywords: ["chevron", "arrow", "pointer", "flowchart"] },
};

export const chevronDef = shapeObjectDef(chevronShapeDef);
