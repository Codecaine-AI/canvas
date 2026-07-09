/**
 * Ported (not verbatim) from BlockSuite.
 *
 * Upstream source: packages/affine/gfx/pointer/src/snap/snap-overlay.ts
 * License: MPL-2.0 (see repo-root PROVENANCE.md for details)
 *
 * This file extracts the pure, framework-free "distribution" (equal-spacing)
 * snap algorithm and the 9-way closest-distance alignment math from
 * `SnapOverlay` — `_alignDistributeHorizontally`, `_alignDistributeVertically`,
 * and `_calculateClosestDistances` — and ports them to plain TypeScript
 * operating on this repo's `{x, y, width, height}` bounds shape (BlockSuite's
 * `Bound` uses `w`/`h`; the math is otherwise unchanged).
 *
 * All Lit, `Overlay` base class, `GfxController`/viewport/grid-search, and
 * theme/rendering code were removed — this repo's `snapping.ts` already owns
 * candidate scoping (`nearestCandidates`) and CanvasStage.tsx owns rendering.
 * Only the following were lifted, algorithmically unchanged:
 *   - the closest-distance-wins search over 9 distance-pair types per axis
 *     (center-center, center-edge x4, edge-edge x4)
 *   - the distribution search: for every ordered pair of same-axis-crossing
 *     boxes, evaluate "snap between", "snap left of pair", "snap right of
 *     pair" candidate centers, keep the minimum |dif| (tie-broken by minimum
 *     average distance to the two flanking boxes), then chain outward in both
 *     directions from the matched pair collecting further boxes at the exact
 *     same spacing (the "N equal gaps" guide chain)
 *
 * `almostEqual` is reused from `../connectors/pathfinding/gfx-types` (same
 * upstream package). `ALIGN_THRESHOLD` / `DISTRIBUTION_LINE_OFFSET` / `STROKE_WIDTH`
 * and the two guide colors (`#8B5CF6` alignment / `#CC4187` distribution) are
 * copied verbatim from `snap-overlay.ts` lines 35-37 and 700/723.
 *
 * ONE INTENTIONAL DEVIATION: `alignDistributeVertically` fixes two axis bugs
 * present in upstream's `_alignDistributeVertically` (sorting `hBoxes` by
 * `center[0]` instead of `center[1]`, and comparing `db.maxY < ub.minX`
 * instead of `db.maxY < ub.minY` — both read as copy-paste leftovers from the
 * horizontal twin, `snap-overlay.ts:266,284`). See the inline comment at the
 * fix site and `snap-distribution.test.ts` for a reproduction. Every other
 * function/branch is control-flow-and-math-identical to upstream.
 */

import { almostEqual } from "../connectors/pathfinding/gfx-types";

/** Plain axis-aligned bounds — this repo's `CanvasBounds` shape (`{x, y, width, height}`). */
export type SnapBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SnapPoint = { x: number; y: number };

/** Screen-constant snap threshold (world px = this / zoom). Upstream `ALIGN_THRESHOLD`. */
export const ALIGN_THRESHOLD = 8;
/** World-px inset applied to each end of a distribution guide segment so it doesn't touch the boxes it spans. Upstream `DISTRIBUTION_LINE_OFFSET`. */
export const DISTRIBUTION_LINE_OFFSET = 1;
/** Guide stroke width, world px = this / zoom. Upstream `STROKE_WIDTH`. */
export const STROKE_WIDTH = 2;

/** Alignment-guide stroke color (purple). Upstream `snap-overlay.ts:700`. */
export const ALIGNMENT_GUIDE_COLOR = "#8B5CF6";
/** Distribution (equal-gap) guide stroke color (magenta). Upstream `snap-overlay.ts:723`. */
export const DISTRIBUTION_GUIDE_COLOR = "#CC4187";
/** Half-length of the perpendicular end-tick bar drawn on distribution guides, world px = this / zoom. Upstream `snap-overlay.ts:725`. */
export const DISTRIBUTION_TICK_BAR = 10;

function maxX(b: SnapBounds): number {
  return b.x + b.width;
}
function maxY(b: SnapBounds): number {
  return b.y + b.height;
}
function centerX(b: SnapBounds): number {
  return b.x + b.width / 2;
}
function centerY(b: SnapBounds): number {
  return b.y + b.height / 2;
}

