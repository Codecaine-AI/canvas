/**
 * Ported (not verbatim) from BlockSuite.
 *
 * Upstream source: packages/affine/gfx/connector/src/connector-manager.ts
 * License: MPL-2.0 (see ./NOTICE for details)
 *
 * This file extracts only the pure, framework-free orthogonal
 * path-generation logic from `connector-manager.ts` — the `PathGenerator`
 * class and its private helpers (`computeOffset`,
 * `computeNextStartEndpoint`, `getNextPoint`, `computePoints`,
 * `getConnectablePoints`, `pushOuterPoints`, `pushBoundMidPoint`,
 * `pushGapMidPoint`, `pushLineIntersectsToPoints`, `pushWithPriority`,
 * `removeDulicatePoints`, `downscalePrecision`, `filterConnectablePoints`,
 * `getDirectPath`, `mergePath`, `adjustStartEndPoint`). All Lit,
 * `@preact/signals-core`, `@blocksuite/std` (GfxController/GfxModel),
 * `@blocksuite/affine-model`, and rendering/overlay code (Overlay,
 * ConnectionOverlay, canvas ctx rendering, anchor/selection UI,
 * `ConnectorPathGenerator`) has been removed — this repo has no equivalent
 * of those and doesn't need them for pure route computation.
 *
 * The math/control-flow of the extracted functions is unchanged; only
 * `PointLocation`'s `.tangent` field (unused by orthogonal routing math)
 * was dropped in favor of plain `IVec`/`IVec3` tuples, and the
 * `BlockSuiteError` throws were replaced with plain `Error`.
 */

import { almostEqual, Bound, isOverlap, lineIntersects, Vec, type IVec, type IVec3 } from "./gfx-types";
import { AStarRunner } from "./a-star";

/** A plain rectangle obstacle the router should avoid crossing. */
export type OrthogonalObstacle = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type OrthogonalConnectorInput = {
  /** Bound of the object the route starts from, or null if unattached. */
  startBound: OrthogonalObstacle | null;
  /** Bound of the object the route ends at, or null if unattached. */
  endBound: OrthogonalObstacle | null;
  startPoint: IVec;
  endPoint: IVec;
  /** Additional obstacle rectangles to route around (besides start/end bounds). */
  obstacles?: OrthogonalObstacle[];
};

function downscalePrecision(point: IVec | IVec3): IVec3 {
  return [Number(point[0].toFixed(2)), Number(point[1].toFixed(2)), point[2] ?? 0];
}

function filterConnectablePoints<T extends IVec3 | IVec>(points: T[], bound: Bound | null): T[] {
  return points.filter(point => {
    if (!bound) return true;
    return !bound.isPointInBound([point[0], point[1]]);
  });
}

function pushWithPriority(points: number[][], vecs: IVec[], priority = 0) {
  points.push(...vecs.map(vec => [...vec, priority]));
}

function pushLineIntersectsToPoints(points: IVec3[], aLine: IVec[], bLine: IVec[], priority = 0) {
  const rst = lineIntersects(aLine[0]!, aLine[1]!, bLine[0]!, bLine[1]!, true);
  if (rst) {
    pushWithPriority(points, [rst], priority);
  }
}

function pushOuterPoints(
  points: IVec3[],
  expandStartBound: Bound,
  expandEndBound: Bound,
  outerBound: Bound,
) {
  if (expandStartBound && expandEndBound && outerBound) {
    pushWithPriority(points, outerBound.getVerticesAndMidpoints());
    pushWithPriority(points, [outerBound.center], 2);
    [
      expandStartBound.upperLine,
      expandStartBound.horizontalLine,
      expandStartBound.lowerLine,
      expandEndBound.upperLine,
      expandEndBound.horizontalLine,
      expandEndBound.lowerLine,
    ].forEach(line => {
      pushLineIntersectsToPoints(points, line, outerBound.leftLine, 0);
      pushLineIntersectsToPoints(points, line, outerBound.rightLine, 0);
    });
    [
      expandStartBound.leftLine,
      expandStartBound.verticalLine,
      expandStartBound.rightLine,
      expandEndBound.leftLine,
      expandEndBound.verticalLine,
      expandEndBound.rightLine,
    ].forEach(line => {
      pushLineIntersectsToPoints(points, line, outerBound.upperLine, 0);
      pushLineIntersectsToPoints(points, line, outerBound.lowerLine, 0);
    });
  }
}

