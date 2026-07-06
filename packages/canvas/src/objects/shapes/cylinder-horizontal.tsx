"use client";

import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Cylinder (Horizontal) (W5) — inline SVG silhouette (rounded-end body path
 * plus two open "side curve" strokes to read as a cylinder lying on its
 * side, CSS clip-path can't express it) painted behind the label/body
 * content; the button chrome stays fully transparent so only one outline is
 * visible. Moved verbatim from render/ShapeSilhouette.tsx's
 * cylinder-horizontal branch (its final W5 holdout / no-condition fallback).
 * Stroke width follows the object's resolved stroke width (see folder.tsx's
 * note — the shared shape view always resolves a concrete value, so no
 * `?? 2` fallback is needed here).
 */
export const cylinderHorizontalShapeDef: ShapeDef = {
  type: "cylinder-horizontal",
  shape: "cylinder-horizontal",
  outline: {
    className: "interactive-canvas-object-cylinder-horizontal",
    silhouette: ({ colors, strokeWidth }) => (
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
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        data-canvas-shape-silhouette="cylinder-horizontal"
      >
        <path
          d="M 18 5 H 82 C 92 5 98 25 98 50 C 98 75 92 95 82 95 H 18 C 8 95 2 75 2 50 C 2 25 8 5 18 5 Z"
          fill={colors.fill}
          stroke={colors.border}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
        <path
          d="M 18 5 C 28 5 34 25 34 50 C 34 75 28 95 18 95"
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
        />
        <path
          d="M 82 5 C 72 5 66 25 66 50 C 66 75 72 95 82 95"
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
        />
      </svg>
    ),
  },
  text: { kind: "label" },
  defaultSize: { width: 150, height: 100 },
  defaultTone: "neutral",
  /*
   * Moved from CanvasStage's grouped rule (cylinder-horizontal shared its
   * selector group there with folder/document-stack). Declarations are
   * verbatim. Unlike folder/document-stack, cylinder-horizontal has no
   * per-shape follow-up rule in the legacy block — group copy only.
   */
  css: `
        .interactive-canvas-object-cylinder-horizontal {
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
  catalog: {
    label: "Cylinder (Horizontal)",
    keywords: ["cylinder", "horizontal", "storage", "database"],
  },
};

export const cylinderHorizontalDef = shapeObjectDef(cylinderHorizontalShapeDef);