/** Upstream `Bound.isHorizontalCross` — true when the two boxes' Y ranges overlap (so they can be compared along X). */
function isHorizontalCross(a: SnapBounds, b: SnapBounds): boolean {
  return a.y <= maxY(b) && maxY(a) >= b.y;
}
/** Upstream `Bound.isVerticalCross` — true when the two boxes' X ranges overlap (so they can be compared along Y). */
function isVerticalCross(a: SnapBounds, b: SnapBounds): boolean {
  return a.x <= maxX(b) && maxX(a) >= b.x;
}
/** Upstream `Bound.isIntersectWithBound` — true when the two boxes overlap in both axes (strict). */
function isIntersectWithBound(a: SnapBounds, b: SnapBounds): boolean {
  return a.x < maxX(b) && maxX(a) > b.x && a.y < maxY(b) && maxY(a) > b.y;
}
/** Upstream `Bound.horizontalDistance` — gap between the two boxes' X ranges (negative/overlapping if they intersect on X). */
function horizontalDistance(a: SnapBounds, b: SnapBounds): number {
  return Math.max(a.x, b.x) - Math.min(maxX(a), maxX(b));
}
/** Upstream `Bound.verticalDistance` — gap between the two boxes' Y ranges. */
function verticalDistance(a: SnapBounds, b: SnapBounds): number {
  return Math.max(a.y, b.y) - Math.min(maxY(a), maxY(b));
}

export type DistributionGuideSegment = { x1: number; y1: number; x2: number; y2: number };

export type DistributionResult = {
  /** World-space delta to apply to the moving box's position so it lands in the equalized-spacing slot. */
  dx: number;
  dy: number;
  /** Every gap-segment guide to render (the matched pair's two flanking gaps plus any chained equal gaps found by walking outward). */
  guides: DistributionGuideSegment[];
};

/**
 * Ported from `SnapOverlay._alignDistributeHorizontally`. Finds a horizontal
 * (X-axis) position for `moving` that equalizes its gap to two boxes it sits
 * between (or extends a same-spacing sequence to its immediate left/right),
 * among all `candidates` whose Y range crosses `moving`'s. Returns
 * `{ dx: 0, guides: [] }` when no candidate pair produces a within-threshold
 * match.
 */
export function alignDistributeHorizontally(
  moving: SnapBounds,
  candidates: SnapBounds[],
  threshold: number,
  zoom: number,
): { dx: number; guides: DistributionGuideSegment[] } {
  const wBoxes = candidates.filter((box) => isHorizontalCross(box, moving));
  wBoxes.sort((a, b) => centerX(a) - centerX(b));

  let dif = Infinity;
  let min = Infinity;
  let aveDis = Number.MAX_SAFE_INTEGER;
  let dx = 0;
  let curBound:
    | {
        leftIdx: number;
        rightIdx: number;
        spacing: number;
        segments: DistributionGuideSegment[];
      }
    | undefined;

  for (let i = 0; i < wBoxes.length; i += 1) {
    for (let j = i + 1; j < wBoxes.length; j += 1) {
      let lb = wBoxes[i]!;
      let rb = wBoxes[j]!;
      if (!isHorizontalCross(lb, rb) || isIntersectWithBound(lb, rb)) continue;

      let switchFlag = false;
      if (maxX(rb) < lb.x) {
        const temp = rb;
        rb = lb;
        lb = temp;
        switchFlag = true;
      }

      let candidateCenterX = 0;
      const updateDif = () => {
        dif = Math.abs(centerX(moving) - candidateCenterX);
        const curAveDis =
          (Math.abs(centerX(lb) - candidateCenterX) + Math.abs(centerX(rb) - candidateCenterX)) / 2;
        if (dif <= threshold && (dif < min || (almostEqual(dif, min) && curAveDis < aveDis))) {
          min = dif;
          aveDis = curAveDis;
          dx = candidateCenterX - centerX(moving);

          const ys = [lb.y, maxY(lb), rb.y, maxY(rb)].sort((a, b) => a - b);
          const y = (ys[1]! + ys[2]!) / 2;
          const offset = DISTRIBUTION_LINE_OFFSET / zoom;
          const xs = [
            candidateCenterX - moving.width / 2,
            candidateCenterX + moving.width / 2,
            rb.x,
            maxX(rb),
            lb.x,
            maxX(lb),
          ].sort((a, b) => a - b);

          curBound = {
            leftIdx: switchFlag ? j : i,
            rightIdx: switchFlag ? i : j,
            spacing: xs[2]! - xs[1]!,
            segments: [
              { x1: xs[1]! + offset, y1: y, x2: xs[2]! - offset, y2: y },
              { x1: xs[3]! + offset, y1: y, x2: xs[4]! - offset, y2: y },
            ],
          };
        }
      };

      if (horizontalDistance(lb, rb) > moving.width) {
        candidateCenterX = (maxX(lb) + rb.x) / 2;
        updateDif();
      }

      candidateCenterX = lb.x - (rb.x - maxX(lb)) - moving.width / 2;
      updateDif();

      candidateCenterX = rb.x - maxX(lb) + maxX(rb) + moving.width / 2;
      updateDif();
    }
  }

  if (!curBound) return { dx: 0, guides: [] };

  const { leftIdx, rightIdx, spacing, segments } = curBound;
  const guides = [...segments];

  let curLeftBound = wBoxes[leftIdx]!;
  for (let i = leftIdx - 1; i >= 0; i -= 1) {
    const candidate = wBoxes[i]!;
    if (!almostEqual(maxX(candidate), curLeftBound.x - spacing)) break;
    const ys = [candidate.y, maxY(candidate), curLeftBound.y, maxY(curLeftBound)].sort((a, b) => a - b);
    const y = (ys[1]! + ys[2]!) / 2;
    guides.push({ x1: maxX(candidate), y1: y, x2: curLeftBound.x, y2: y });
    curLeftBound = candidate;
  }

  let curRightBound = wBoxes[rightIdx]!;
  for (let i = rightIdx + 1; i < wBoxes.length; i += 1) {
    const candidate = wBoxes[i]!;
    if (!almostEqual(candidate.x, maxX(curRightBound) + spacing)) break;
    const ys = [candidate.y, maxY(candidate), curRightBound.y, maxY(curRightBound)].sort((a, b) => a - b);
    const y = (ys[1]! + ys[2]!) / 2;
    guides.push({ x1: maxX(curRightBound), y1: y, x2: candidate.x, y2: y });
    curRightBound = candidate;
  }

  return { dx, guides };
}