function pushBoundMidPoint(
  points: IVec3[],
  bound1: Bound,
  bound2: Bound,
  expandBound1: Bound,
  expandBound2: Bound,
) {
  if (bound1.maxX < bound2.x) {
    const midX = (bound1.maxX + bound2.x) / 2;
    [
      expandBound1.horizontalLine,
      expandBound2.horizontalLine,
      expandBound1.upperLine,
      expandBound1.lowerLine,
      expandBound2.upperLine,
      expandBound2.lowerLine,
    ].forEach((line, index) => {
      pushLineIntersectsToPoints(
        points,
        line,
        [
          [midX, 0],
          [midX, 1],
        ],
        index === 0 || index === 1 ? 6 : 3,
      );
    });
  }
  if (bound1.maxY < bound2.y) {
    const midY = (bound1.maxY + bound2.y) / 2;
    [
      expandBound1.verticalLine,
      expandBound2.verticalLine,
      expandBound1.leftLine,
      expandBound1.rightLine,
      expandBound2.leftLine,
      expandBound2.rightLine,
    ].forEach((line, index) => {
      pushLineIntersectsToPoints(
        points,
        line,
        [
          [0, midY],
          [1, midY],
        ],
        index === 0 || index === 1 ? 6 : 3,
      );
    });
  }
}

function pushGapMidPoint(
  points: IVec3[],
  point: IVec3,
  bound: Bound,
  bound2: Bound,
  expandBound: Bound,
  expandBound2: Bound,
) {
  /** on top or on bottom */
  if (almostEqual(point[1], bound.y, 0.02) || almostEqual(point[1], bound.maxY, 0.02)) {
    const rst = [bound.upperLine, bound.lowerLine, bound2.upperLine, bound2.lowerLine]
      .map(line => {
        return lineIntersects([point[0], point[1]], [point[0], point[1] + 1], line[0]!, line[1]!, true);
      })
      .filter((p): p is IVec => p !== null);
    rst.sort((a, b) => a[1] - b[1]);
    if (rst.length < 3) return;
    const midPoint = Vec.lrp(rst[1]!, rst[2]!, 0.5);
    pushWithPriority(points, [midPoint], 6);
    [expandBound.leftLine, expandBound.rightLine, expandBound2.leftLine, expandBound2.rightLine].forEach(
      line => {
        pushLineIntersectsToPoints(points, [midPoint, [midPoint[0] + 1, midPoint[1]]], line, 0);
      },
    );
  } else {
    const rst = [bound.leftLine, bound.rightLine, bound2.leftLine, bound2.rightLine]
      .map(line => {
        return lineIntersects([point[0], point[1]], [point[0] + 1, point[1]], line[0]!, line[1]!, true);
      })
      .filter((p): p is IVec => p !== null);
    rst.sort((a, b) => a[0] - b[0]);
    if (rst.length < 3) return;
    const midPoint = Vec.lrp(rst[1]!, rst[2]!, 0.5);
    pushWithPriority(points, [midPoint], 6);
    [expandBound.upperLine, expandBound.lowerLine, expandBound2.upperLine, expandBound2.lowerLine].forEach(
      line => {
        pushLineIntersectsToPoints(points, [midPoint, [midPoint[0], midPoint[1] + 1]], line, 0);
      },
    );
  }
}

