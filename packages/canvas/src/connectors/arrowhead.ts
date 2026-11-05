/**
 * Arrowhead geometry, shared by the stage's `<marker>` defs
 * (stage/CanvasStage.tsx) and the static PNG renderer (render/static-svg.ts)
 * so both paint the same head. A solid triangle as long as it is wide, whose
 * tip overshoots the rendered path end by half a stroke width.
 */

/** Head length and base width, in stroke widths, before the floor. */
const ARROWHEAD_TO_STROKE_RATIO = 5;

/**
 * Least head length and base width, in world px. A 2px schematic stroke at
 * 5x gives a 10px head, which a whole-board PNG prints too small to read the
 * direction; 14px reads at 1:1.
 */
export const ARROWHEAD_MIN_SIZE_PX = 14;

/** The tip overshoots the path end by this many stroke widths (marker refX = length − 0.5). */
export const ARROWHEAD_TIP_OVERSHOOT_RATIO = 0.5;

/**
 * Head length and base width in stroke widths for the style's connector
 * stroke: 5, raised so the head is at least ARROWHEAD_MIN_SIZE_PX world px.
 */
export function arrowheadStrokeRatio(styleStrokeWidthPx: number): number {
  if (!(styleStrokeWidthPx > 0)) return ARROWHEAD_TO_STROKE_RATIO;
  return Math.max(ARROWHEAD_TO_STROKE_RATIO, ARROWHEAD_MIN_SIZE_PX / styleStrokeWidthPx);
}
