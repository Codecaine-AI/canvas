// Grid constants (moved from theme/tokens.ts in the theme dispersal — the
// adaptive-grid math below is their consumer). The grid is adaptive: a base
// 8 logical-px step that doubles or halves (powers of two) so the ON-SCREEN
// dot pitch stays inside a comfortable band — see grid.test.ts for the zoom
// data points that pin the base step and band.
export const GRID_BASE_STEP_PX = 8;
/** Screen-space band the effective step (8 * 2^n) must stay inside. */
export const GRID_MIN_SCREEN_STEP_PX = 6.5;
export const GRID_MAX_SCREEN_STEP_PX = 13;
/** Dot diameter at 100% zoom, logical px. */
export const GRID_DOT_DIAMETER_PX = 2;

/** @deprecated kept for callers still importing the old name; equals GRID_BASE_STEP_PX. */
export const BASE_GRID_STEP = GRID_BASE_STEP_PX;
export const MIN_SCREEN_STEP_PX = GRID_MIN_SCREEN_STEP_PX;
export const MAX_SCREEN_STEP_PX = GRID_MAX_SCREEN_STEP_PX;
/** Dot radius at 100% zoom, screen px (FigJam's ~2 logical px diameter). */
export const BASE_DOT_RADIUS_PX = GRID_DOT_DIAMETER_PX / 2;
/** Dots stay visible even when zoomed far out. */
export const MIN_DOT_RADIUS_PX = 0.5;
/** Dots stop growing past this size when zoomed far in. */
export const MAX_DOT_RADIUS_PX = BASE_DOT_RADIUS_PX * 2;

export type GridTranslate = {
  x: number;
  y: number;
};

export type GridBackground = {
  backgroundSize: string;
  backgroundPosition: string;
  dotRadius: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Returns CSS values for a zoom-aware dot grid pinned to world coordinates.
 *
 * FigJam's adaptive grid law (theme/tokens.ts, canvas.gridDot): the world
 * step is `GRID_BASE_STEP_PX * 2^n` for whichever integer `n` keeps the
 * on-screen spacing (`step * scale`) inside
 * `[GRID_MIN_SCREEN_STEP_PX, GRID_MAX_SCREEN_STEP_PX]` = ~[6.5, 13]px.
 * Step changes happen only by powers of two, so density shifts discretely
 * while background size and pan position still move continuously within
 * each tier.
 *
 * Validated against the two pixel-sampled ground-truth observations in
 * figjam-style-tokens.json (canvas.gridDot.observed):
 *   zoom 0.305 -> measured 9.8px on screen, 32px logical spacing
 *   zoom 0.21  -> measured 6.9px on screen, 33px logical spacing (~32 w/ noise)
 * At zoom 0.305: base step 8 needs n=2 (8*4=32) to bring 8*scale=2.44px up
 * into [6.5,13] -> 32*0.305=9.76px, matching the 9.8px observation.
 * At zoom 0.21: 32*0.21=6.72px, matching the 6.9px observation (both are
 * the same n=2 tier — the spec's "32px logical at both zooms" data point is
 * exactly reproduced by this law, see grid.test.ts).
 *
 * Dot radius is fixed at FigJam's ~2 logical px diameter (1px screen radius
 * at 100% zoom) rather than scaling with the step tier — FigJam's dots stay
 * a constant, fine on-screen size regardless of zoom tier.
 */
export function gridBackground(scale: number, translate: GridTranslate): GridBackground {
  let effectiveStep = GRID_BASE_STEP_PX;
  let sizePx = effectiveStep * scale;

  while (sizePx < GRID_MIN_SCREEN_STEP_PX) {
    effectiveStep *= 2;
    sizePx = effectiveStep * scale;
  }

  while (sizePx > GRID_MAX_SCREEN_STEP_PX) {
    effectiveStep /= 2;
    sizePx = effectiveStep * scale;
  }

  // Raw backgroundPosition is correct here: CSS repeats by backgroundSize, so
  // the position naturally wraps while staying pinned to world-space panning.
  const xPx = -translate.x * scale;
  const yPx = -translate.y * scale;

  // FigJam's dots read as a constant fine size on screen regardless of the
  // current density tier — clamp keeps it sane at extreme zoom-out/zoom-in.
  const dotRadius = clamp(BASE_DOT_RADIUS_PX * scale, MIN_DOT_RADIUS_PX, MAX_DOT_RADIUS_PX);

  return {
    backgroundSize: `${sizePx}px ${sizePx}px`,
    backgroundPosition: `${xPx}px ${yPx}px`,
    dotRadius,
  };
}
