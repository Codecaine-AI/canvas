import { CANVAS_GRID_SIZE, type CanvasBounds } from "../state/geometry";
import {
  alignDistributeHorizontally,
  alignDistributeVertically,
  type DistributionGuideSegment,
} from "./snap-distribution";

// Re-exported for stage/overlays: the MPL-sourced implementation lives in
// interaction/snap-distribution.ts, so stage code keeps importing the visual
// constants from this local snapping boundary.
export {
  DISTRIBUTION_GUIDE_COLOR,
  DISTRIBUTION_TICK_BAR,
} from "./snap-distribution";

const MAX_SNAP_CANDIDATES = 100;
const SPACING_EPSILON = 0.5;
const GRID_EPSILON = 0.01;

export type SnapGuide = {
  axis: "x" | "y";
  position: number;
  span: { start: number; end: number };
};

export type SpacingHint = {
  axis: "x" | "y";
  /** Each gap segment along `axis`; `cross` is the perpendicular-axis position where the gap chip renders. */
  segments: Array<{ start: number; end: number; cross: number }>;
  gap: number;
};

export type SnapCorrection = {
  dx: number;
  dy: number;
  guides: SnapGuide[];
};

type Axis = "x" | "y";

type LineMatch = {
  candidate: CanvasBounds;
  delta: number;
  distance: number;
  position: number;
};

function centerDistanceSquared(a: CanvasBounds, b: CanvasBounds): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

function nearestCandidates(moving: CanvasBounds, others: CanvasBounds[]): CanvasBounds[] {
  if (others.length <= MAX_SNAP_CANDIDATES) return others;
  return [...others]
    .sort((a, b) => centerDistanceSquared(a, moving) - centerDistanceSquared(b, moving))
    .slice(0, MAX_SNAP_CANDIDATES);
}

function axisLines(bounds: CanvasBounds, axis: Axis): number[] {
  if (axis === "x") return [bounds.x, bounds.x + bounds.width / 2, bounds.x + bounds.width];
  return [bounds.y, bounds.y + bounds.height / 2, bounds.y + bounds.height];
}

function perpendicularSpan(bounds: CanvasBounds, axis: Axis): { start: number; end: number } {
  if (axis === "x") return { start: bounds.y, end: bounds.y + bounds.height };
  return { start: bounds.x, end: bounds.x + bounds.width };
}

function computeAxisSnap(
  moving: CanvasBounds,
  others: CanvasBounds[],
  threshold: number,
  axis: Axis,
): { delta: number; guide: SnapGuide | null } {
  const movingLines = axisLines(moving, axis);
  const matches: LineMatch[] = [];

  for (const candidate of others) {
    for (const movingLine of movingLines) {
      for (const candidateLine of axisLines(candidate, axis)) {
        const delta = candidateLine - movingLine;
        const distance = Math.abs(delta);
        if (distance <= threshold) {
          matches.push({ candidate, delta, distance, position: candidateLine });
        }
      }
    }
  }

  if (matches.length === 0) return { delta: 0, guide: null };

  const closestDistance = Math.min(...matches.map((match) => match.distance));
  const closestMatches = matches.filter((match) => match.distance === closestDistance);
  const winningPosition = closestMatches[0]!.position;

  // Closest wins per axis. If several candidates align to the same winning guide line
  // at that closest distance, merge them into one visual guide spanning every tied bound.
  const tiedMatches = closestMatches.filter((match) => match.position === winningPosition);
  const spans = [perpendicularSpan(moving, axis), ...tiedMatches.map((match) => perpendicularSpan(match.candidate, axis))];
  return {
    delta: tiedMatches[0]!.delta,
    guide: {
      axis,
      position: winningPosition,
      span: {
        start: Math.min(...spans.map((span) => span.start)),
        end: Math.max(...spans.map((span) => span.end)),
      },
    },
  };
}

export function computeSnapGuides(
  moving: CanvasBounds,
  others: CanvasBounds[],
  threshold: number,
): SnapCorrection {
  const candidates = nearestCandidates(moving, others);
  const xSnap = computeAxisSnap(moving, candidates, threshold, "x");
  const ySnap = computeAxisSnap(moving, candidates, threshold, "y");
  const guides = [xSnap.guide, ySnap.guide].filter((guide): guide is SnapGuide => guide !== null);
  return { dx: xSnap.delta, dy: ySnap.delta, guides };
}

/** A single equal-gap ("distribution") guide segment, in the same coordinate space as `SnapGuide`. Re-exported from the vendored port for callers that only import from `snapping.ts`. */
export type { DistributionGuideSegment };

export type DistributionSnapCorrection = SnapCorrection & {
  /** Equal-spacing guide segments to render (AFFiNE's magenta distribution guides), empty when no distribution match was found. */
  distributionGuides: DistributionGuideSegment[];
};

/**
 * Composes point/edge alignment (`computeSnapGuides`, existing) with the
 * ported equal-spacing "distribution" snap (`alignDistributeHorizontally`/
 * `alignDistributeVertically`) using AFFiNE's own priority rule: on a given
 * axis, point alignment wins if it produced a non-zero correction; the
 * distribution search only runs (and can win) on an axis whose alignment
 * delta is exactly 0 — see `affine-mining-map.md`'s Feature 8 note ("point
 * alignment beats distribution"). This mirrors upstream `SnapOverlay.align`,
 * which only invokes `_alignDistributeHorizontally`/`_alignDistributeVertically`
 * when the corresponding point-alignment axis found nothing.
 *
 * `threshold` is the already zoom-divided world-px snap radius (same value
 * passed to `computeSnapGuides`); `zoom` is passed through separately because
 * the distribution guides' tick-mark/line-offset rendering is defined in
 * world px divided by zoom (see `DISTRIBUTION_LINE_OFFSET` in
 * `snap-distribution.ts`).
 *
 * This is the function `stepFromMove`'s default (no-`ctx.snapResolver`) path
 * calls, and the exact function a host-supplied `ctx.snapResolver` should
 * wrap if it wants both alignment and distribution snapping composed
 * identically to the built-in default.
 */
