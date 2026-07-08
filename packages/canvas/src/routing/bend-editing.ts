"use client";

import type { CanvasPoint } from "../state/geometry";

export const BEND_SIMPLIFY_TOLERANCE_PX = 4;

const AXIS_EPSILON = 0.01;

export type BendSegmentAxis = "horizontal" | "vertical";

export type ConnectorBendSegment = {
  index: number;
  start: CanvasPoint;
  end: CanvasPoint;
  midpoint: CanvasPoint;
  axis: BendSegmentAxis;
};

export type BendCommit = {
  points: CanvasPoint[];
  waypoints?: Array<[number, number]>;
  interiorCornerCount: number;
  clearedWaypoints: boolean;
};

export function connectorBendSegments(points: ReadonlyArray<CanvasPoint>): ConnectorBendSegment[] {
  const segments: ConnectorBendSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const axis = segmentAxis(start, end);
    if (!axis) continue;
    segments.push({
      index,
      start,
      end,
      midpoint: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 },
      axis,
    });
  }
  return segments;
}

export function dragOrthogonalSegment(
  points: ReadonlyArray<CanvasPoint>,
  segmentIndex: number,
  delta: { dx: number; dy: number },
): CanvasPoint[] {
  const axis = segmentAxis(points[segmentIndex], points[segmentIndex + 1]);
  if (!axis) return clonePoints(points);

  const offset = axis === "horizontal" ? delta.dy : delta.dx;
  const lastIndex = points.length - 1;
  if (lastIndex < 1 || segmentIndex < 0 || segmentIndex >= lastIndex) {
    return clonePoints(points);
  }
  if (Math.abs(offset) <= AXIS_EPSILON) return clonePoints(points);

  if (lastIndex === 1) {
    return dragDirectSegment(points[0], points[1], axis, offset);
  }

  if (segmentIndex === 0) {
    return dragStartStub(points, axis, offset);
  }

  if (segmentIndex === lastIndex - 1) {
    return dragEndStub(points, axis, offset);
  }

  const next = clonePoints(points);
  if (axis === "horizontal") {
    next[segmentIndex] = { ...next[segmentIndex], y: next[segmentIndex].y + offset };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], y: next[segmentIndex + 1].y + offset };
  } else {
    next[segmentIndex] = { ...next[segmentIndex], x: next[segmentIndex].x + offset };
    next[segmentIndex + 1] = { ...next[segmentIndex + 1], x: next[segmentIndex + 1].x + offset };
  }
  return next;
}

export function simplifyOrthogonalPolyline(
  points: ReadonlyArray<CanvasPoint>,
  tolerance = BEND_SIMPLIFY_TOLERANCE_PX,
): CanvasPoint[] {
  let simplified = normalizeNearlyOrthogonalSegments(removeNearDuplicatePoints(clonePoints(points), tolerance), tolerance);
  let changed = true;

  while (changed) {
    changed = false;
    const next: CanvasPoint[] = [];
    for (let index = 0; index < simplified.length; index += 1) {
      const previous = next[next.length - 1];
      const current = simplified[index];
      const following = simplified[index + 1];

      if (previous && distance(previous, current) <= tolerance) {
        changed = true;
        continue;
      }

      if (
        previous &&
        following &&
        areCollinear(previous, current, following, tolerance) &&
        snapCollinearCollapse(next, simplified, index + 1, previous, following, tolerance)
      ) {
        changed = true;
        continue;
      }

      next.push(current);
    }
    simplified = normalizeNearlyOrthogonalSegments(removeNearDuplicatePoints(next, tolerance), tolerance);
  }

  return simplified;
}

export function commitBendPolyline(points: ReadonlyArray<CanvasPoint>): BendCommit {
  const simplified = simplifyOrthogonalPolyline(points);
  const interiorCornerCount = countInteriorCorners(simplified);
  const clearedWaypoints = interiorCornerCount < 2;
  return {
    points: simplified,
    interiorCornerCount,
    clearedWaypoints,
    ...(clearedWaypoints ? {} : { waypoints: polylineInteriorWaypoints(simplified) }),
  };
}

export function polylineInteriorWaypoints(
  points: ReadonlyArray<CanvasPoint>,
): Array<[number, number]> {
  return points.slice(1, -1).map((point) => [point.x, point.y] as [number, number]);
}

export function polylinesAlmostEqual(
  a: ReadonlyArray<CanvasPoint>,
  b: ReadonlyArray<CanvasPoint>,
  tolerance = AXIS_EPSILON,
): boolean {
  if (a.length !== b.length) return false;
  return a.every((point, index) => distance(point, b[index]) <= tolerance);
}

function dragDirectSegment(
  start: CanvasPoint,
  end: CanvasPoint,
  axis: BendSegmentAxis,
  offset: number,
): CanvasPoint[] {
  if (axis === "horizontal") {
    const y = start.y + offset;
    return [clonePoint(start), { x: start.x, y }, { x: end.x, y }, clonePoint(end)];
  }
  const x = start.x + offset;
  return [clonePoint(start), { x, y: start.y }, { x, y: end.y }, clonePoint(end)];
}

