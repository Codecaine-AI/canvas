"use client";

import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Pill (W2) — a true stadium shape expressed purely in CSS (border-radius:
 * 999px against the object's own height/width, no SVG silhouette needed):
 * the base button chrome IS the outline, so this def only adds the extra
 * className and its one CSS rule.
 */
export const pillShapeDef: ShapeDef = {
  type: "pill",
  shape: "pill",
  outline: {
    className: "interactive-canvas-object-pill",
  },
  text: { kind: "label" },
  defaultSize: { width: 200, height: 64 },
  defaultTone: "input",
  css: `
        /* W2 — pill: true stadium shape, radius = height/2 (computed inline via CSS calc). */
        .interactive-canvas-object-pill {
          align-items: center;
          justify-content: center;
          text-align: center;
          border-radius: 999px;
        }
`,
  catalog: { label: "Pill", keywords: ["pill", "stadium", "badge", "tag"] },
};

export const pillDef = shapeObjectDef(pillShapeDef);
