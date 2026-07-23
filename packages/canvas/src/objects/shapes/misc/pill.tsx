"use client";

import { PILL_OUTLINE } from "../../geometry";
import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Pill (W2) — a true stadium shape expressed purely in CSS (border-radius:
 * 999px against the object's own height/width, no SVG silhouette needed):
 * the base button trim IS the outline, so this def only adds the extra
 * className and its one CSS rule.
 */
export const pillShapeDef: ShapeDef = {
  type: "pill",
  shape: "pill",
  outline: PILL_OUTLINE,
  silhouette: {
    className: "interactive-canvas-object-pill",
  },
  css: `
        /* W2 — pill: true stadium shape, radius = height/2 (computed inline via CSS calc). */
        .interactive-canvas-object-pill {
          border-radius: 999px;
        }
`,
  catalog: { label: "Pill", keywords: ["pill", "stadium", "badge", "tag"] },
};

export const pillDef = shapeObjectDef(pillShapeDef);
