"use client";

import { PREDEFINED_PROCESS_GEOMETRY } from "../../tokens/figjam-tokens";
import { shapeObjectDef } from "./base";
import type { ShapeDef } from "./shape-def";

/**
 * Predefined process — a rect with two inner vertical bars near each end
 * (figjam-style-spec.md: corner radius 5 logical, two 4px-wide bars inset
 * PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width from each edge).
 * The bars are plain aria-hidden spans (not an SVG silhouette) — CSS alone
 * positions and colors them (`background: currentColor`).
 */
export const predefinedProcessShapeDef: ShapeDef = {
  type: "predefined-process",
  shape: "predefined-process",
  outline: {
    className: "interactive-canvas-object-predefined-process",
    silhouette: () => {
      // W2 — predefined-process: rect with two inner vertical bars inset from
      // each edge (PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width).
      const barInsetPct = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio * 100;
      return (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ left: `${barInsetPct}%` }}
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ right: `${barInsetPct}%`, left: "auto" }}
          />
        </>
      );
    },
  },
  text: { kind: "label" },
  defaultSize: { width: 200, height: 100 },
  defaultTone: "memory",
  css: `
        /* W2 — predefined-process: rect + two inner vertical bars near each edge. */
        .interactive-canvas-object-predefined-process {
          align-items: center;
          justify-content: center;
          text-align: center;
          border-radius: ${PREDEFINED_PROCESS_GEOMETRY.cornerRadiusPx}px;
        }
        .interactive-canvas-predefined-process-bar {
          position: absolute;
          top: 0;
          bottom: 0;
          width: ${PREDEFINED_PROCESS_GEOMETRY.barWidthPx}px;
          background: currentColor;
          opacity: 0.6;
        }
`,
  catalog: { label: "Predefined Process", keywords: ["predefined-process", "predefined process", "subroutine"] },
};

export const predefinedProcessDef = shapeObjectDef(predefinedProcessShapeDef);
