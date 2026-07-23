"use client";

import type { CanvasPoint } from "../../../state/geometry";
import { CHEVRON_OUTLINE, chevronPoints } from "../../geometry";
import { rectTextSlot, type LocalRect } from "../../text-slots";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";
import type { InteractiveCanvasObject } from "../../../state/schema";

/**
 * Chevron silhouette geometry (moved from theme/tokens.ts in the theme
 * dispersal). Notch ratio mirrors connection-cascade.ts's true-outline
 * chevron math.
 */
export const CHEVRON_GEOMETRY = {
  notchWidthRatio: 0.25,
} as const;

function pointsAttribute(points: CanvasPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

/**
 * Object-local text rect: a symmetric center band clear of the back notch and
 * pointed head. The safe band is direction-independent.
 */
export function chevronTextRect(object: InteractiveCanvasObject): LocalRect {
  const x1 = object.geometry.width * 0.25 + 6;
  const x2 = object.geometry.width * 0.75 - 6;
  return {
    x: x1,
    y: 8,
    width: Math.max(0, x2 - x1),
    height: Math.max(0, object.geometry.height - 16),
  };
}

/**
 * Chevron (W5, "fast-forward"-style pointer, distinct from arrow-shape's
 * thinner 7-point sliver) — 6-point true-outline polygon (connection-
 * overlay.ts's chevronPoints, the same generator connector attachment uses)
 * painted behind the text; the button trim stays fully transparent so
 * only one outline is visible. The text slot is a symmetric safe band clear
 * of the notch/head extremes (chevronTextRect — the rect-function slot that
 * replaced the legacy labelStyle margin).
 */
export const chevronShapeDef: ShapeDef = {
  type: "chevron",
  shape: "chevron",
  buttonBorder: "suppressed",
  outline: CHEVRON_OUTLINE,
  silhouette: {
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
  // Rect-function slot: center the text within the chevron's symmetric safe band.
  text: rectTextSlot(chevronTextRect),
  /*
   * Moved from CanvasStage's grouped rule (chevron shares its selector group
   * there with folder/document-stack/cylinder-horizontal/triangle/
   * parallelogram/pentagon/octagon/star/plus/off-page-connector/trapezoid/
   * manual-input/hexagon/or-junction/summing-junction). Paint declarations
   * moved here.
   */
  css: `
        .interactive-canvas-object-chevron {
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
