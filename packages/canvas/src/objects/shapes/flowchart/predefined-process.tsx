"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";
import { DEFAULT_CANVAS_STYLE } from "../../../theme/canvas-style";
import { canvasStyleCssVar } from "../../../theme/canvas-style-context";
import {
  FIGJAM_PREDEFINED_PROCESS_BAR_PX,
  PREDEFINED_PROCESS_BAR_INSET_PX,
  resolvePredefinedProcessBarWidth,
} from "../../../theme/tokens";

/**
 * Predefined-process shape: rect with rounded corners and two inner vertical
 * bars near each end (moved from theme/tokens.ts in the theme dispersal).
 * `cornerRadiusPx` is the DEFAULT only — the live corner radius and bar width
 * come from theme/tokens.ts (resolveShapeCornerRadius,
 * resolvePredefinedProcessBarWidth).
 */
export const PREDEFINED_PROCESS_GEOMETRY = {
  cornerRadiusPx: DEFAULT_CANVAS_STYLE.processCornerRadiusPx,
  /** Bar inset from each end, as a fraction of total width (17.5/371). */
  barInsetRatio: 0.047,
} as const;

/**
 * Predefined process — a rect with two inner vertical bars near each end
 * (figjam-style-spec.md: canvas-style shape corner radius, two 4px-wide bars
 * inset PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width from each
 * edge; outside FigJam the plain flowchart double line: bars of
 * resolvePredefinedProcessBarWidth, PREDEFINED_PROCESS_BAR_INSET_PX in).
 * The bars are plain aria-hidden spans (not an SVG silhouette) — CSS
 * positions them, and each span is painted inline with the resolved border
 * color.
 */
export const predefinedProcessShapeDef: ShapeDef = {
  type: "predefined-process",
  shape: "predefined-process",
  silhouette: {
    className: "interactive-canvas-object-predefined-process",
    silhouette: ({ colors, strokeWidth, canvasStyle, strokedBorderPx }) => {
      // W2 — predefined-process: rect with two inner vertical bars in the
      // border color. FigJam insets them PREDEFINED_PROCESS_GEOMETRY.barInsetRatio
      // of the total width; other themes PREDEFINED_PROCESS_BAR_INSET_PX from
      // each outer edge (theme/tokens.ts).
      const barInsetPct = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio * 100;
      // A border painted as an SVG stroke (see shapes/base.tsx) leaves the
      // padding box spanning the whole box; a CSS border moves it in by the
      // border width.
      const ratio = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio;
      const inset =
        canvasStyle.theme !== "figjam"
          ? `${PREDEFINED_PROCESS_BAR_INSET_PX - (strokedBorderPx > 0 ? 0 : strokeWidth)}px`
          : strokedBorderPx > 0
            ? `calc(${strokedBorderPx * (1 - 2 * ratio)}px + ${barInsetPct}%)`
            : `${barInsetPct}%`;
      // The class paints FigJam's 4px bar; other themes draw the border width inline.
      const barWidthPx = resolvePredefinedProcessBarWidth(strokeWidth, canvasStyle);
      const width = barWidthPx !== FIGJAM_PREDEFINED_PROCESS_BAR_PX ? { width: `${barWidthPx}px` } : null;
      const vertical =
        strokedBorderPx > 0 ? { top: `${strokedBorderPx}px`, bottom: `${strokedBorderPx}px` } : null;
      return (
        <>
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ left: inset, ...width, background: colors.border, ...vertical }}
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ right: inset, left: "auto", ...width, background: colors.border, ...vertical }}
          />
        </>
      );
    },
  },
  css: `
        /* W2 — predefined-process: rect + two inner vertical bars near each edge. */
        .interactive-canvas-object-predefined-process {
          border-radius: ${canvasStyleCssVar("shapeCornerRadiusPx")};
        }
        .interactive-canvas-predefined-process-bar {
          position: absolute;
          top: 0;
          bottom: 0;
          width: ${FIGJAM_PREDEFINED_PROCESS_BAR_PX}px;
        }
`,
  catalog: { label: "Predefined process", keywords: ["predefined-process", "predefined process", "subroutine"] },
};

export const predefinedProcessDef = shapeObjectDef(predefinedProcessShapeDef);