function removeDulicatePoints(points: (IVec | IVec3)[]): IVec3[] {
  let downscaled = points.map(downscalePrecision);
  downscaled.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < downscaled.length - 1; i++) {
    const cur = downscaled[i]!;
    const last = downscaled[i - 1]!;
    if (almostEqual(cur[0], last[0], 0.02)) {
      cur[0] = last[0];
    }
  }
  downscaled.sort((a, b) => a[1] - b[1]);
  for (let i = 1; i < downscaled.length - 1; i++) {
    const cur = downscaled[i]!;
    const last = downscaled[i - 1]!;
    if (almostEqual(cur[1], last[1], 0.02)) {
      cur[1] = last[1];
    }
  }
  downscaled.sort((a, b) => {
    if (a[0] < b[0]) return -1;
    if (a[0] > b[0]) return 1;
    if (a[1] < b[1]) return -1;
    if (a[1] > b[1]) return 1;
    return 0;
  });
  for (let i = 1; i < downscaled.length; i++) {
    const cur = downscaled[i]!;
    const last = downscaled[i - 1]!;
    if (almostEqual(cur[0], last[0], 0.02) && almostEqual(cur[1], last[1], 0.02)) {
      if (cur[2] <= last[2]) downscaled.splice(i, 1);
      else downscaled.splice(i - 1, 1);
      i--;
      continue;
    }
  }
  return downscaled;
}

function getConnectablePoints(
  startPoint: IVec3,
  endPoint: IVec3,
  nextStartPoint: IVec3,
  lastEndPoint: IVec3,
  startBound: Bound | null,
  endBound: Bound | null,
  expandStartBound: Bound | null,
  expandEndBound: Bound | null,
  extraObstacleBounds: Bound[] = [],
) {
  const lineBound = Bound.fromPoints([
    [startPoint[0], startPoint[1]],
    [endPoint[0], endPoint[1]],
  ]);
  const outerBound = expandStartBound && expandEndBound && expandStartBound.unite(expandEndBound);
  let points: (IVec | IVec3)[] = [nextStartPoint, lastEndPoint];
  pushWithPriority(points, lineBound.getVerticesAndMidpoints());

  if (!startBound || !endBound) {
    pushWithPriority(points, [lineBound.center], 3);
  }
  if (outerBound) {
    pushOuterPoints(points as IVec3[], expandStartBound!, expandEndBound!, outerBound);
  }

  if (startBound && endBound && expandStartBound && expandEndBound) {
    pushGapMidPoint(points as IVec3[], startPoint, startBound, endBound, expandStartBound, expandEndBound);
    pushGapMidPoint(points as IVec3[], endPoint, endBound, startBound, expandEndBound, expandStartBound);
    pushBoundMidPoint(points as IVec3[], startBound, endBound, expandStartBound, expandEndBound);
    pushBoundMidPoint(points as IVec3[], endBound, startBound, expandEndBound, expandStartBound);
  }

  if (expandStartBound) {
    pushWithPriority(points, expandStartBound.getVerticesAndMidpoints());
    pushWithPriority(points, expandStartBound.include([lastEndPoint[0], lastEndPoint[1]]).points);
  }

  if (expandEndBound) {
    pushWithPriority(points, expandEndBound.getVerticesAndMidpoints());
    pushWithPriority(points, expandEndBound.include([nextStartPoint[0], nextStartPoint[1]]).points);
  }

  // Extra (non-endpoint) obstacles: seed their expanded vertices/midpoints as
  // candidate waypoints too, and cross them against the outer bound / line
  // bound so A* has concrete grid points on either side of the obstacle to
  // hop through (mirrors how `pushOuterPoints` derives waypoints for the
  // start/end bounds themselves).
  for (const obstacleBound of extraObstacleBounds) {
    pushWithPriority(points, obstacleBound.getVerticesAndMidpoints());
    if (outerBound) {
      [obstacleBound.upperLine, obstacleBound.horizontalLine, obstacleBound.lowerLine].forEach(line => {
        pushLineIntersectsToPoints(points as IVec3[], line, outerBound.leftLine, 0);
        pushLineIntersectsToPoints(points as IVec3[], line, outerBound.rightLine, 0);
      });
      [obstacleBound.leftLine, obstacleBound.verticalLine, obstacleBound.rightLine].forEach(line => {
        pushLineIntersectsToPoints(points as IVec3[], line, outerBound.upperLine, 0);
        pushLineIntersectsToPoints(points as IVec3[], line, outerBound.lowerLine, 0);
      });
    }
  }

  const deduped = removeDulicatePoints(points);

  const startEnds = [nextStartPoint, lastEndPoint].map(point => {
    return deduped.find(
      item => almostEqual(item[0], point[0], 0.02) && almostEqual(item[1], point[1], 0.02),
    );
  });
  if (!startEnds[0] || !startEnds[1]) {
    throw new Error("Failed to get start and end points when getting connectable points");
  }
  return { points: deduped, nextStartPoint: startEnds[0], lastEndPoint: startEnds[1] };
}

