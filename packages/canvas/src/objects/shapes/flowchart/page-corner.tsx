"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Page corner — a pure CSS `clip-path` outline (a rect with the top-right
 * corner folded down), no SVG silhouette: the base button chrome is clipped
 * directly, matching the legacy `.interactive-canvas-object-page-corner`
 * rule.
 */
export const pageCornerShapeDef: ShapeDef = {
  type: "page-corner",
  shape: "page-corner",
  silhouette: {
    className: "interactive-canvas-object-page-corner",
  },
  css: `
        .interactive-canvas-object-page-corner {
          clip-path: polygon(0 0, 76% 0, 100% 24%, 100% 100%, 0 100%);
          border-radius: 2px 8px 8px 8px;
        }
`,
  catalog: { label: "Page corner", keywords: ["page-corner", "page corner"] },
};

export const pageCornerDef = shapeObjectDef(pageCornerShapeDef);
