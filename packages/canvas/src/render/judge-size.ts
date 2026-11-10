/**
 * The judged board PNG size: the whole board at 1:1 world scale, scaled down
 * only so its long edge is at most JUDGE_PNG_MAX_EDGE px. canvas_check
 * (toolkit checkCanvasFile) and `climb render` (eval-suite runner) both
 * render at this size, so the drawer sees the PNG the judges score.
 *
 * Dependency-free on purpose: the eval-suite runner imports it by path
 * without compiling the rest of the canvas package.
 */

/** The largest image edge, in px, that Opus reads without scaling it down. */
export const JUDGE_PNG_MAX_EDGE = 2576;

export interface PngSize {
  width: number;
  height: number;
  scale: number;
}

/**
 * The judged PNG size for a board camera of `world` size: 1:1 world scale,
 * scaled down only so the long edge is at most `JUDGE_PNG_MAX_EDGE` px.
 */
export function judgePngSize(world: { width: number; height: number }): PngSize {
  const scale = Math.min(1, JUDGE_PNG_MAX_EDGE / Math.max(world.width, world.height));
  return { width: Math.round(world.width * scale), height: Math.round(world.height * scale), scale };
}

/** Passes that settle the camera, whose title chips grow as the zoom drops. */
const CAMERA_SETTLE_PASSES = 4;

/**
 * A board view rendered at the judged width. `view(width)` renders the whole
 * board `width` px wide and reports its world camera. Starting from
 * `startWidth`, it re-renders until the width stops changing: the camera fits
 * zoom-scaled title chips, so its world size moves with the width.
 */
export function renderAtJudgeSize<T extends { camera: { width: number; height: number } }>(
  view: (width: number) => T,
  startWidth: number,
): { width: number; rendered: T } {
  let width = startWidth;
  let rendered = view(width);
  for (let pass = 0; pass < CAMERA_SETTLE_PASSES; pass += 1) {
    const next = judgePngSize(rendered.camera).width;
    if (next === width) break;
    width = next;
    rendered = view(width);
  }
  return { width, rendered };
}