function computePoints(
  startPoint: IVec,
  endPoint: IVec,
  nextStartPoint: IVec,
  lastEndPoint: IVec,
  startBound: Bound | null,
  endBound: Bound | null,
  expandStartBound: Bound | null,
  expandEndBound: Bound | null,
  expandObstacleBounds: Bound[] = [],
  rawObstacleBounds: Bound[] = [],
): [IVec3[], IVec3, IVec3, IVec3, IVec3] {
  const startPointVec3 = downscalePrecision(startPoint);
  const endPointVec3 = downscalePrecision(endPoint);
  let nextStartPointVec3 = downscalePrecision(nextStartPoint);
  let lastEndPointVec3 = downscalePrecision(lastEndPoint);

  const result = getConnectablePoints(
    startPointVec3,
    endPointVec3,
    nextStartPointVec3,
    lastEndPointVec3,
    startBound,
    endBound,
    expandStartBound,
    expandEndBound,
    expandObstacleBounds,
  );
  const points = result.points;
  nextStartPointVec3 = result.nextStartPoint;
  lastEndPointVec3 = result.lastEndPoint;
  let finalPoints = filterConnectablePoints(
    filterConnectablePoints(points, expandStartBound?.expand(-1) ?? null),
    expandEndBound?.expand(-1) ?? null,
  );
  // Filter against the *raw* obstacle bound (not its expanded margin) so
  // points sitting in the 20px buffer zone around an obstacle — including
  // ones `pullOutOfObstacles` deliberately placed right on the obstacle's
  // edge — survive as usable A* waypoints; only points strictly inside the
  // obstacle's own interior are excluded.
  for (const obstacleBound of rawObstacleBounds) {
    finalPoints = filterConnectablePoints(finalPoints, obstacleBound.expand(-1));
  }
  return [finalPoints, startPointVec3, endPointVec3, nextStartPointVec3, lastEndPointVec3];
}

function getDirectPath(startPoint: IVec, endPoint: IVec): IVec[] {
  if (almostEqual(startPoint[0], endPoint[0], 0.02) || almostEqual(startPoint[1], endPoint[1], 0.02)) {
    return [startPoint, endPoint];
  } else {
    const vec = Vec.sub(endPoint, startPoint);
    const mid: IVec = [startPoint[0], startPoint[1] + vec[1]];
    return [startPoint, mid, endPoint];
  }
}

function mergePath(points: (IVec | IVec3)[]): IVec[] {
  if (points.length === 0) return [];
  const result: IVec[] = [[points[0]![0], points[0]![1]]];
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i]!;
    const last = points[i - 1]!;
    const next = points[i + 1]!;
    if (almostEqual(last[0], cur[0], 0.02) && almostEqual(cur[0], next[0], 0.02)) continue;
    if (almostEqual(last[1], cur[1], 0.02) && almostEqual(cur[1], next[1], 0.02)) continue;
    result.push([cur[0], cur[1]]);
  }
  if (points.length !== 0) {
    const last = points[points.length - 1]!;
    result.push([last[0], last[1]]);
  }
  return result;
}

