"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Cylinder (Horizontal) (W5) — inline SVG silhouette (rounded-end body path
 * plus two open "side curve" strokes to read as a cylinder lying on its
 * side, CSS clip-path can't express it) painted behind the label/body
 * content; the button chrome stays fully transparent so only one outline is
 * visible. The original 100x100 silhouette proportions are projected into
 * object-local coordinates so the SVG stroke width remains in true canvas px.
 * Stroke width follows the object's resolved stroke width.
 */
export const cylinderHorizontalShapeDef: ShapeDef = {
  type: "cylinder-horizontal",
  shape: "cylinder-horizontal",
  buttonBorder: "suppressed",
  silhouette: {
    className: "interactive-canvas-object-cylinder-horizontal",
    silhouette: ({ object, colors, strokeWidth }) => {
      const { width, height } = object.geometry;
      const x = (value: number) => (width * value) / 100;
      const y = (value: number) => (height * value) / 100;
      const outerPath = [
        `M ${x(18)} ${y(5)}`,
        `H ${x(82)}`,
        `C ${x(92)} ${y(5)} ${x(98)} ${y(25)} ${x(98)} ${y(50)}`,
        `C ${x(98)} ${y(75)} ${x(92)} ${y(95)} ${x(82)} ${y(95)}`,
        `H ${x(18)}`,
        `C ${x(8)} ${y(95)} ${x(2)} ${y(75)} ${x(2)} ${y(50)}`,
        `C ${x(2)} ${y(25)} ${x(8)} ${y(5)} ${x(18)} ${y(5)}`,
        "Z",
      ].join(" ");
      const leftCurvePath = [
        `M ${x(18)} ${y(5)}`,
        `C ${x(28)} ${y(5)} ${x(34)} ${y(25)} ${x(34)} ${y(50)}`,
        `C ${x(34)} ${y(75)} ${x(28)} ${y(95)} ${x(18)} ${y(95)}`,
      ].join(" ");
      const rightCurvePath = [
        `M ${x(82)} ${y(5)}`,
        `C ${x(72)} ${y(5)} ${x(66)} ${y(25)} ${x(66)} ${y(50)}`,
        `C ${x(66)} ${y(75)} ${x(72)} ${y(95)} ${x(82)} ${y(95)}`,
      ].join(" ");

      return (
        <svg
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
          data-canvas-shape-silhouette="cylinder-horizontal"
        >
          <path
            d={outerPath}
            fill={colors.fill}
            stroke={colors.border}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <path d={leftCurvePath} fill="none" stroke={colors.border} strokeWidth={strokeWidth} />
          <path d={rightCurvePath} fill="none" stroke={colors.border} strokeWidth={strokeWidth} />
        </svg>
      );
    },
  },
  /*
   * Moved from CanvasStage's grouped rule (cylinder-horizontal shared its
   * selector group there with folder/document-stack). Paint declarations moved here. Unlike folder/document-stack, cylinder-horizontal has no
   * per-shape follow-up rule in the legacy block — group copy only.
   */
  css: `
        .interactive-canvas-object-cylinder-horizontal {
          border: none;
          border-radius: 0;
          background: transparent !important;
          box-shadow: none;
          overflow: visible;
        }
`,
  catalog: {
    label: "Cylinder (horizontal)",
    keywords: ["cylinder", "horizontal", "storage", "database"],
  },
};

export const cylinderHorizontalDef = shapeObjectDef(cylinderHorizontalShapeDef);
