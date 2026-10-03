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
 * `connectorLabelFontSizePx`). Its width is the label's painted width — the
 * `<text>` collapses whitespace runs and trims, so the label is measured that
 * way (theme/text-measure.ts, in the chip's font) — plus the padding a side
 * (0.75em sans, 0.5em mono), at least 41/30 of the chip height (41px on the
 * 30px figjam chip). Sans labels paint bold, mono labels medium. The chip is
 * drawn at natural document size at every zoom.
 *
 * Pure: no React, no DOM.
 */

import { DEFAULT_CANVAS_STYLE, type CanvasStyle, type CanvasStyleFont } from "../theme/canvas-style";
import { CANVAS_MONO_FONT_STACK, CANVAS_SANS_FONT_STACK } from "../theme/fonts";
import { measureWidth, type FontSpec } from "../theme/text-measure";

export const CONNECTION_LABEL_CHIP = {
  /** Sans padding per side, em (12px at 16px). */
  sansPaddingXEm: 0.75,
  /** Mono padding per side, em (7px at 14px). */
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
  /** The label's painted width in the chip font (whitespace collapsed, trimmed). */
  textWidthPx: number;
  /** Padding a side between the text and the chip edge. */
  paddingXPx: number;
  /** The narrowest chip (height × 41/30): a label shorter than this leaves the width at the floor. */
  minWidthPx: number;
}

/** The font `canvasStyle` paints label chips in, as a text-measure FontSpec. */
export function connectionLabelFontSpec(canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE): FontSpec {
  const mono = canvasStyle.connectorLabelFont === "mono";
  return {
    family: mono ? CANVAS_MONO_FONT_STACK : CANVAS_SANS_FONT_STACK,
    size: canvasStyle.connectorLabelFontSizePx,
    weight: mono ? CONNECTION_LABEL_CHIP.monoFontWeight : CONNECTION_LABEL_CHIP.sansFontWeight,
  };
}

/** The chip's size and text font for `label` under `canvasStyle`. */
export function connectionLabelChipMetrics(
  label: string,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): ConnectionLabelChipMetrics {
  const font = canvasStyle.connectorLabelFont;
  const spec = connectionLabelFontSpec(canvasStyle);
  const height = canvasStyle.connectorLabelHeightPx;
  const { numerator, denominator } = CONNECTION_LABEL_CHIP.minWidthPerHeight;
  const minWidth = (height * numerator) / denominator;
  const paddingXPx =
    spec.size * (font === "mono" ? CONNECTION_LABEL_CHIP.monoPaddingXEm : CONNECTION_LABEL_CHIP.sansPaddingXEm);
  const textWidthPx = measureWidth(label, spec);
  return {
    width: Math.max(minWidth, textWidthPx + paddingXPx * 2),
    height,
    font,
    fontSizePx: spec.size,
    fontWeight: spec.weight!,
    textWidthPx,
    paddingXPx,
    minWidthPx: minWidth,
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
