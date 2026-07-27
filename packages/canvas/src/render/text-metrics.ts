/**
 * Real Inter text measurement for the static renderer.
 *
 * Wraps the generated per-glyph advance table (inter-metrics.generated.ts,
 * produced by scripts/generate-inter-metrics.ts from the app's bundled Inter
 * variable TTF) behind px-measurement helpers, so line-breaking and ellipsis
 * decisions in the static SVG output match what the browser's Inter layout
 * does in the live stage.
 *
 * Weight model: the table carries the font's default instance (wght 400) and
 * its wght-700 instance (hmtx + HVAR — the exact advances the browser uses
 * for font-weight 700). Weights ≥ 600 measure with the bold table, everything
 * else with the regular one; the app only sets 400 and 700.
 *
 * Documented approximations:
 * - No kerning or ligatures. Inter's kern pairs only tighten a handful of
 *   combinations slightly, so measured widths err marginally wide — a line
 *   can wrap a word earlier than the browser, never paint wider than it.
 * - Codepoints outside the generated coverage use the table's fallback
 *   advance (the rounded mean of the covered set).
 */

import {
  INTER_ADVANCES_BOLD,
  INTER_ADVANCES_REGULAR,
  INTER_FALLBACK_ADVANCE_BOLD,
  INTER_FALLBACK_ADVANCE_REGULAR,
  INTER_UNITS_PER_EM,
  type InterAdvanceRange,
} from "./inter-metrics.generated";

export { INTER_UNITS_PER_EM };

/** Font weights at or above this measure with the wght-700 advance table. */
export const INTER_BOLD_MIN_WEIGHT = 600;

function buildAdvanceMap(ranges: readonly InterAdvanceRange[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const range of ranges) {
    for (let index = 0; index < range.advances.length; index += 1) {
      map.set(range.start + index, range.advances[index]!);
    }
  }
  return map;
}

const REGULAR_ADVANCES = buildAdvanceMap(INTER_ADVANCES_REGULAR);
const BOLD_ADVANCES = buildAdvanceMap(INTER_ADVANCES_BOLD);

/** Advance width of one codepoint in font units at the given font weight. */
export function interAdvanceUnits(codePoint: number, fontWeight: number): number {
  if (fontWeight >= INTER_BOLD_MIN_WEIGHT) {
    return BOLD_ADVANCES.get(codePoint) ?? INTER_FALLBACK_ADVANCE_BOLD;
  }
  return REGULAR_ADVANCES.get(codePoint) ?? INTER_FALLBACK_ADVANCE_REGULAR;
}

/** Advance width of one codepoint in px at the given font size and weight. */
export function interCharWidthPx(
  codePoint: number,
  fontSizePx: number,
  fontWeight: number,
): number {
  return (interAdvanceUnits(codePoint, fontWeight) * fontSizePx) / INTER_UNITS_PER_EM;
}

/**
 * Width of a text run in px: the sum of its codepoints' advances (iterated
 * by codepoint, so surrogate pairs measure once).
 */
export function measureInterTextPx(
  text: string,
  fontSizePx: number,
  fontWeight: number,
): number {
  let units = 0;
  for (const char of text) {
    units += interAdvanceUnits(char.codePointAt(0)!, fontWeight);
  }
  return (units * fontSizePx) / INTER_UNITS_PER_EM;
}
