"use client";

import type { CanvasPoint } from "../state/geometry";

export const BEND_SIMPLIFY_TOLERANCE_PX = 4;
export const BEND_SNAP_TOLERANCE_SCREEN_PX = 8;

const AXIS_EPSILON = 0.01;

export type BendSegmentAxis = "horizontal" | "vertical";

export type ConnectorBendSegment = {
  index: number;
  start: CanvasPoint;
  end: CanvasPoint;
  midpoint: CanvasPoint;
  handlePoint: CanvasPoint;
  axis: BendSegmentAxis;
};

export type ConnectorBendSegmentsOptions = {
  labelPoint?: CanvasPoint | null;
  labelClearancePx?: number;
};

export type BendCommit = {
  points: CanvasPoint[];
  waypoints?: Array<[number, number]>;
  interiorCornerCount: number;
  clearedWaypoints: boolean;
};

export type BendDragOptions = {
  snapTolerance?: number;
  simplifyTolerance?: number;
};

export function bendSnapToleranceForZoom(zoom: number): number {
  return BEND_SNAP_TOLERANCE_SCREEN_PX / safeZoom(zoom);
}

export function bendSimplifyToleranceForZoom(zoom: number): number {
  return Math.max(BEND_SIMPLIFY_TOLERANCE_PX, bendSnapToleranceForZoom(zoom));
}

export function connectorBendSegments(
  points: ReadonlyArray<CanvasPoint>,
  options: ConnectorBendSegmentsOptions = {},
): ConnectorBendSegment[] {
  const segments: ConnectorBendSegment[] = [];
  const labelSegmentIndex =
    options.labelPoint ? segmentIndexContainingPoint(points, options.labelPoint) : null;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const axis = segmentAxis(start, end);
    if (!axis) continue;
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    segments.push({
      index,
      start,
      end,
      midpoint,
      handlePoint: index === labelSegmentIndex
        ? bendHandlePointAwayFromLabel(start, end, options.labelPoint!, options.labelClearancePx)
        : midpoint,
      axis,
    });
  }
  return segments;
}

export function dragOrthogonalSegment(
  points: ReadonlyArray<CanvasPoint>,
  segmentIndex: number,
  delta: { dx: number; dy: number },
  options: BendDragOptions = {},
): CanvasPoint[] {
  const axis = segmentAxis(points[segmentIndex], points[segmentIndex + 1]);
  if (!axis) return clonePoints(points);

  const offset = axis === "horizontal" ? delta.dy : delta.dx;
  const lastIndex = points.length - 1;
  if (lastIndex < 1 || segmentIndex < 0 || segmentIndex >= lastIndex) {
    return clonePoints(points);
  }
  if (Math.abs(offset) <= AXIS_EPSILON) return clonePoints(points);

  const snapped = snapDraggedSegment(points, segmentIndex, axis, offset, options);
  if (snapped) return snapped;

  return dragTranslatedSegment(points, segmentIndex, axis, offset);
}

function dragTranslatedSegment(
  points: ReadonlyArray<CanvasPoint>,
  segmentIndex: number,
  axis: BendSegmentAxis,
  offset: number,
): CanvasPoint[] {
  const lastIndex = points.length - 1;

  if (lastIndex === 1) {
    return dragDirectSegment(points[0], points[1], axis, offset);
  }

  if (segmentIndex === 0) {
    return dragStartStub(points, axis, offset);
  }

  if (segmentIndex === lastIndex - 1) {
    return dragEndStub(points, axis, offset);
  }

  const movedStart = offsetPoint(points[segmentIndex], axis, offset);
  const movedEnd = offsetPoint(points[segmentIndex + 1], axis, offset);
  const previousIsCollinear = segmentAxis(points[segmentIndex - 1], points[segmentIndex]) === axis;
  const nextIsCollinear = segmentAxis(points[segmentIndex + 1], points[segmentIndex + 2]) === axis;

  return [
    ...clonePoints(points.slice(0, segmentIndex)),
    ...(previousIsCollinear ? [clonePoint(points[segmentIndex])] : []),
    movedStart,
    movedEnd,
    ...(nextIsCollinear ? [clonePoint(points[segmentIndex + 1])] : []),
    ...clonePoints(points.slice(segmentIndex + 2)),
  ];
}

