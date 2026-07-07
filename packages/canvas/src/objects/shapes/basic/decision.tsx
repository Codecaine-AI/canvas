"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Decision (rendered as a diamond) — a pure CSS `clip-path` outline, no SVG
 * silhouette: the base button chrome is clipped into the diamond shape
 * directly, so text stays centered inside it via the extra padding below.
 */
export const decisionShapeDef: ShapeDef = {
  type: "decision",
  shape: "diamond",
  outline: {
    className: "interactive-canvas-object-diamond",
  },
  text: { kind: "label" },
  defaultSize: { width: 160, height: 112 },
  defaultTone: "decision",
  css: `
        .interactive-canvas-object-diamond {
          align-items: center;
          text-align: center;
          clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
          padding: 18px 28px;
        }
`,
  catalog: { label: "Decision", keywords: ["decision", "diamond", "condition", "branch"] },
};

export const decisionDef = shapeObjectDef(decisionShapeDef);