/**
 * Ported from `SnapOverlay._alignDistributeVertically` — the Y-axis mirror of
 * `alignDistributeHorizontally` (see its doc comment).
 */
export function alignDistributeVertically(
  moving: SnapBounds,
  candidates: SnapBounds[],
  threshold: number,
  zoom: number,
): { dy: number; guides: DistributionGuideSegment[] } {
  const hBoxes = candidates.filter((box) => isVerticalCross(box, moving));
  hBoxes.sort((a, b) => centerY(a) - centerY(b));

  let dif = Infinity;
  let min = Infinity;
  let aveDis = Number.MAX_SAFE_INTEGER;
  let dy = 0;
  let curBound:
    | {
        upperIdx: number;
        lowerIdx: number;
        spacing: number;
        segments: DistributionGuideSegment[];
      }
    | undefined;

  for (let i = 0; i < hBoxes.length; i += 1) {
    for (let j = i + 1; j < hBoxes.length; j += 1) {
      let ub = hBoxes[i]!;
      let db = hBoxes[j]!;
      if (!isVerticalCross(ub, db) || isIntersectWithBound(ub, db)) continue;

      let switchFlag = false;
      // DEVIATION FROM UPSTREAM (documented, not a silent change): upstream's
      // `_alignDistributeVertically` sorts `hBoxes` by `center[0]` (X) instead
      // of `center[1]` (Y) and compares `db.maxY < ub.minX` (mixing an X bound
      // into a Y-axis swap check) — see snap-overlay.ts:266,284. Both read as
      // copy-paste artifacts from the horizontal twin that were never updated
      // for the vertical axis. We sort by `centerY` and compare `maxY(db) <
      // ub.y` instead, i.e. the axis-correct versions, since the buggy
      // upstream forms would misorder vertically-stacked pairs whose X centers
      // don't happen to match their Y order. See snap-distribution.test.ts for
      // a case that would fail under the literal upstream comparison.
      if (maxY(db) < ub.y) {
        const temp = ub;
        ub = db;
        db = temp;
        switchFlag = true;
      }

      let candidateCenterY = 0;
      const updateDif = () => {
        dif = Math.abs(centerY(moving) - candidateCenterY);
        const curAveDis =
          (Math.abs(centerY(ub) - candidateCenterY) + Math.abs(centerY(db) - candidateCenterY)) / 2;
        if (dif <= threshold && (dif < min || (almostEqual(dif, min) && curAveDis < aveDis))) {
          min = dif;
          aveDis = curAveDis;
          dy = candidateCenterY - centerY(moving);

          const xs = [ub.x, maxX(ub), db.x, maxX(db)].sort((a, b) => a - b);
          const x = (xs[1]! + xs[2]!) / 2;
          const offset = DISTRIBUTION_LINE_OFFSET / zoom;
          const ys = [
            candidateCenterY - moving.height / 2,
            candidateCenterY + moving.height / 2,
            db.y,
            maxY(db),
            ub.y,
            maxY(ub),
          ].sort((a, b) => a - b);

          curBound = {
            upperIdx: switchFlag ? j : i,
            lowerIdx: switchFlag ? i : j,
            spacing: ys[2]! - ys[1]!,
            segments: [
              { x1: x, y1: ys[1]! + offset, x2: x, y2: ys[2]! - offset },
              { x1: x, y1: ys[3]! + offset, x2: x, y2: ys[4]! - offset },
            ],
          };
        }
      };

      if (verticalDistance(ub, db) > moving.height) {
        candidateCenterY = (maxY(ub) + db.y) / 2;
        updateDif();
      }

      candidateCenterY = ub.y - (db.y - maxY(ub)) - moving.height / 2;
      updateDif();

      candidateCenterY = db.y - maxY(ub) + maxY(db) + moving.height / 2;
      updateDif();
    }
  }

  if (!curBound) return { dy: 0, guides: [] };

  const { upperIdx, lowerIdx, spacing, segments } = curBound;
  const guides = [...segments];

  let curUpperBound = hBoxes[upperIdx]!;
  for (let i = upperIdx - 1; i >= 0; i -= 1) {
    const candidate = hBoxes[i]!;
    if (!almostEqual(maxY(candidate), curUpperBound.y - spacing)) break;
    const xs = [candidate.x, maxX(candidate), curUpperBound.x, maxX(curUpperBound)].sort((a, b) => a - b);
    const x = (xs[1]! + xs[2]!) / 2;
    guides.push({ x1: x, y1: maxY(candidate), x2: x, y2: curUpperBound.y });
    curUpperBound = candidate;
  }

  let curLowerBound = hBoxes[lowerIdx]!;
  for (let i = lowerIdx + 1; i < hBoxes.length; i += 1) {
    const candidate = hBoxes[i]!;
    if (!almostEqual(candidate.y, maxY(curLowerBound) + spacing)) break;
    const xs = [candidate.x, maxX(candidate), curLowerBound.x, maxX(curLowerBound)].sort((a, b) => a - b);
    const x = (xs[1]! + xs[2]!) / 2;
    guides.push({ x1: x, y1: maxY(curLowerBound), x2: x, y2: candidate.y });
    curLowerBound = candidate;
  }

  return { dy, guides };
}