export function simplifyOrthogonalPolyline(
  points: ReadonlyArray<CanvasPoint>,
  tolerance = BEND_SIMPLIFY_TOLERANCE_PX,
): CanvasPoint[] {
  let simplified = compactDegenerateSegments(clonePoints(points), tolerance);
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
    simplified = compactDegenerateSegments(next, tolerance);
  }

  return orthogonalizePolyline(simplified);
}

export function commitBendPolyline(
  points: ReadonlyArray<CanvasPoint>,
  tolerance = BEND_SIMPLIFY_TOLERANCE_PX,
): BendCommit {
  const simplified = simplifyOrthogonalPolyline(points, tolerance);
  const interiorCornerCount = countInteriorCorners(simplified);
  const clearedWaypoints = isStraightRun(simplified, tolerance);
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
  const movedEnd = offsetPoint(points[1], axis, offset);
  const nextIsCollinear = segmentAxis(points[1], points[2]) === axis;
  if (axis === "horizontal") {
    return [
      start,
      { x: start.x, y: movedEnd.y },
      movedEnd,
      ...(nextIsCollinear ? [clonePoint(points[1])] : []),
      ...clonePoints(points.slice(2)),
    ];
  }
  return [
    start,
    { x: movedEnd.x, y: start.y },
    movedEnd,
    ...(nextIsCollinear ? [clonePoint(points[1])] : []),
    ...clonePoints(points.slice(2)),
  ];
}

function dragEndStub(
  points: ReadonlyArray<CanvasPoint>,
  axis: BendSegmentAxis,
  offset: number,
): CanvasPoint[] {
  const last = clonePoint(points[points.length - 1]);
  const movedStartIndex = points.length - 2;
  const movedStart = offsetPoint(points[movedStartIndex], axis, offset);
  const previousIsCollinear = segmentAxis(points[movedStartIndex - 1], points[movedStartIndex]) === axis;
  if (axis === "horizontal") {
    return [
      ...clonePoints(points.slice(0, -2)),
      ...(previousIsCollinear ? [clonePoint(points[movedStartIndex])] : []),
      movedStart,
      { x: last.x, y: movedStart.y },
      last,
    ];
  }
  return [
    ...clonePoints(points.slice(0, -2)),
    ...(previousIsCollinear ? [clonePoint(points[movedStartIndex])] : []),
    movedStart,
    { x: movedStart.x, y: last.y },
    last,
  ];
}

function offsetPoint(
  point: CanvasPoint,
  axis: BendSegmentAxis,
  offset: number,
): CanvasPoint {
  return axis === "horizontal"
    ? { ...point, y: point.y + offset }
    : { ...point, x: point.x + offset };
}

function snapDraggedSegment(
  points: ReadonlyArray<CanvasPoint>,
  segmentIndex: number,
  axis: BendSegmentAxis,
  offset: number,
  options: BendDragOptions,
): CanvasPoint[] | null {
  const tolerance = options.snapTolerance;
  if (!tolerance || tolerance <= 0) return null;

  const startAxisPosition = segmentAxisPosition(points, segmentIndex, axis);
  const currentAxisPosition = startAxisPosition + offset;
  const simplifyTolerance = options.simplifyTolerance ?? tolerance;
  const previousSegment = sameOrientationSegment(points, segmentIndex, axis, -1);
  if (previousSegment !== null) {
    const target = segmentAxisPosition(points, previousSegment, axis);
    if (Math.abs(currentAxisPosition - target) <= tolerance) {
      return simplifyOrthogonalPolyline(
        dragTranslatedSegment(points, segmentIndex, axis, target - startAxisPosition),
        simplifyTolerance,
      );
    }
  }

  const nextSegment = sameOrientationSegment(points, segmentIndex, axis, 1);
  if (nextSegment !== null) {
    const target = segmentAxisPosition(points, nextSegment, axis);
    if (Math.abs(currentAxisPosition - target) <= tolerance) {
      return simplifyOrthogonalPolyline(
        dragTranslatedSegment(points, segmentIndex, axis, target - startAxisPosition),
        simplifyTolerance,
      );
    }
  }

  const straightAxisPosition = endpointStraightAxisPosition(points, axis, tolerance);
  if (
    straightAxisPosition !== null &&
    Math.abs(currentAxisPosition - straightAxisPosition) <= tolerance
  ) {
    return [clonePoint(points[0]), clonePoint(points[points.length - 1])];
  }

  return null;
}

