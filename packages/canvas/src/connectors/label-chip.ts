/**
 * Connection label chip geometry + typography — the ONE source for the chip
 * the live connector draws (connectors/Connector.tsx), the static renderer
 * draws (render/static-svg.ts connectionLabelChipRect), and the agent's lints
 * reason about (canvas-agent board/lints/geometry.ts), so a chip is the same
 * size everywhere under every theme.
 *
 * The chip is a fixed-height rounded rect centered on the connection's label
 * point; it never truncates, it grows with its text. Its height, font, and
 * size are CanvasStyle tokens (`connectorLabelHeightPx`, `connectorLabelFont`,
 * `connectorLabelFontSizePx`); the width rule follows the font:
 *  - sans (figjam): the original char-count heuristic — 0.6em per UTF-16
 *    character plus 0.75em padding a side (9.6px + 12px at 16px), at least
 *    41/30 of the chip height (41px on the 30px chip). Bold.
 *  - mono: exact — one IBM Plex Mono cell (MONO_ADVANCE_EM) per codepoint,
 *    as render/text-metrics.ts measureMonoTextPx measures it — plus 0.5em
 *    padding a side. Medium weight.
 * The chip is drawn at natural document size at every zoom.
 *
 * Pure: no React, no DOM.
 */

import { DEFAULT_CANVAS_STYLE, type CanvasStyle, type CanvasStyleFont } from "../theme/canvas-style";
import { MONO_ADVANCE_EM } from "../theme/fonts";

export const CONNECTION_LABEL_CHIP = {
  /** Average sans advance, em (9.6px per character at 16px). */
  sansCharWidthEm: 0.6,
  /** Sans padding per side, em (12px at 16px). */
  sansPaddingXEm: 0.75,
  /** Mono padding per side, em (≈6px at 11.5px) — mono measures exactly, so it needs less slack. */
  monoPaddingXEm: 0.5,
  /** Narrowest chip = height × 41 / 30 (41px on the 30px figjam chip). */
  minWidthPerHeight: { numerator: 41, denominator: 30 },
  sansFontWeight: 700,
  monoFontWeight: 500,
  /** Hairline border (`hairlineColor`). */
  borderWidthPx: 1,
} as const;

export interface ConnectionLabelChipMetrics {
  width: number;
  height: number;
  font: CanvasStyleFont;
  fontSizePx: number;
  fontWeight: number;
}

/** The chip's size and text font for `label` under `canvasStyle`. */
export function connectionLabelChipMetrics(
  label: string,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): ConnectionLabelChipMetrics {
  const font = canvasStyle.connectorLabelFont;
  const fontSizePx = canvasStyle.connectorLabelFontSizePx;
  const height = canvasStyle.connectorLabelHeightPx;
  const { numerator, denominator } = CONNECTION_LABEL_CHIP.minWidthPerHeight;
  const minWidth = (height * numerator) / denominator;
  if (font === "mono") {
    let glyphs = 0;
    for (const _char of label) glyphs += 1;
    const paddingX = fontSizePx * CONNECTION_LABEL_CHIP.monoPaddingXEm;
    return {
      width: Math.max(minWidth, glyphs * MONO_ADVANCE_EM * fontSizePx + paddingX * 2),
      height,
      font,
      fontSizePx,
      fontWeight: CONNECTION_LABEL_CHIP.monoFontWeight,
    };
  }
  const charWidth = fontSizePx * CONNECTION_LABEL_CHIP.sansCharWidthEm;
  const paddingX = fontSizePx * CONNECTION_LABEL_CHIP.sansPaddingXEm;
  return {
    width: Math.max(minWidth, label.length * charWidth + paddingX * 2),
    height,
    font,
    fontSizePx,
    fontWeight: CONNECTION_LABEL_CHIP.sansFontWeight,
  };
}

/** World rect of `label`'s chip centered on `center` (the connection's label point). */
export function connectionLabelChipRect(
  label: string,
  center: { x: number; y: number },
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): { x: number; y: number; width: number; height: number } {
  const { width, height } = connectionLabelChipMetrics(label, canvasStyle);
  return { x: center.x - width / 2, y: center.y - height / 2, width, height };
}