export function computeSnapCorrection(
  moving: CanvasBounds,
  others: CanvasBounds[],
  threshold: number,
  zoom: number,
): DistributionSnapCorrection {
  const alignment = computeSnapGuides(moving, others, threshold);
  const candidates = nearestCandidates(moving, others);

  let dx = alignment.dx;
  let dy = alignment.dy;
  const distributionGuides: DistributionGuideSegment[] = [];

  if (alignment.dx === 0) {
    const horizontal = alignDistributeHorizontally(moving, candidates, threshold, zoom);
    if (horizontal.dx !== 0) {
      dx = horizontal.dx;
      distributionGuides.push(...horizontal.guides);
    }
  }

  if (alignment.dy === 0) {
    // Re-evaluate against the moving box as corrected by the X pass (matches
    // upstream, which threads the horizontal result's `alignRect` into the
    // vertical pass rather than snapping both axes against the original,
    // unshifted bounds).
    const movingForVertical: CanvasBounds = { ...moving, x: moving.x + dx };
    const vertical = alignDistributeVertically(movingForVertical, candidates, threshold, zoom);
    if (vertical.dy !== 0) {
      dy = vertical.dy;
      distributionGuides.push(...vertical.guides);
    }
  }

  return { dx, dy, guides: alignment.guides, distributionGuides };
}

function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && aEnd >= bStart;
}

function isRelevantForSpacing(moving: CanvasBounds, candidate: CanvasBounds, axis: Axis): boolean {
  if (axis === "x") {
    return rangesOverlap(moving.y, moving.y + moving.height, candidate.y, candidate.y + candidate.height);
  }
  return rangesOverlap(moving.x, moving.x + moving.width, candidate.x, candidate.x + candidate.width);
}

function nearEdge(bounds: CanvasBounds, axis: Axis): number {
  return axis === "x" ? bounds.x : bounds.y;
}

function farEdge(bounds: CanvasBounds, axis: Axis): number {
  return axis === "x" ? bounds.x + bounds.width : bounds.y + bounds.height;
}

function gapsEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= SPACING_EPSILON;
}

/**
 * Perpendicular-axis position for a gap's chip: the midpoint of the overlap
 * between the two bounds flanking the gap, falling back to the midpoint of
 * their union when they don't overlap on the cross axis.
 */
function crossPosition(prev: CanvasBounds, next: CanvasBounds, axis: Axis): number {
  const a = perpendicularSpan(prev, axis);
  const b = perpendicularSpan(next, axis);
  const start = Math.max(a.start, b.start);
  const end = Math.min(a.end, b.end);
  if (start <= end) return (start + end) / 2;
  return (Math.min(a.start, b.start) + Math.max(a.end, b.end)) / 2;
}

export function computeSpacingHints(
  moving: CanvasBounds,
  others: CanvasBounds[],
  axis: Axis,
): SpacingHint[] {
  const candidates = nearestCandidates(moving, others).filter((candidate) =>
    isRelevantForSpacing(moving, candidate, axis),
  );
  const sorted = [...candidates, moving].sort((a, b) => nearEdge(a, axis) - nearEdge(b, axis));
  const movingIndex = sorted.indexOf(moving);
  const gaps: Array<{
    index: number;
    start: number;
    end: number;
    cross: number;
    gap: number;
    touchesMoving: boolean;
  }> = [];

  for (let index = 0; index < sorted.length - 1; index += 1) {
    const prev = sorted[index]!;
    const next = sorted[index + 1]!;
    const start = farEdge(prev, axis);
    const end = nearEdge(next, axis);
    const gap = end - start;
    if (gap < 0) continue;
    gaps.push({
      index,
      start,
      end,
      cross: crossPosition(prev, next, axis),
      gap,
      touchesMoving: index === movingIndex || index + 1 === movingIndex,
    });
  }

  const hints: SpacingHint[] = [];

  // Practical FigJam-style anchor: equal-gap hints are emitted only when an
  // equal run includes a gap directly before or after the moving object.
  for (let index = 0; index < gaps.length; ) {
    const group = [gaps[index]!];
    let nextIndex = index + 1;
    while (nextIndex < gaps.length && gaps[nextIndex]!.index === gaps[nextIndex - 1]!.index + 1 && gapsEqual(gaps[nextIndex]!.gap, group[0]!.gap)) {
      group.push(gaps[nextIndex]!);
      nextIndex += 1;
    }

    if (group.length >= 2 && group.some((gap) => gap.touchesMoving)) {
      hints.push({
        axis,
        segments: group.map((gap) => ({ start: gap.start, end: gap.end, cross: gap.cross })),
        gap: group[0]!.gap,
      });
    }

    index = nextIndex;
  }

  return hints;
}

export function isGridAligned(value: number, gridSize = CANVAS_GRID_SIZE): boolean {
  return Math.abs(value - Math.round(value / gridSize) * gridSize) <= GRID_EPSILON;
}

/**
 * PD5 grid fallback demotion. Hard grid snap only applies when drag started
 * grid-aligned; otherwise round to clean integers so objects avoid sub-pixel drift.
 */
export function applyGridFallback(
  value: number,
  matched: boolean,
  dragStartedGridAligned: boolean,
  gridSize = CANVAS_GRID_SIZE,
): number {
  if (matched) return value;
  if (dragStartedGridAligned) return Math.round(value / gridSize) * gridSize;
  return Math.round(value);
}
