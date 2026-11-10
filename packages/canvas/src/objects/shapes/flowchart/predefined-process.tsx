"use client";

import { shapeObjectDef } from "../base";
import type { ShapeDef } from "../shape-def";
import { DEFAULT_CANVAS_STYLE } from "../../../theme/canvas-style";
import { canvasStyleCssVar } from "../../../theme/canvas-style-context";
import { FIGJAM_PREDEFINED_PROCESS_BAR_PX, resolvePredefinedProcessBarWidth } from "../../../theme/tokens";
import { resolvePredefinedProcessPaint } from "../../../theme/palette";

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
 * — the border width outside FigJam — inset PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width from each edge).
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
      // W2 — predefined-process: rect with two inner vertical bars inset from
      // each edge (PREDEFINED_PROCESS_GEOMETRY.barInsetRatio of total width).
      const barInsetPct = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio * 100;
      // A border painted as an SVG stroke (see shapes/base.tsx) leaves the
      // padding box spanning the whole box: keep the bars inside the line, at
      // the same ratio of the inner width (s + ratio·(W − 2s)).
      const ratio = PREDEFINED_PROCESS_GEOMETRY.barInsetRatio;
      const inset =
        strokedBorderPx > 0 ? `calc(${strokedBorderPx * (1 - 2 * ratio)}px + ${barInsetPct}%)` : `${barInsetPct}%`;
      // The class paints FigJam's 4px bar; other themes draw the border width inline.
      const barWidthPx = resolvePredefinedProcessBarWidth(strokeWidth, canvasStyle);
      const width = barWidthPx !== FIGJAM_PREDEFINED_PROCESS_BAR_PX ? { width: `${barWidthPx}px` } : null;
      const vertical =
        strokedBorderPx > 0 ? { top: `${strokedBorderPx}px`, bottom: `${strokedBorderPx}px` } : null;
      // Outside FigJam each end band (outline to bar) takes a light tint and
      // the bar a softer line (theme/palette.ts resolvePredefinedProcessPaint).
      const inner = resolvePredefinedProcessPaint(colors, canvasStyle);
      const bandWidth = `calc(${inset} - ${strokedBorderPx}px + ${barWidthPx}px)`;
      return (
        <>
          {inner.band ? (
            <>
              <span
                aria-hidden="true"
                data-canvas-predefined-process-band="true"
                style={{ position: "absolute", top: 0, bottom: 0, left: `${strokedBorderPx}px`, width: bandWidth, background: inner.band, ...vertical }}
              />
              <span
                aria-hidden="true"
                data-canvas-predefined-process-band="true"
                style={{ position: "absolute", top: 0, bottom: 0, right: `${strokedBorderPx}px`, left: "auto", width: bandWidth, background: inner.band, ...vertical }}
              />
            </>
          ) : null}
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ left: inset, ...width, background: inner.bar, ...vertical }}
          />
          <span
            aria-hidden="true"
            className="interactive-canvas-predefined-process-bar"
            style={{ right: inset, left: "auto", ...width, background: inner.bar, ...vertical }}
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