function computeOffset(startBound: Bound | null, endBound: Bound | null): [number[], number[]] {
  const startOffset = [20, 20, 20, 20];
  const endOffset = [20, 20, 20, 20];
  if (!(startBound && endBound)) {
    return [startOffset, endOffset];
  }
  // left, top, right, bottom
  let overlap = isOverlap(startBound.upperLine, endBound.lowerLine, 0, false);
  let dist: number;
  if (overlap && startBound.upperLine[0]![1] > endBound.lowerLine[0]![1]) {
    dist = distanceToLineSegment(startBound.upperLine[0]!, startBound.upperLine[1]!, endBound.lowerLine[0]!);
    startOffset[1] = Math.max(Math.min(dist / 2, startOffset[1]!), 0);
  }

  overlap = isOverlap(startBound.rightLine, endBound.leftLine, 1, false);
  if (overlap && startBound.rightLine[0]![0] < endBound.leftLine[0]![0]) {
    dist = distanceToLineSegment(startBound.rightLine[0]!, startBound.rightLine[1]!, endBound.leftLine[0]!);
    startOffset[2] = Math.max(Math.min(dist / 2, startOffset[2]!), 0);
  }

  overlap = isOverlap(startBound.lowerLine, endBound.upperLine, 0, false);
  if (overlap && startBound.lowerLine[0]![1] < endBound.upperLine[0]![1]) {
    dist = distanceToLineSegment(startBound.lowerLine[0]!, startBound.lowerLine[1]!, endBound.upperLine[0]!);
    startOffset[3] = Math.max(Math.min(dist / 2, startOffset[3]!), 0);
  }

  startOffset[0] = endOffset[2] =
    Math.min(startOffset[0]!, endOffset[2]!) === 0 ? 20 : Math.min(startOffset[0]!, endOffset[2]!);
  startOffset[1] = endOffset[3] =
    Math.min(startOffset[1]!, endOffset[3]!) === 0 ? 20 : Math.min(startOffset[1]!, endOffset[3]!);
  startOffset[2] = endOffset[0] =
    Math.min(startOffset[2]!, endOffset[0]!) === 0 ? 20 : Math.min(startOffset[2]!, endOffset[0]!);
  startOffset[3] = endOffset[1] =
    Math.min(startOffset[3]!, endOffset[1]!) === 0 ? 20 : Math.min(startOffset[3]!, endOffset[1]!);

  return [startOffset, endOffset];
}

/** Perpendicular distance from `point` to the (finite) segment [a, b]. */
function distanceToLineSegment(a: IVec, b: IVec, point: IVec): number {
  const ab = Vec.sub(b, a);
  const ap = Vec.sub(point, a);
  const lenSq = ab[0] * ab[0] + ab[1] * ab[1];
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1]) / lenSq));
  const projection: IVec = [a[0] + t * ab[0], a[1] + t * ab[1]];
  return Math.hypot(point[0] - projection[0], point[1] - projection[1]);
}