function dragStartStub(
  points: ReadonlyArray<CanvasPoint>,
  axis: BendSegmentAxis,
  offset: number,
): CanvasPoint[] {
  const start = clonePoint(points[0]);
  const movedEnd = clonePoint(points[1]);
  if (axis === "horizontal") {
    movedEnd.y += offset;
    return [start, { x: start.x, y: movedEnd.y }, movedEnd, ...clonePoints(points.slice(2))];
  }
  movedEnd.x += offset;
  return [start, { x: movedEnd.x, y: start.y }, movedEnd, ...clonePoints(points.slice(2))];
}

function dragEndStub(
  points: ReadonlyArray<CanvasPoint>,
  axis: BendSegmentAxis,
  offset: number,
): CanvasPoint[] {
  const last = clonePoint(points[points.length - 1]);
  const movedStart = clonePoint(points[points.length - 2]);
  if (axis === "horizontal") {
    movedStart.y += offset;
    return [...clonePoints(points.slice(0, -2)), movedStart, { x: last.x, y: movedStart.y }, last];
  }
  movedStart.x += offset;
  return [...clonePoints(points.slice(0, -2)), movedStart, { x: movedStart.x, y: last.y }, last];
}

function countInteriorCorners(points: ReadonlyArray<CanvasPoint>): number {
  let corners = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const incoming = segmentAxis(points[index - 1], points[index]);
    const outgoing = segmentAxis(points[index], points[index + 1]);
    if (incoming && outgoing && incoming !== outgoing) corners += 1;
  }
  return corners;
}

function segmentAxis(
  start: CanvasPoint | undefined,
  end: CanvasPoint | undefined,
): BendSegmentAxis | null {
  if (!start || !end) return null;
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dx <= AXIS_EPSILON && dy <= AXIS_EPSILON) return null;
  if (dy <= AXIS_EPSILON) return "horizontal";
  if (dx <= AXIS_EPSILON) return "vertical";
  return null;
}

function areCollinear(
  a: CanvasPoint,
  b: CanvasPoint,
  c: CanvasPoint,
  tolerance: number,
): boolean {
  const horizontal = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) <= tolerance;
  const vertical = Math.max(a.x, b.x, c.x) - Math.min(a.x, b.x, c.x) <= tolerance;
  return horizontal || vertical;
}

function snapCollinearCollapse(
  next: CanvasPoint[],
  points: CanvasPoint[],
  followingIndex: number,
  previous: CanvasPoint,
  following: CanvasPoint,
  tolerance: number,
): boolean {
  const previousIndex = next.length - 1;
  const horizontal = Math.max(previous.y, following.y) - Math.min(previous.y, following.y) <= tolerance;
  const vertical = Math.max(previous.x, following.x) - Math.min(previous.x, following.x) <= tolerance;
  if (horizontal) {
    if (followingIndex < points.length - 1) {
      points[followingIndex] = { ...following, y: previous.y };
      return true;
    }
    if (previousIndex > 0) {
      next[previousIndex] = { ...previous, y: following.y };
      return true;
    }
    return Math.abs(previous.y - following.y) <= AXIS_EPSILON;
  }
  if (vertical) {
    if (followingIndex < points.length - 1) {
      points[followingIndex] = { ...following, x: previous.x };
      return true;
    }
    if (previousIndex > 0) {
      next[previousIndex] = { ...previous, x: following.x };
      return true;
    }
    return Math.abs(previous.x - following.x) <= AXIS_EPSILON;
  }
  return false;
}

function normalizeNearlyOrthogonalSegments(points: CanvasPoint[], tolerance: number): CanvasPoint[] {
  const result = clonePoints(points);
  const lastIndex = result.length - 1;
  for (let index = 0; index < result.length - 1; index += 1) {
    const start = result[index];
    const end = result[index + 1];
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);

    if (index === 0 && index + 1 === lastIndex) continue;

    if (dx <= tolerance && dy > tolerance) {
      if (index + 1 === lastIndex) {
        result[index] = { ...start, x: end.x };
      } else {
        result[index + 1] = { ...end, x: start.x };
      }
    } else if (dy <= tolerance && dx > tolerance) {
      if (index + 1 === lastIndex) {
        result[index] = { ...start, y: end.y };
      } else {
        result[index + 1] = { ...end, y: start.y };
      }
    }
  }
  return result;
}

function removeNearDuplicatePoints(points: CanvasPoint[], tolerance: number): CanvasPoint[] {
  const result: CanvasPoint[] = [];
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = result[result.length - 1];
    if (previous && distance(previous, point) <= tolerance) {
      if (index === points.length - 1 && result.length > 1) {
        result[result.length - 1] = point;
      }
      continue;
    }
    result.push(point);
  }
  return result;
}

function clonePoints(points: ReadonlyArray<CanvasPoint>): CanvasPoint[] {
  return points.map(clonePoint);
}

function clonePoint(point: CanvasPoint): CanvasPoint {
  return { x: point.x, y: point.y };
}

function distance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
