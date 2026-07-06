import type { CanvasPoint } from "../model/geometry";

/** Screen-space size of the canvas stage element (pointer is assumed already stage-relative). */
export type StageRect = {
  width: number;
  height: number;
};

/**
 * Edge auto-pan velocity (checkpoint 1, T1.2.1): while a drag/marquee/endpoint
 * gesture is in progress and the pointer sits inside the `band`-px region near
 * a stage edge, the viewport should pan toward that edge each frame so the
 * user can drag an object (or extend a marquee) past the visible bounds
 * without releasing the pointer.
 *
 * Sign convention: the returned `{ dx, dy }` is a suggested delta to ADD to
 * the viewport's screen-space pan/translate each animation frame (the same
 * convention `panBy(viewport, screenDx, screenDy)` in viewport.ts already
 * uses). Concretely:
 *   - pointer near the LEFT edge  -> dx is NEGATIVE (content pans right,
 *     revealing more space to the left, matching panBy's screenDx sign).
 *   - pointer near the RIGHT edge -> dx is POSITIVE.
 *   - pointer near the TOP edge   -> dy is NEGATIVE.
 *   - pointer near the BOTTOM edge -> dy is POSITIVE.
 * Each axis is computed independently, so a pointer in a corner (e.g.
 * top-left) yields nonzero dx AND dy simultaneously.
 *
 * Ramp: velocity magnitude ramps LINEARLY from 0 at `band` px away from the
 * edge, up to `maxSpeed` right at the edge (distance 0) or beyond (pointer
 * outside the stage bounds), i.e. `speed = maxSpeed * (1 - distance / band)`,
 * clamped to `[0, maxSpeed]`. A pointer more than `band` px from every edge
 * (the "safe" interior) — or a non-positive `band`/`maxSpeed` — yields
 * `{ dx: 0, dy: 0 }`.
 */
export function computeEdgePan(
  pointer: CanvasPoint,
  stageRect: StageRect,
  band: number,
  maxSpeed: number,
): { dx: number; dy: number } {
  if (band <= 0 || maxSpeed <= 0) return { dx: 0, dy: 0 };

  const axisPan = (position: number, size: number): number => {
    // Distance from the near (start) edge and the far (end) edge; negative
    // values mean the pointer is already outside the stage on that side.
    const distanceFromStart = position;
    const distanceFromEnd = size - position;

    if (distanceFromStart < band) {
      const clampedDistance = Math.max(distanceFromStart, 0);
      const speed = maxSpeed * (1 - clampedDistance / band);
      return -Math.min(Math.max(speed, 0), maxSpeed);
    }
    if (distanceFromEnd < band) {
      const clampedDistance = Math.max(distanceFromEnd, 0);
      const speed = maxSpeed * (1 - clampedDistance / band);
      return Math.min(Math.max(speed, 0), maxSpeed);
    }
    return 0;
  };

  return {
    dx: axisPan(pointer.x, stageRect.width),
    dy: axisPan(pointer.y, stageRect.height),
  };
}
