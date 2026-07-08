"use client";

import { DIAMOND_OUTLINE } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Decision (rendered as a diamond) — a pure CSS `clip-path` outline, no SVG
 * silhouette: the base button chrome is clipped into the diamond shape
 * directly. Center text uses the shared analytic inscribed rect.
 */
export const decisionShapeDef: ShapeDef = {
  type: "decision",
  shape: "diamond",
  outline: DIAMOND_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-diamond",
  },
  css: `
        .interactive-canvas-object-diamond {
          clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
        }
`,
  catalog: { label: "Decision", keywords: ["decision", "diamond", "condition", "branch"] },
};

export const decisionDef = shapeObjectDef(decisionShapeDef);
