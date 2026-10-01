/**
 * Real text measurement for the static renderer.
 *
 * Inter runs measure with the generated per-glyph advance table through
 * theme/inter-metrics.ts (re-exported here, so render-side callers keep one
 * import), so line-breaking and ellipsis decisions in the static SVG output
 * match what the browser's Inter layout does in the live stage. The icon
 * caption band (objects/text-slots.ts) sizes itself with the same helpers.
 * The weight model and the documented approximations (no kerning, fallback
 * advances) are described there.
 *
 * Mono runs (the IBM Plex Mono metadata font, theme/fonts.ts) need no table:
 * every glyph advances the same MONO_ADVANCE_EM — see measureMonoTextPx.
 */

import { MONO_ADVANCE_EM } from "../theme/fonts";

export {
  INTER_BOLD_MIN_WEIGHT,
  INTER_UNITS_PER_EM,
  interAdvanceUnits,
  interCharWidthPx,
  measureInterTextPx,
} from "../theme/inter-metrics";

/**
 * Width of an IBM Plex Mono run in px: one MONO_ADVANCE_EM cell per codepoint
 * (iterated by codepoint, so surrogate pairs measure once) at any weight, plus
 * `letterSpacingEm` after every glyph, the last included — how browsers size
 * a letter-spaced run and how resvg lays one out.
 *
 * Approximation: codepoints Plex Mono lacks (emoji, CJK) paint in a fallback
 * font at their own width but still measure one cell.
 */
export function measureMonoTextPx(
  text: string,
  fontSizePx: number,
  letterSpacingEm = 0,
): number {
  let glyphs = 0;
  for (const _char of text) glyphs += 1;
  return glyphs * (MONO_ADVANCE_EM + letterSpacingEm) * fontSizePx;
}