function sameOrientationSegment(
  points: ReadonlyArray<CanvasPoint>,
  segmentIndex: number,
  axis: BendSegmentAxis,
  direction: -1 | 1,
): number | null {
  for (
    let index = segmentIndex + direction;
    index >= 0 && index < points.length - 1;
    index += direction
  ) {
    if (segmentAxis(points[index], points[index + 1]) === axis) return index;
  }
  return null;
}

function segmentAxisPosition(
  points: ReadonlyArray<CanvasPoint>,
  segmentIndex: number,
  axis: BendSegmentAxis,
): number {
  const start = points[segmentIndex];
  const end = points[segmentIndex + 1];
  return axis === "horizontal"
    ? (start.y + end.y) / 2
    : (start.x + end.x) / 2;
}

function endpointStraightAxisPosition(
  points: ReadonlyArray<CanvasPoint>,
  axis: BendSegmentAxis,
  tolerance: number,
): number | null {
  const start = points[0];
  const end = points[points.length - 1];
  const startPosition = axis === "horizontal" ? start.y : start.x;
  const endPosition = axis === "horizontal" ? end.y : end.x;
  if (Math.abs(startPosition - endPosition) > tolerance) return null;
  return (startPosition + endPosition) / 2;
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

function compactDegenerateSegments(points: CanvasPoint[], tolerance: number): CanvasPoint[] {
  const collapsed = collapseShortSegments(
    normalizeNearlyOrthogonalSegments(clonePoints(points), tolerance),
    tolerance,
  );
  return normalizeNearlyOrthogonalSegments(removeNearDuplicatePoints(collapsed, tolerance), tolerance);
}

function collapseShortSegments(points: CanvasPoint[], tolerance: number): CanvasPoint[] {
  const result = clonePoints(points);
  let index = 0;
  while (index < result.length - 1) {
    if (result.length <= 2) break;
    if (distance(result[index], result[index + 1]) <= tolerance) {
      const removeIndex = index === result.length - 2 ? index : index + 1;
      removePointAndSnapJoin(result, removeIndex, tolerance);
      index = Math.max(0, index - 1);
      continue;
    }
    index += 1;
  }
  return result;
}

function removePointAndSnapJoin(points: CanvasPoint[], removeIndex: number, tolerance: number): void {
  const previous = points[removeIndex - 1];
  const next = points[removeIndex + 1];
  if (previous && next) {
    if (Math.abs(previous.x - next.x) <= tolerance) {
      if (removeIndex + 1 < points.length - 1) {
        points[removeIndex + 1] = { ...next, x: previous.x };
      } else if (removeIndex - 1 > 0) {
        points[removeIndex - 1] = { ...previous, x: next.x };
      }
    } else if (Math.abs(previous.y - next.y) <= tolerance) {
      if (removeIndex + 1 < points.length - 1) {
        points[removeIndex + 1] = { ...next, y: previous.y };
      } else if (removeIndex - 1 > 0) {
        points[removeIndex - 1] = { ...previous, y: next.y };
      }
    }
  }
  points.splice(removeIndex, 1);
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

function isStraightRun(points: ReadonlyArray<CanvasPoint>, tolerance: number): boolean {
  if (points.length <= 2) return true;
  const start = points[0];
  const end = points[points.length - 1];
  if (!isOrthogonalSegment(start, end, AXIS_EPSILON)) return false;
  return points.slice(1, -1).every((point) => distanceToSegment(point, start, end) <= tolerance);
}

function orthogonalizePolyline(points: ReadonlyArray<CanvasPoint>): CanvasPoint[] {
  const first = points[0];
  if (!first) return [];

  const result: CanvasPoint[] = [clonePoint(first)];
  for (let index = 1; index < points.length; index += 1) {
    const current = points[index];
    const previous = result[result.length - 1];
    if (isOrthogonalSegment(previous, current, AXIS_EPSILON)) {
      pushDistinctPoint(result, current);
      continue;
    }

    const followingAxis = segmentAxis(current, points[index + 1]);
    const previousAxis = result.length >= 2
      ? segmentAxis(result[result.length - 2], previous)
      : null;
    const joint = followingAxis === "horizontal" || previousAxis === "horizontal"
      ? { x: current.x, y: previous.y }
      : { x: previous.x, y: current.y };
    pushDistinctPoint(result, joint);
    pushDistinctPoint(result, current);
  }
  return result;
}

function isOrthogonalSegment(
  start: CanvasPoint,
  end: CanvasPoint,
  tolerance: number,
): boolean {
  return Math.abs(end.x - start.x) <= tolerance || Math.abs(end.y - start.y) <= tolerance;
}

function pushDistinctPoint(points: CanvasPoint[], point: CanvasPoint): void {
  const previous = points[points.length - 1];
  if (previous && distance(previous, point) <= AXIS_EPSILON) return;
  points.push(clonePoint(point));
}

function distanceToSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= AXIS_EPSILON) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return distance(point, projection);
}