function getNextPoint(
  bound: Bound,
  point: IVec,
  tangent: IVec,
  offsetX = 10,
  offsetY = 10,
  offsetW = 10,
  offsetH = 10,
): IVec {
  const result: IVec = [point[0], point[1]];
  if (almostEqual(bound.x, result[0])) result[0] -= offsetX;
  else if (almostEqual(bound.y, result[1])) result[1] -= offsetY;
  else if (almostEqual(bound.maxX, result[0])) result[0] += offsetW;
  else if (almostEqual(bound.maxY, result[1])) result[1] += offsetH;
  else {
    const direction = normalize(Vec.sub(result, bound.center));
    const xDirection = direction[0] > 0 ? 1 : -1;
    const yDirection = direction[1] > 0 ? 1 : -1;

    const slope = Math.abs(tangent[0]) < Math.abs(tangent[1]) ? 0 : 1;
    // if the slope is big, use the x direction
    if (slope === 0) {
      if (xDirection > 0) {
        const intersects = lineIntersects(
          bound.rightLine[0]!,
          bound.rightLine[1]!,
          result,
          [bound.maxX + 10, result[1]],
        );
        if (!intersects) {
          throw new Error("Failed to get line intersections for getNextPoint");
        }
        result[0] = intersects[0] + offsetX;
      } else {
        const intersects = lineIntersects(
          bound.leftLine[0]!,
          bound.leftLine[1]!,
          result,
          [bound.x - 10, result[1]],
        );
        if (!intersects) {
          throw new Error("Failed to get line intersections for getNextPoint");
        }
        result[0] = intersects[0] - offsetX;
      }
    } else {
      if (yDirection > 0) {
        const intersects = lineIntersects(
          bound.lowerLine[0]!,
          bound.lowerLine[1]!,
          result,
          [result[0], bound.maxY + 10],
        );
        if (!intersects) {
          throw new Error("Failed to get line intersections for getNextPoint");
        }
        result[1] = intersects[1] + offsetY;
      } else {
        const intersects = lineIntersects(
          bound.upperLine[0]!,
          bound.upperLine[1]!,
          result,
          [result[0], bound.y - 10],
        );
        if (!intersects) {
          throw new Error("Failed to get line intersections for getNextPoint");
        }
        result[1] = intersects[1] - offsetY;
      }
    }
  }
  return result;
}

function normalize(v: IVec): IVec {
  const len = Math.hypot(v[0], v[1]);
  if (len === 0) return [0, 0];
  return [v[0] / len, v[1] / len];
}

function computeNextStartEndpoint(
  startPoint: IVec,
  endPoint: IVec,
  startTangent: IVec,
  endTangent: IVec,
  startBound: Bound | null,
  endBound: Bound | null,
  startOffset: number[] | null,
  endOffset: number[] | null,
) {
  const nextStartPoint =
    startBound && startOffset
      ? getNextPoint(
          startBound,
          startPoint,
          startTangent,
          startOffset[0],
          startOffset[1],
          startOffset[2],
          startOffset[3],
        )
      : startPoint;
  const lastEndPoint =
    endBound && endOffset
      ? getNextPoint(endBound, endPoint, endTangent, endOffset[0], endOffset[1], endOffset[2], endOffset[3])
      : endPoint;
  return [nextStartPoint, lastEndPoint];
}

function sign(n: number): number {
  return n < 0 ? -1 : n > 0 ? 1 : 0;
}

function adjustStartEndPoint(
  startPoint: IVec3,
  endPoint: IVec3,
  startBound: Bound | null = null,
  endBound: Bound | null = null,
) {
  if (!endBound) {
    if (Math.abs(endPoint[0] - startPoint[0]) > Math.abs(endPoint[1] - startPoint[1])) {
      endPoint[0] += sign(endPoint[0] - startPoint[0]) * 20;
    } else {
      endPoint[1] += sign(endPoint[1] - startPoint[1]) * 20;
    }
  }
  if (!startBound) {
    if (Math.abs(endPoint[0] - startPoint[0]) > Math.abs(endPoint[1] - startPoint[1])) {
      startPoint[0] -= sign(endPoint[0] - startPoint[0]) * 20;
    } else {
      startPoint[1] -= sign(endPoint[1] - startPoint[1]) * 20;
    }
  }
}

function toBound(obstacle: OrthogonalObstacle | null): Bound | null {
  return obstacle ? new Bound(obstacle.x, obstacle.y, obstacle.w, obstacle.h) : null;
}

