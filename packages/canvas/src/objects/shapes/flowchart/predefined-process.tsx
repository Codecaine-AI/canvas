"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";

/**
 * Predefined-process shape: rect with rounded corners and two inner vertical
 * bars near each end (moved from theme/tokens.ts in the theme dispersal).
 * SHARED: the internal-storage def imports this too — its corner radius and
 * rule inset deliberately reuse the same figures.
 */
export const PREDEFINED_PROCESS_GEOMETRY = {
  cornerRadiusPx: 5,
  barWidthPx: 4,
  /** Bar inset from each end, as a fraction of total width (17.5/371). */
  barInsetRatio: 0.047,
} as const;

/**
 * Predefined process — a rect with two inner vertical bars near each end
 * (figjam-style-spec.md: corner radius 5 logical, two 4px-wide bars inset
 * PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width from each edge).
 * The bars are plain aria-hidden spans (not an SVG silhouette) — CSS
 * positions them, and each span is painted inline with the resolved border
 * color.
 */
export const predefinedProcessShapeDef: ShapeDef = {
  type: "predefined-process",
  shape: "predefined-process",
  silhouette: {
    className: "interactive-canvas-object-predefined-process",
    silhouette: ({ colors }) => {
      // W2 — predefined-process: rect with two inner vertical bars inset from
      // each edge (PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width).
      const barInsetPct = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio * 100;
      return (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ left: `${barInsetPct}%`, background: colors.border }}
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ right: `${barInsetPct}%`, left: "auto", background: colors.border }}
          />
        </>
      );
    },
  },
  css: `
        /* W2 — predefined-process: rect + two inner vertical bars near each edge. */
        .interactive-canvas-object-predefined-process {
          border-radius: ${PREDEFINED_PROCESS_GEOMETRY.cornerRadiusPx}px;
        }
        .interactive-canvas-predefined-process-bar {
          position: absolute;
          top: 0;
          bottom: 0;
          width: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx}px;
        }
`,
  catalog: { label: "Predefined process", keywords: ["predefined-process", "predefined process", "subroutine"] },
};

export const predefinedProcessDef = shapeObjectDef(predefinedProcessShapeDef);
