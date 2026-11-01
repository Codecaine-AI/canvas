/**
 * The agent's 20 grid — the quantizer every geometry-bearing gesture runs its
 * WRITTEN VALUES through before they are lowered onto document patches.
 *
 * THE RULE IS ABOUT WHAT LANDS. Not "the arguments are rounded" but "every
 * number that reaches board geometry is a multiple of 20". For an absolute
 * argument the two are the same thing; for a relative one they are not, and the
 * result is what counts: `move_by 20` off a box at x=16 lands it at 40, not at
 * 36, and `align` snaps the shared coordinate the row agrees on rather than the
 * deltas that get it there. A descriptor that snapped only its inputs would
 * leave every hand-drawn box permanently off-grid, which is precisely the
 * board the grid exists to clean up. 20-multiples then survive the write path's
 * own normalization (grid 4) unchanged, so the value a tool result REPORTS is
 * the value the document holds.
 *
 * Why it exists: clean numbers everywhere. A box is 300x60 at (240, 480), a
 * nudge is +/-20, a corridor opens to 120 — never 187x63 at (241, 477). The
 * digest then reads as small round numbers, deltas are mental math, and the
 * model stops inventing near-miss values.
 *
 * SNAP, NOT REJECT. Nothing here ever throws or returns an error: a wasted
 * turn on a validation error costs more than silently correcting to the
 * nearest 20, and the tool result reports the APPLIED geometry so the model
 * sees what actually landed. Non-finite input is the one degenerate case and
 * it resolves to 0 (coordinates/gaps) or one grid unit (sizes) rather than
 * propagating NaN into the document.
 *
 * THREE GRIDS, ONE OF THEM THIS ONE. This is the AGENT grid. The canvas
 * package keeps the other two — CANVAS_GRID_SIZE = 16 for interactive drags and
 * GEOMETRY_NORMALIZATION_GRID = 4 for every geometry write. 20 and 16 are both
 * multiples of 4, which is what lets an agent-written 20-grid box survive
 * mergeObjectPatch and a full reducer replay unchanged.
 *
 * WHAT QUANTIZES (every value below lands on the grid; where the gesture is
 * relative, it is the RESULT that runs through this module, not the argument):
 *  - the corner a placement lands on — `at` on `place_section` /
 *    `place_sticky` / `place_shape`, and `clone`'s corner however it was named
 *    (`at`, `by`, or the default paste offset) — snapPoint
 *  - the corner a move lands on — `move_to`'s target, and `move_by`'s
 *    destination (current position + delta) — snapPoint
 *  - the size a box ends up with — `size` on `place_section`, `width` /
 *    `height` on `resize`, both dimensions copied by `match_size`, and the
 *    size a `clone` copies — snapSize
 *  - the shared coordinate `align` puts a row on, and each position
 *    `space_out` computes for a box — snapCoordinate
 *  - `gap` on `space_out` — snapGap
 *  - waypoint coordinates in `reroute` (`points`) and the `to` target of
 *    `shift_segment` — snapPoint / snapCoordinate
 *  - `move_label`'s `offset` — a perpendicular displacement in px — snapCoordinate
 *
 * WHAT IS EXEMPT (deliberately unsnapped — these are not world distances):
 *  - `Endpoint.position` — a 0..1 fraction along an object's side
 *  - `move_label`'s `along` — a 0..1 fraction of the routed path
 *  - text metrics — the readability checks on `resize` / `match_size` /
 *    `update_text` measure real glyph runs, not grid units
 *  - geometry a gesture does NOT write: the untouched dimension of a
 *    width-only `resize`, the first box of a `space_out` run, and the
 *    descendants a frame carries (they travel by their root's snapped delta,
 *    keeping their exact relative geometry — an off-grid child of an off-grid
 *    frame stays where it was put relative to the frame)
 */

/** The grid every number the agent writes to board geometry lands on. */
export const AGENT_GRID = 20;

/**
 * Rounds one world coordinate to the nearest grid multiple. Ties round up
 * (Math.round), matching the canvas package's own snapCanvasNumber.
 */
export function snapCoordinate(value: number, grid: number = AGENT_GRID): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / grid) * grid;
}

/**
 * Rounds an [x, y] pair — a placement `at`, a `move_to` target, a `move_by`
 * delta, or a routing waypoint. Deltas snap the same way absolutes do, so a
 * chain of nudges never accumulates off-grid drift.
 */
export function snapPoint(
  point: readonly [number, number],
  grid: number = AGENT_GRID,
): [number, number] {
  return [snapCoordinate(point[0], grid), snapCoordinate(point[1], grid)];
}

/**
 * Rounds a width/height pair, clamping each side to at least one grid unit so
 * a snap can never produce a zero- or negative-area box.
 */
export function snapSize(
  size: { width: number; height: number },
  grid: number = AGENT_GRID,
): { width: number; height: number } {
  return {
    width: Math.max(grid, snapCoordinate(size.width, grid)),
    height: Math.max(grid, snapCoordinate(size.height, grid)),
  };
}

/**
 * Rounds a `space_out` gap. A gap of 0 is meaningful (boxes flush against one
 * another), so unlike a size this clamps at 0 rather than at one grid unit;
 * negative gaps are not a gesture and collapse to 0.
 */
export function snapGap(gap: number, grid: number = AGENT_GRID): number {
  return Math.max(0, snapCoordinate(gap, grid));
}

/**
 * Snaps a whole rect to the grid by growing it: the top-left floors, the
 * bottom-right ceils. Every edge lands on a grid multiple and the snapped rect
 * always CONTAINS the input.
 *
 * Nearest-rounding each field independently would be wrong here — an x nudged
 * right and a width nudged down can together bite up to a grid unit off the
 * far edge, which for a fitted section frame means clipping into the child it
 * was measured around. Growing can only add air.
 *
 * Rects already on the grid come back untouched, so this is an identity on the
 * normal path (on-grid children + grid-multiple padding) and a safety net on
 * the off-grid one (a frame fitted around hand-drawn boxes).
 */
export function snapRectOutward(
  rect: { x: number; y: number; width: number; height: number },
  grid: number = AGENT_GRID,
): { x: number; y: number; width: number; height: number } {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
    return { x: 0, y: 0, width: grid, height: grid };
  }
  const left = Math.floor(rect.x / grid) * grid;
  const top = Math.floor(rect.y / grid) * grid;
  const right = Math.ceil((rect.x + rect.width) / grid) * grid;
  const bottom = Math.ceil((rect.y + rect.height) / grid) * grid;
  return {
    x: left,
    y: top,
    width: Math.max(grid, right - left),
    height: Math.max(grid, bottom - top),
  };
}