/**
 * Clamps `offset` (the [left, top, right, bottom] anchor-offset amounts for
 * `bound`) so expanding `bound` by that offset never reaches past the near
 * edge of any bound in `obstacles`. Not part of upstream BlockSuite — see the
 * call site in `generateOrthogonalConnectorPath` for why this is needed once
 * third-party obstacles (not just the other endpoint bound) are involved:
 * without it, a fixed 20px offset can overshoot into an obstacle sitting
 * closer than 20px away, which then starves A* of a usable start/end vertex
 * (the overshot point lands inside the obstacle and gets filtered out).
 */
function clampOffsetsToObstacles(bound: Bound | null, offset: number[], obstacles: Bound[]): void {
  if (!bound) return;
  for (const obstacle of obstacles) {
    // left
    if (isOverlap(bound.leftLine, obstacle.rightLine, 1, false) && obstacle.rightLine[0]![0] < bound.leftLine[0]![0]) {
      const dist = distanceToLineSegment(bound.leftLine[0]!, bound.leftLine[1]!, obstacle.rightLine[0]!);
      offset[0] = Math.max(0, Math.min(offset[0]!, dist / 2));
    }
    // top
    if (isOverlap(bound.upperLine, obstacle.lowerLine, 0, false) && obstacle.lowerLine[0]![1] < bound.upperLine[0]![1]) {
      const dist = distanceToLineSegment(bound.upperLine[0]!, bound.upperLine[1]!, obstacle.lowerLine[0]!);
      offset[1] = Math.max(0, Math.min(offset[1]!, dist / 2));
    }
    // right
    if (isOverlap(bound.rightLine, obstacle.leftLine, 1, false) && bound.rightLine[0]![0] < obstacle.leftLine[0]![0]) {
      const dist = distanceToLineSegment(bound.rightLine[0]!, bound.rightLine[1]!, obstacle.leftLine[0]!);
      offset[2] = Math.max(0, Math.min(offset[2]!, dist / 2));
    }
    // bottom
    if (isOverlap(bound.lowerLine, obstacle.upperLine, 0, false) && bound.lowerLine[0]![1] < obstacle.upperLine[0]![1]) {
      const dist = distanceToLineSegment(bound.lowerLine[0]!, bound.lowerLine[1]!, obstacle.upperLine[0]!);
      offset[3] = Math.max(0, Math.min(offset[3]!, dist / 2));
    }
  }
}

/**
 * Pure orthogonal (Manhattan) path generator, ported from BlockSuite's
 * `PathGenerator` (see file header). Given a start/end point pair (each
 * optionally anchored to a bound) and a list of obstacle rectangles, returns
 * an ordered list of orthogonal waypoints from start to end that avoid
 * crossing the obstacles when possible.
 */
