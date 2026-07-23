"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Annotation marker — a small round pin/dot, pure CSS (no silhouette): the
 * base `interactive-canvas-object` trim (border + background) plus a
 * pill-shaped border-radius override and slot text.
 * Placement default (220, 220) diverges from the shape-family standard
 * (160, 160) — see OBJECT_TYPE_DEFAULTS in state/schema/object-defaults.ts.
 */
export const annotationMarkerShapeDef: ShapeDef = {
  type: "annotation-marker",
  shape: "marker",
  silhouette: { className: "interactive-canvas-object-marker" },
  css: `
        .interactive-canvas-object-marker {
          border-radius: 999px;
          padding: 0;
        }
`,
  catalog: { label: "Annotation", keywords: ["annotation", "marker", "pin", "dot"] },
};

export const annotationMarkerDef = shapeObjectDef(annotationMarkerShapeDef);
