// Grid constants (moved from theme/tokens.ts in the theme dispersal — the
// adaptive-grid math below is their consumer). The grid is adaptive when
// zooming out: a base 8 logical-px step doubles by powers of two so the
// ON-SCREEN dot pitch does not collapse into noise. When zooming in, we keep
// the base world step so dots spread out naturally instead of forming a dense
// screen-space pattern.
export const GRID_BASE_STEP_PX = 8;
/** Minimum screen-space pitch before the effective world step doubles. */
export const GRID_MIN_SCREEN_STEP_PX = 6.5;
/** Reference comfort max; high zoom may exceed this to avoid dense subdivision. */
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
 * The world step starts at `GRID_BASE_STEP_PX` and doubles by powers of two
 * only when zooming out far enough that the on-screen spacing would fall below
 * `GRID_MIN_SCREEN_STEP_PX`. We intentionally do not halve below the base step
 * at high zoom; otherwise the grid keeps a tight screen-space pitch and turns
 * into a dense dot field.
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
 * at 100% zoom) and clamped at the extremes.
 */
export function gridBackground(scale: number, translate: GridTranslate): GridBackground {
  let effectiveStep = GRID_BASE_STEP_PX;
  let sizePx = effectiveStep * scale;

  while (sizePx < GRID_MIN_SCREEN_STEP_PX) {
    effectiveStep *= 2;
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