export type ClosestAxisDistance = {
  /** Signed world-space delta along the axis (candidate position minus moving position). */
  distance: number;
  /** Indices (into the fixed 9-entry distance-pair list below) tied for closest, within `almostEqual`. */
  alignPositionIndices: number[];
};

export type ClosestDistances = {
  horiz?: ClosestAxisDistance;
  vert?: ClosestAxisDistance;
};

/**
 * Ported from `SnapOverlay._calculateClosestDistances`. For a single `other`
 * box, computes the 9 candidate alignment distances per axis (center-center,
 * center-to-edge x4, edge-to-edge x4) and returns whichever is closest to
 * zero on each axis, if within `threshold`.
 */
export function calculateClosestDistances(
  moving: SnapBounds,
  other: SnapBounds,
  threshold: number,
): ClosestDistances {
  const mcx = centerX(moving);
  const mcy = centerY(moving);
  const ocx = centerX(other);
  const ocy = centerY(other);

  const xDistances = [
    ocx - mcx, // center-center
    other.x - mcx, // left edge - center
    maxX(other) - mcx, // right edge - center
    other.x - moving.x, // left-left
    maxX(other) - moving.x, // right-left
    other.x - maxX(moving), // left-right
    maxX(other) - maxX(moving), // right-right
    ocx - maxX(moving), // center-right
    ocx - moving.x, // center-left
  ];

  const yDistances = [
    ocy - mcy,
    other.y - mcy,
    maxY(other) - mcy,
    other.y - moving.y,
    maxY(other) - moving.y,
    other.y - maxY(moving),
    maxY(other) - maxY(moving),
    ocy - maxY(moving),
    ocy - moving.y,
  ];

  const xAbs = xDistances.map(Math.abs);
  const yAbs = yDistances.map(Math.abs);
  const closestX = Math.min(...xAbs);
  const closestY = Math.min(...yAbs);

  return {
    horiz:
      closestX <= threshold
        ? {
            distance: xDistances[xAbs.indexOf(closestX)]!,
            alignPositionIndices: xAbs.reduce<number[]>((acc, val, idx) => {
              if (almostEqual(val, closestX)) acc.push(idx);
              return acc;
            }, []),
          }
        : undefined,
    vert:
      closestY <= threshold
        ? {
            distance: yDistances[yAbs.indexOf(closestY)]!,
            alignPositionIndices: yAbs.reduce<number[]>((acc, val, idx) => {
              if (almostEqual(val, closestY)) acc.push(idx);
              return acc;
            }, []),
          }
        : undefined,
  };
}
