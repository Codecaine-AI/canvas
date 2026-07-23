"use client";

import { ELLIPSE_OUTLINE } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Ellipse (W5, Wave A) — a true-outline SVG silhouette (an explicit stroke
 * traces the actual ellipse, not the bounding box) behind the slot text;
 * the button trim stays fully transparent so only one outline is visible.
 */
export const ellipseShapeDef: ShapeDef = {
  type: "ellipse",
  shape: "ellipse",
  buttonBorder: "suppressed",
  outline: ELLIPSE_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-ellipse",
    silhouette: ({ object, colors, strokeWidth }) => (
      <svg
        aria-hidden="true"
        className="interactive-canvas-true-outline-silhouette"
        data-canvas-shape-silhouette="ellipse"
        viewBox={`0 0 ${object.geometry.width} ${object.geometry.height}`}
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        <ellipse
          cx="50%"
          cy="50%"
          rx="50%"
          ry="50%"
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={strokeWidth}
        />
      </svg>
    ),
  },
  css: `
        .interactive-canvas-object-ellipse {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: { label: "Ellipse", keywords: ["ellipse", "oval", "circle"] },
};

export const ellipseDef = shapeObjectDef(ellipseShapeDef);