function segmentIndexContainingPoint(
  points: ReadonlyArray<CanvasPoint>,
  point: CanvasPoint,
): number | null {
  let closestIndex: number | null = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const axis = segmentAxis(start, end);
    if (!axis) continue;

    const segmentLength = distance(start, end);
    if (segmentLength <= AXIS_EPSILON) continue;
    const distanceFromSegment = distanceToSegment(point, start, end);
    if (distanceFromSegment > AXIS_EPSILON || distanceFromSegment >= closestDistance) continue;

    closestDistance = distanceFromSegment;
    closestIndex = index;
  }

  return closestIndex;
}

function bendHandlePointAwayFromLabel(
  start: CanvasPoint,
  end: CanvasPoint,
  labelPoint: CanvasPoint,
  labelClearancePx = 24,
): CanvasPoint {
  const segmentLength = distance(start, end);
  if (segmentLength < 48) {
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }

  const preferred = [0.25, 0.75].map((t) => pointAlongSegment(start, end, t));
  const preferredPoint = fartherFromLabel(preferred[0], preferred[1], labelPoint);
  if (distance(preferredPoint, labelPoint) >= labelClearancePx) return preferredPoint;

  const labelT = segmentParameterForPoint(start, end, labelPoint);
  const clearanceT = Math.min(0.5, labelClearancePx / segmentLength);
  const clearanceCandidates = [
    pointAlongSegment(start, end, Math.max(0, labelT - clearanceT)),
    pointAlongSegment(start, end, Math.min(1, labelT + clearanceT)),
  ];
  return fartherFromLabel(clearanceCandidates[0], clearanceCandidates[1], labelPoint);
}

function pointAlongSegment(start: CanvasPoint, end: CanvasPoint, t: number): CanvasPoint {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
  };
}

function segmentParameterForPoint(start: CanvasPoint, end: CanvasPoint, point: CanvasPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= AXIS_EPSILON) return 0.5;
  return Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
}

function fartherFromLabel(a: CanvasPoint, b: CanvasPoint, labelPoint: CanvasPoint): CanvasPoint {
  return distance(a, labelPoint) >= distance(b, labelPoint) ? a : b;
}

function safeZoom(zoom: number): number {
  return Number.isFinite(zoom) && zoom > AXIS_EPSILON ? zoom : 1;
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
