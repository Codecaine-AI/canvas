"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Annotation marker — a small round pin/dot, pure CSS (no silhouette): the
 * base `interactive-canvas-object` chrome (border + background) plus a
 * pill-shaped border-radius override and centered, padding-free content.
 * Placement default (220, 220) diverges from the shape-family standard
 * (160, 160) — see defaultGeometryFor in state/actions/defaults.ts.
 */
export const annotationMarkerShapeDef: ShapeDef = {
  type: "annotation-marker",
  shape: "marker",
  outline: { className: "interactive-canvas-object-marker" },
  text: { kind: "label" },
  defaultSize: { width: 40, height: 40 },
  defaultPosition: { x: 220, y: 220 },
  defaultTone: "annotation",
  css: `
        .interactive-canvas-object-marker {
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 0;
        }
`,
  catalog: { label: "Annotation", keywords: ["annotation", "marker", "pin", "dot"] },
};

export const annotationMarkerDef = shapeObjectDef(annotationMarkerShapeDef);