export class PathGenerator {
  /**
   * @param startTangent unit direction the route should leave `startPoint`
   *   along (e.g. [0,-1] for a "top" anchor). Defaults to a vector pointing
   *   away from the start bound's center, or toward the end point if there
   *   is no start bound.
   * @param endTangent unit direction the route should arrive at `endPoint`
   *   along. Same defaulting behavior as `startTangent`.
   */
  generateOrthogonalConnectorPath(
    input: OrthogonalConnectorInput,
    startTangent?: IVec,
    endTangent?: IVec,
  ): IVec[] {
    const startBound = toBound(input.startBound);
    const endBound = toBound(input.endBound);
    const startPoint = input.startPoint;
    const endPoint = input.endPoint;

    const resolvedStartTangent =
      startTangent ??
      (startBound ? normalize(Vec.sub(startPoint, startBound.center)) : normalize(Vec.sub(endPoint, startPoint)));
    const resolvedEndTangent =
      endTangent ??
      (endBound ? normalize(Vec.sub(endPoint, endBound.center)) : normalize(Vec.sub(startPoint, endPoint)));

    const obstacleBounds: Bound[] = (input.obstacles ?? []).map(
      obstacle => new Bound(obstacle.x, obstacle.y, obstacle.w, obstacle.h),
    );

    const [startOffset, endOffset] = computeOffset(startBound, endBound);
    // Extra (non-endpoint) obstacles — e.g. sibling canvas shapes the route
    // should detour around — can sit closer to `startBound`/`endBound` than
    // the default 20px anchor offset. Upstream's `computeOffset` only clamps
    // each side's offset against the *other* endpoint bound; clamp it against
    // nearby obstacles too so `expandStartBound`/`expandEndBound` (and the
    // `nextStartPoint`/`lastEndPoint` derived from the same offsets) don't
    // overshoot past an obstacle sitting in the gap.
    clampOffsetsToObstacles(startBound, startOffset, obstacleBounds);
    clampOffsetsToObstacles(endBound, endOffset, obstacleBounds);

    const [nextStartPoint, lastEndPoint] = computeNextStartEndpoint(
      startPoint,
      endPoint,
      resolvedStartTangent,
      resolvedEndTangent,
      startBound,
      endBound,
      startOffset,
      endOffset,
    );
    const expandStartBound = startBound
      ? startBound.expand(startOffset[0]!, startOffset[1]!, startOffset[2]!, startOffset[3]!)
      : null;
    const expandEndBound = endBound
      ? endBound.expand(endOffset[0]!, endOffset[1]!, endOffset[2]!, endOffset[3]!)
      : null;

    const blocks: Bound[] = [];
    const expandBlocks: Bound[] = [];
    if (startBound) blocks.push(startBound.clone());
    if (endBound) blocks.push(endBound.clone());
    if (expandStartBound) expandBlocks.push(expandStartBound.clone());
    if (expandEndBound) expandBlocks.push(expandEndBound.clone());
    // Unlike `startBound`/`endBound`, upstream never fed third-party
    // obstacles into `getConnectablePoints`'s candidate grid, so without help
    // the sparse point set generated purely from the two endpoint
    // bounds/line/outer-bound often has no grid point that actually routes
    // around an obstacle sitting between them (A* has no waypoint to hop
    // to). We: (1) still add each obstacle to `blocks` so AStarRunner's
    // edge-blocking rejects any hop that crosses it, and (2) additionally
    // expand each obstacle by a small margin and register it as an
    // `expandBlocks` entry *and* seed the candidate point set with its
    // expanded corners/midpoints, giving A* concrete waypoints to route
    // through when detouring.
    blocks.push(...obstacleBounds);
    const expandObstacleBounds = obstacleBounds.map(bound => bound.expand(20, 20, 20, 20));
    expandBlocks.push(...expandObstacleBounds);

    if (
      startBound &&
      endBound &&
      startBound.isPointInBound(endPoint) &&
      endBound.isPointInBound(startPoint)
    ) {
      return getDirectPath(startPoint, endPoint);
    }
    if (startBound && expandStartBound?.isPointInBound(endPoint, 0)) {
      return getDirectPath(startPoint, endPoint);
    }
    if (endBound && expandEndBound?.isPointInBound(startPoint, 0)) {
      return getDirectPath(startPoint, endPoint);
    }

    const computed = computePoints(
      startPoint,
      endPoint,
      nextStartPoint,
      lastEndPoint,
      startBound,
      endBound,
      expandStartBound,
      expandEndBound,
      expandObstacleBounds,
      obstacleBounds,
    );
    const finalPoints = computed[0];
    const [, startPointV3, endPointV3, nextStartPointV3, lastEndPointV3] = computed;

    adjustStartEndPoint(startPointV3, endPointV3, startBound, endBound);

    const runner = new AStarRunner(
      finalPoints,
      nextStartPointV3,
      lastEndPointV3,
      startPointV3,
      endPointV3,
      blocks,
      expandBlocks,
    );
    runner.run();
    const path = runner.path;
    if (!endBound) path.pop();
    if (!startBound) path.shift();

    return mergePath(path);
  }
}
