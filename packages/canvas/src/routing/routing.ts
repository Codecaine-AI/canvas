"use client";

import { centerOf, type CanvasBounds, type CanvasPoint } from "../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../state/schema";
import { connectionBoundsForObject, getConnectionAnchors, outlinePolygon } from "../objects/geometry";
import { PathGenerator, type OrthogonalObstacle } from "../vendor/blocksuite/path-generator";
// Connector routing figures (moved from theme/tokens.ts in the theme
// dispersal — this router is their consumer; the routing tests import them
// from here). Logical px.

/**
 * Elbow corner radius, logical px, on the stroke CENTERLINE (the correct
 * figure for our stroked-centerline path construction). Short segments clamp
 * it smaller — `roundedPolylinePath` already clamps to half the shorter
 * adjacent segment length — so this constant is a ceiling, not a fixed
 * radius.
 */
export const CONNECTOR_ELBOW_CORNER_RADIUS_PX = 21.5;

/**
 * Endpoint gap: connectors stop short of the target border rather than
 * touching it flush. A single figure is used for both plain and arrowhead
 * ends — splitting the two is left to a later wave if the difference reads
 * as necessary.
 */
export const CONNECTOR_END_GAP_PX = 10;

const MIN_STUB = 24;
/**
 * Elbow/polyline corner radius, world px. FigJam measures ~21.5 logical px
 * centerline radius on an unconstrained turn (theme/tokens.ts,
 * CONNECTOR_ELBOW_CORNER_RADIUS_PX) — `roundedPolylinePath` already clamps
 * this down to half the shorter adjacent segment length, so short segments
 * still get a sane (smaller) rounded corner instead of overshooting.
 */
const CORNER_RADIUS = CONNECTOR_ELBOW_CORNER_RADIUS_PX;
/**
 * Endpoints never touch the target border (theme/tokens.ts,
 * CONNECTOR_END_GAP_PX — 10px, between the measured 8px plain-end and 12px
 * arrowhead-tip gaps). Applied only to the *rendered* path's first/last
 * points — `RoutedConnection.start`/`.end` stay the true anchor points so
 * existing anchor-based consumers (endpoint-drag handles, label placement,
 * explicit-anchor assertions) are unaffected; the path is pulled back along
 * its own tangent at each end so it still visually aims at the anchor.
 */
const END_GAP = CONNECTOR_END_GAP_PX;
const AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX = 8;
const STRAIGHT_EDGE_MARGIN_PX = CONNECTOR_END_GAP_PX;
const ROUTE_EPSILON = 0.01;
const WAYPOINT_ORTHOGONAL_EPSILON_PX = 0.5;

export type Anchor = "top" | "right" | "bottom" | "left";

export type RoutedConnection = {
  path: string;
  start: CanvasPoint;
  end: CanvasPoint;
  labelPoint: CanvasPoint;
  startAnchor: Anchor;
  endAnchor: Anchor;
  /**
   * The route's world-space polyline vertices, start -> end. Interior entries
   * (all but first/last) are the elbow corners — used by CanvasStage's
   * bend-affordance stubs (W3b, render-only).
   */
  points?: CanvasPoint[];
};

/** Picks facing side anchors from relative object centers and overlapping spans. */
export function autoPickAnchors(
  fromBounds: CanvasBounds,
  toBounds: CanvasBounds,
): { startAnchor: Anchor; endAnchor: Anchor } {
  const fromCenter = centerOf(fromBounds);
  const toCenter = centerOf(toBounds);
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;
  const verticalOverlap = rangesOverlap(
    fromBounds.y,
    fromBounds.y + fromBounds.height,
    toBounds.y,
    toBounds.y + toBounds.height,
    AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX,
  );
  const horizontalOverlap = rangesOverlap(
    fromBounds.x,
    fromBounds.x + fromBounds.width,
    toBounds.x,
    toBounds.x + toBounds.width,
    AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX,
  );

  if (verticalOverlap && Math.abs(dx) > ROUTE_EPSILON) {
    return dx >= 0
      ? { startAnchor: "right", endAnchor: "left" }
      : { startAnchor: "left", endAnchor: "right" };
  }

  if (horizontalOverlap && Math.abs(dy) > ROUTE_EPSILON) {
    return dy >= 0
      ? { startAnchor: "bottom", endAnchor: "top" }
      : { startAnchor: "top", endAnchor: "bottom" };
  }

  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { startAnchor: "right", endAnchor: "left" }
      : { startAnchor: "left", endAnchor: "right" };
  }

  return dy >= 0
    ? { startAnchor: "bottom", endAnchor: "top" }
    : { startAnchor: "top", endAnchor: "bottom" };
}

function rangesOverlap(
  startA: number,
  endA: number,
  startB: number,
  endB: number,
  tolerance: number,
): boolean {
  return startA <= endB + tolerance && startB <= endA + tolerance;
}

/**
 * Routes a connection between two object border midpoints.
 *
 * `obstacles` is optional: pass the current document's objects (typically all
 * of them — the two endpoints and their section ancestors are excluded
 * automatically) so routes detour around unrelated shapes when a simple
 * facing route would cross one. Omitting it keeps the pre-existing 3-arg
 * behavior without sibling detours.
 */
export function routeConnection(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  connection: InteractiveCanvasConnection,
  obstacles?: ReadonlyArray<InteractiveCanvasObject>,
): RoutedConnection {
  const fromBounds = connectionBoundsForObject(fromObject);
  const toBounds = connectionBoundsForObject(toObject);
  const pickedAnchors = autoPickAnchors(fromBounds, toBounds);
  const startAnchor = explicitAnchor(connection.from.anchor) ?? pickedAnchors.startAnchor;
  const endAnchor = explicitAnchor(connection.to.anchor) ?? pickedAnchors.endAnchor;
  const start = pointForObjectPosition(fromObject, connection.from.position) ?? pointForObjectAnchor(fromObject, startAnchor);
  const end = pointForObjectPosition(toObject, connection.to.position) ?? pointForObjectAnchor(toObject, endAnchor);

  const explicitWaypoints = validWaypoints(connection.waypoints);
  if (explicitWaypoints) {
    const waypointRoute = routeWaypoints(start, end, explicitWaypoints, startAnchor, endAnchor);
    if (waypointRoute) return waypointRoute;
  }

  const extraObstacleBounds = routingObstacleBounds(
    fromObject,
    toObject,
    start,
    end,
    obstacles ?? [],
  );
  const straight = routeStraightIfAligned(
    fromObject,
    toObject,
    start,
    end,
    startAnchor,
    endAnchor,
    extraObstacleBounds,
  );
  if (straight) return straight;

  const elbow = routeElbow(start, end, startAnchor, endAnchor);
  if (!polylineCrossesObstacles(elbow.points ?? [], extraObstacleBounds)) return elbow;

  const orthogonal = routeOrthogonalAStar(
    fromObject,
    toObject,
    start,
    end,
    startAnchor,
    endAnchor,
    extraObstacleBounds,
  );
  if (orthogonal) return orthogonal;
  return elbow;
}

/**
 * Cheap live-preview route from a fixed object side to a free world point.
 *
 * This intentionally avoids the A* obstacle pass so connector-create pointer
 * frames stay light, but it reuses the same rounded/end-gap path construction
 * as real connectors.
 */
export function routeConnectionToPoint(
  fromObject: InteractiveCanvasObject,
  fromAnchor: Anchor,
  point: CanvasPoint,
): RoutedConnection {
  const start = pointForObjectAnchor(fromObject, fromAnchor);
  const endAnchor = freePointEndAnchor(start, point);

  if (isStraightFromAnchorToPoint(start, point, fromAnchor)) {
    return routedConnectionFromPoints([start, point], start, point, fromAnchor, endAnchor);
  }

  return routeFreePointElbow(start, point, fromAnchor, endAnchor);
}

/** Returns the relative-position anchor point for `bounds`, or null when `position` is absent. */
function pointForPosition(bounds: CanvasBounds, position?: [number, number]): CanvasPoint | null {
  if (!position) return null;
  const [rx, ry] = position;
  return { x: bounds.x + rx * bounds.width, y: bounds.y + ry * bounds.height };
}

function pointForObjectPosition(
  object: InteractiveCanvasObject,
  position?: [number, number],
): CanvasPoint | null {
  return pointForPosition(connectionBoundsForObject(object), position);
}

/** Validates a connection's `waypoints` are a usable (2+) polyline; returns null otherwise. */
function validWaypoints(
  waypoints: InteractiveCanvasConnection["waypoints"],
): CanvasPoint[] | null {
  if (!waypoints || waypoints.length < 1) return null;
  return waypoints.map(([x, y]) => ({ x, y }));
}

/** Builds a RoutedConnection from an explicit start -> waypoints -> end polyline. */
function routeWaypoints(
  start: CanvasPoint,
  end: CanvasPoint,
  waypoints: CanvasPoint[],
  startAnchor: Anchor,
  endAnchor: Anchor,
): RoutedConnection | null {
  const points = dedupeConsecutivePoints([start, ...waypoints, end]);
  if (!isOrthogonalPolyline(points, WAYPOINT_ORTHOGONAL_EPSILON_PX)) return null;
  return routedConnectionFromPoints(points, start, end, startAnchor, endAnchor);
}

function isOrthogonalPolyline(points: ReadonlyArray<CanvasPoint>, epsilon: number): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);
    if (dx > epsilon && dy > epsilon) return false;
  }
  return true;
}

/**
 * Attempts an obstacle-avoiding orthogonal route via the vendored BlockSuite
 * A* path generator (D33 thread B). The caller passes already-filtered extra
 * obstacle bounds; the endpoint bounds are still supplied separately so the
 * generated route does not cut through either owner shape.
 * Returns null (letting the caller fall back to the simple elbow route) when
 * the generator can't produce a usable multi-point path.
 */
function routeOrthogonalAStar(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
  extraObstacleBounds: ReadonlyArray<CanvasBounds>,
): RoutedConnection | null {
  const extraObstacles = extraObstacleBounds.map(toObstacle);

  let waypoints: Array<[number, number]>;
  try {
    const generator = new PathGenerator();
    waypoints = generator.generateOrthogonalConnectorPath(
      {
        startBound: toObstacle(connectionBoundsForObject(fromObject)),
        endBound: toObstacle(connectionBoundsForObject(toObject)),
        startPoint: [start.x, start.y],
        endPoint: [end.x, end.y],
        obstacles: extraObstacles,
      },
      normalForVec(startAnchor),
      normalForVec(endAnchor),
    );
  } catch {
    return null;
  }

  if (waypoints.length < 2) return null;

  const points = dedupeConsecutivePoints(waypoints.map(([x, y]) => ({ x, y })));
  if (points.length < 2) return null;
  const straightPoints = isNearStraightPolyline(points, AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX)
    ? exactStraightAnchoredPoints(
        fromObject,
        toObject,
        start,
        end,
        startAnchor,
        endAnchor,
        AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX,
      )
    : null;
  const routedPoints = straightPoints ?? points;
  const routedStart = routedPoints[0]!;
  const routedEnd = routedPoints[routedPoints.length - 1]!;

  return routedConnectionFromPoints(routedPoints, routedStart, routedEnd, startAnchor, endAnchor);
}

function routingObstacleBounds(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
): CanvasBounds[] {
  const excludedIds = new Set<string>([fromObject.id, toObject.id]);
  collectAncestorIds(fromObject.id, excludedIds, obstacles);
  collectAncestorIds(toObject.id, excludedIds, obstacles);

  return obstacles
    .filter(
      (object) =>
        !excludedIds.has(object.id) &&
        !boundsStrictlyContain(connectionBoundsForObject(object), start) &&
        !boundsStrictlyContain(connectionBoundsForObject(object), end),
    )
    .map((object) => connectionBoundsForObject(object));
}

function routeStraightIfAligned(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
  obstacleBounds: ReadonlyArray<CanvasBounds>,
): RoutedConnection | null {
  const points = exactStraightAnchoredPoints(
    fromObject,
    toObject,
    start,
    end,
    startAnchor,
    endAnchor,
    AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX,
  );
  if (!points) return null;

  if (polylineCrossesObstacles(points, obstacleBounds)) return null;
  return routedConnectionFromPoints(points, points[0], points[1], startAnchor, endAnchor);
}

function exactStraightAnchoredPoints(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
  tolerance: number,
): [CanvasPoint, CanvasPoint] | null {
  const axis = straightRouteAxis(start, end, tolerance);
  if (!axis || !anchorsFaceAlongAxis(start, end, startAnchor, endAnchor, axis)) return null;

  const startSpan = edgeSlideSpan(fromObject, startAnchor);
  const endSpan = edgeSlideSpan(toObject, endAnchor);
  if (!startSpan || !endSpan) return null;

  const overlapMin = Math.max(startSpan.min, endSpan.min);
  const overlapMax = Math.min(startSpan.max, endSpan.max);
  if (overlapMin > overlapMax + ROUTE_EPSILON) return null;

  if (axis === "horizontal") {
    const averageY = (start.y + end.y) / 2;
    const y = clamp(averageY, overlapMin, overlapMax);
    return [
      { x: startSpan.fixed, y },
      { x: endSpan.fixed, y },
    ];
  }

  const averageX = (start.x + end.x) / 2;
  const x = clamp(averageX, overlapMin, overlapMax);
  return [
    { x, y: startSpan.fixed },
    { x, y: endSpan.fixed },
  ];
}

type EdgeSlideSpan = {
  fixed: number;
  min: number;
  max: number;
};

function edgeSlideSpan(
  object: InteractiveCanvasObject,
  anchor: Anchor,
): EdgeSlideSpan | null {
  const bounds = connectionBoundsForObject(object);
  const polygon = outlinePolygon(object);
  const fixed = edgeFixedCoordinate(bounds, anchor);
  const slideCoordinate = isHorizontalAnchor(anchor) ? "y" : "x";
  let min = Infinity;
  let max = -Infinity;

  for (let index = 0; index < polygon.length; index += 1) {
    const a = polygon[index]!;
    const b = polygon[(index + 1) % polygon.length]!;
    if (!segmentLiesOnAnchorEdge(a, b, anchor, fixed)) continue;

    const aSlide = a[slideCoordinate];
    const bSlide = b[slideCoordinate];
    min = Math.min(min, aSlide, bSlide);
    max = Math.max(max, aSlide, bSlide);
  }

  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min <= ROUTE_EPSILON) {
    return null;
  }

  const margin = Math.min(STRAIGHT_EDGE_MARGIN_PX, (max - min) / 2);
  return {
    fixed,
    min: min + margin,
    max: max - margin,
  };
}

function edgeFixedCoordinate(bounds: CanvasBounds, anchor: Anchor): number {
  if (anchor === "left") return bounds.x;
  if (anchor === "right") return bounds.x + bounds.width;
  if (anchor === "top") return bounds.y;
  return bounds.y + bounds.height;
}

function segmentLiesOnAnchorEdge(
  a: CanvasPoint,
  b: CanvasPoint,
  anchor: Anchor,
  fixed: number,
): boolean {
  if (isHorizontalAnchor(anchor)) {
    return (
      Math.abs(a.x - fixed) <= ROUTE_EPSILON &&
      Math.abs(b.x - fixed) <= ROUTE_EPSILON &&
      Math.abs(a.y - b.y) > ROUTE_EPSILON
    );
  }
  return (
    Math.abs(a.y - fixed) <= ROUTE_EPSILON &&
    Math.abs(b.y - fixed) <= ROUTE_EPSILON &&
    Math.abs(a.x - b.x) > ROUTE_EPSILON
  );
}

function straightRouteAxis(
  start: CanvasPoint,
  end: CanvasPoint,
  tolerance: number,
): "horizontal" | "vertical" | null {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  if (dy <= tolerance && dx > ROUTE_EPSILON) return "horizontal";
  if (dx <= tolerance && dy > ROUTE_EPSILON) return "vertical";
  return null;
}

function anchorsFaceAlongAxis(
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
  axis: "horizontal" | "vertical",
): boolean {
  if (axis === "horizontal") {
    return end.x >= start.x
      ? startAnchor === "right" && endAnchor === "left"
      : startAnchor === "left" && endAnchor === "right";
  }
  return end.y >= start.y
    ? startAnchor === "bottom" && endAnchor === "top"
    : startAnchor === "top" && endAnchor === "bottom";
}

function isNearStraightPolyline(points: ReadonlyArray<CanvasPoint>, tolerance: number): boolean {
  if (points.length <= 2) return true;
  const start = points[0];
  const end = points[points.length - 1];
  return points.slice(1, -1).every((point) => distanceToSegment(point, start, end) <= tolerance);
}

function polylineCrossesObstacles(
  points: ReadonlyArray<CanvasPoint>,
  obstacleBounds: ReadonlyArray<CanvasBounds>,
): boolean {
  if (points.length < 2 || obstacleBounds.length === 0) return false;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    for (const bounds of obstacleBounds) {
      if (segmentCrossesInterior(start, end, bounds)) return true;
    }
  }
  return false;
}

function segmentCrossesInterior(
  start: CanvasPoint,
  end: CanvasPoint,
  bounds: CanvasBounds,
  epsilon = 0.5,
): boolean {
  const left = bounds.x + epsilon;
  const right = bounds.x + bounds.width - epsilon;
  const top = bounds.y + epsilon;
  const bottom = bounds.y + bounds.height - epsilon;
  if (left >= right || top >= bottom) return false;

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  let t0 = 0;
  let t1 = 1;

  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) <= ROUTE_EPSILON) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };

  return (
    clip(-dx, start.x - left) &&
    clip(dx, right - start.x) &&
    clip(-dy, start.y - top) &&
    clip(dy, bottom - start.y) &&
    t1 > ROUTE_EPSILON &&
    t0 < 1 - ROUTE_EPSILON
  );
}

function routedConnectionFromPoints(
  points: CanvasPoint[],
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
): RoutedConnection {
  return {
    path: roundedPolylinePath(points),
    start,
    end,
    labelPoint: polylineHalfwayPoint(points),
    startAnchor,
    endAnchor,
    points,
  };
}

function toObstacle(bounds: CanvasBounds): OrthogonalObstacle {
  return { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height };
}

/** Whether `point` lies strictly inside `bounds` (border contact does not count). */
function boundsStrictlyContain(bounds: CanvasBounds, point: CanvasPoint): boolean {
  return (
    point.x > bounds.x &&
    point.x < bounds.x + bounds.width &&
    point.y > bounds.y &&
    point.y < bounds.y + bounds.height
  );
}

/** Walks `objects`' parent chain from `objectId` upward, adding each ancestor id to `into`. */
function collectAncestorIds(
  objectId: string,
  into: Set<string>,
  objects: ReadonlyArray<InteractiveCanvasObject>,
): void {
  const byId = new Map(objects.map((object) => [object.id, object]));
  let current = byId.get(objectId)?.parentId ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    into.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
}

function normalForVec(anchor: Anchor): [number, number] {
  const normal = normalFor(anchor);
  return [normal.x, normal.y];
}

function explicitAnchor(anchor: InteractiveCanvasConnection["from"]["anchor"]): Anchor | null {
  if (anchor === "top" || anchor === "right" || anchor === "bottom" || anchor === "left") {
    return anchor;
  }
  return null;
}

export function pointForAnchor(bounds: CanvasBounds, anchor: Anchor): CanvasPoint {
  if (anchor === "top") return { x: bounds.x + bounds.width / 2, y: bounds.y };
  if (anchor === "right") return { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 };
  if (anchor === "bottom") return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height };
  return { x: bounds.x, y: bounds.y + bounds.height / 2 };
}

export function pointForObjectAnchor(
  object: InteractiveCanvasObject,
  anchor: Anchor,
): CanvasPoint {
  const anchors = getConnectionAnchors(object);
  if (anchor === "top") return anchors[0]?.point ?? pointForAnchor(connectionBoundsForObject(object), anchor);
  if (anchor === "bottom") return anchors[1]?.point ?? pointForAnchor(connectionBoundsForObject(object), anchor);
  if (anchor === "left") return anchors[2]?.point ?? pointForAnchor(connectionBoundsForObject(object), anchor);
  return anchors[3]?.point ?? pointForAnchor(connectionBoundsForObject(object), anchor);
}

/** The four side-anchor points for a bounds, in a stable ["top","right","bottom","left"] order. */
export function anchorPoints(bounds: CanvasBounds): Record<Anchor, CanvasPoint> {
  return {
    top: pointForAnchor(bounds, "top"),
    right: pointForAnchor(bounds, "right"),
    bottom: pointForAnchor(bounds, "bottom"),
    left: pointForAnchor(bounds, "left"),
  };
}

/** Picks the side anchor of `bounds` whose border midpoint is closest to `point`. */
export function nearestAnchor(bounds: CanvasBounds, point: CanvasPoint): Anchor {
  const points = anchorPoints(bounds);
  let closest: Anchor = "top";
  let closestDistance = Infinity;
  for (const anchor of ["top", "right", "bottom", "left"] as Anchor[]) {
    const candidate = points[anchor];
    const d = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (d < closestDistance) {
      closestDistance = d;
      closest = anchor;
    }
  }
  return closest;
}

export function nearestObjectAnchor(
  object: InteractiveCanvasObject,
  point: CanvasPoint,
): Anchor {
  const anchors = getConnectionAnchors(object);
  const entries: Array<[Anchor, CanvasPoint | undefined]> = [
    ["top", anchors[0]?.point],
    ["bottom", anchors[1]?.point],
    ["left", anchors[2]?.point],
    ["right", anchors[3]?.point],
  ];
  let closest: Anchor = "top";
  let closestDistance = Infinity;
  for (const [anchor, candidate] of entries) {
    if (!candidate) continue;
    const d = Math.hypot(candidate.x - point.x, candidate.y - point.y);
    if (d < closestDistance) {
      closestDistance = d;
      closest = anchor;
    }
  }
  return closest;
}

function normalFor(anchor: Anchor): CanvasPoint {
  if (anchor === "top") return { x: 0, y: -1 };
  if (anchor === "right") return { x: 1, y: 0 };
  if (anchor === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function addScaled(point: CanvasPoint, normal: CanvasPoint, distance: number): CanvasPoint {
  return { x: point.x + normal.x * distance, y: point.y + normal.y * distance };
}

function routeElbow(
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
): RoutedConnection {
  const stubStart = addScaled(start, normalFor(startAnchor), MIN_STUB);
  const stubEnd = addScaled(end, normalFor(endAnchor), MIN_STUB);
  const corners = elbowCorners(stubStart, stubEnd, startAnchor, endAnchor);
  const points = dedupeConsecutivePoints([start, stubStart, ...corners, stubEnd, end]);

  return routedConnectionFromPoints(points, start, end, startAnchor, endAnchor);
}

function routeFreePointElbow(
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
): RoutedConnection {
  const stubStart = addScaled(start, normalFor(startAnchor), MIN_STUB);
  const stubEnd = addScaled(end, normalFor(endAnchor), MIN_STUB);
  const corners = elbowCorners(stubStart, stubEnd, startAnchor, endAnchor);
  const points = collapseShortReversingRuns(
    dedupeConsecutivePoints([start, stubStart, ...corners, stubEnd, end]),
  );

  return routedConnectionFromPoints(points, start, end, startAnchor, endAnchor);
}

function collapseShortReversingRuns(points: CanvasPoint[]): CanvasPoint[] {
  const result = [...points];
  let index = 1;
  while (index < result.length - 1) {
    const previous = result[index - 1]!;
    const current = result[index]!;
    const next = result[index + 1]!;
    const incoming = { x: current.x - previous.x, y: current.y - previous.y };
    const outgoing = { x: next.x - current.x, y: next.y - current.y };
    const cross = incoming.x * outgoing.y - incoming.y * outgoing.x;
    const dot = incoming.x * outgoing.x + incoming.y * outgoing.y;

    if (Math.abs(cross) > ROUTE_EPSILON || dot >= -ROUTE_EPSILON) {
      index += 1;
      continue;
    }

    const incomingLength = Math.hypot(incoming.x, incoming.y);
    const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
    const segmentCount = result.length - 1;
    const effectiveIncomingLength =
      index - 1 === 0 ? Math.max(0, incomingLength - END_GAP) : incomingLength;
    const effectiveOutgoingLength =
      index === segmentCount - 1 ? Math.max(0, outgoingLength - END_GAP) : outgoingLength;

    if (
      Math.min(effectiveIncomingLength, effectiveOutgoingLength) >
      CORNER_RADIUS + ROUTE_EPSILON
    ) {
      index += 1;
      continue;
    }

    result.splice(index, 1);
    const deduped = dedupeConsecutivePoints(result);
    result.length = 0;
    result.push(...deduped);
    index = Math.max(1, index - 1);
  }
  return result;
}

function freePointEndAnchor(start: CanvasPoint, end: CanvasPoint): Anchor {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? "left" : "right";
  return dy >= 0 ? "top" : "bottom";
}

function isStraightFromAnchorToPoint(
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
): boolean {
  if (isHorizontalAnchor(startAnchor)) {
    if (Math.abs(start.y - end.y) > ROUTE_EPSILON) return false;
    return end.x >= start.x ? startAnchor === "right" : startAnchor === "left";
  }

  if (Math.abs(start.x - end.x) > ROUTE_EPSILON) return false;
  return end.y >= start.y ? startAnchor === "bottom" : startAnchor === "top";
}

function elbowCorners(
  stubStart: CanvasPoint,
  stubEnd: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
): CanvasPoint[] {
  const startHorizontal = isHorizontalAnchor(startAnchor);
  const endHorizontal = isHorizontalAnchor(endAnchor);

  if (startHorizontal && endHorizontal) {
    if (stubStart.y === stubEnd.y) return [];
    const midX = (stubStart.x + stubEnd.x) / 2;
    return [
      { x: midX, y: stubStart.y },
      { x: midX, y: stubEnd.y },
    ];
  }

  if (!startHorizontal && !endHorizontal) {
    if (stubStart.x === stubEnd.x) return [];
    const midY = (stubStart.y + stubEnd.y) / 2;
    return [
      { x: stubStart.x, y: midY },
      { x: stubEnd.x, y: midY },
    ];
  }

  return startHorizontal
    ? [{ x: stubEnd.x, y: stubStart.y }]
    : [{ x: stubStart.x, y: stubEnd.y }];
}

function isHorizontalAnchor(anchor: Anchor): boolean {
  return anchor === "left" || anchor === "right";
}

/**
 * Builds the rendered SVG path from a polyline, rounding interior corners and
 * pulling the first/last points back by END_GAP along their own segment's
 * tangent — FigJam connectors never touch the target border (theme/tokens.ts
 * CONNECTOR_END_GAP_PX). The pullback only affects the drawn path: the caller
 * still receives the true anchor points in `RoutedConnection.start`/`.end`,
 * so the connector still visually aims directly at the anchor, it just stops
 * short of it.
 */
function roundedPolylinePath(points: CanvasPoint[]): string {
  if (points.length < 2) {
    const point = points[0] ?? { x: 0, y: 0 };
    return `M ${point.x} ${point.y}`;
  }

  const renderPoints = withEndGap(points);
  const firstPoint = renderPoints[0];

  let path = `M ${firstPoint.x} ${firstPoint.y}`;
  for (let index = 1; index < renderPoints.length - 1; index += 1) {
    const previous = renderPoints[index - 1];
    const corner = renderPoints[index];
    const next = renderPoints[index + 1];
    const radius = Math.min(CORNER_RADIUS, distance(previous, corner) / 2, distance(corner, next) / 2);

    if (radius <= 0) {
      path += ` L ${corner.x} ${corner.y}`;
      continue;
    }

    const enterPoint = pointToward(corner, previous, radius);
    const exitPoint = pointToward(corner, next, radius);
    path += ` L ${enterPoint.x} ${enterPoint.y} Q ${corner.x} ${corner.y} ${exitPoint.x} ${exitPoint.y}`;
  }

  const end = renderPoints[renderPoints.length - 1];
  return `${path} L ${end.x} ${end.y}`;
}

/**
 * Returns a copy of `points` with the first and last points pulled back by
 * END_GAP toward their neighbor (i.e. shortened along the path's own
 * tangent). Falls back to the original point when the adjacent segment is
 * degenerate (zero length) or shorter than the gap itself (keeps at least a
 * hairline-visible stub rather than collapsing/inverting the segment).
 */
function withEndGap(points: CanvasPoint[]): CanvasPoint[] {
  if (points.length < 2) return points;
  const result = [...points];
  const first = result[0];
  const afterFirst = result[1];
  const last = result[result.length - 1];
  const beforeLast = result[result.length - 2];

  const startSegmentLength = distance(first, afterFirst);
  const endSegmentLength = distance(beforeLast, last);
  const startGap = Math.min(END_GAP, startSegmentLength / 2);
  const endGap = Math.min(END_GAP, endSegmentLength / 2);

  result[0] = pointToward(first, afterFirst, startGap);
  result[result.length - 1] = pointToward(last, beforeLast, endGap);
  return result;
}

function pointToward(from: CanvasPoint, to: CanvasPoint, length: number): CanvasPoint {
  const segmentLength = distance(from, to);
  if (segmentLength === 0) return from;
  const scale = length / segmentLength;
  return {
    x: from.x + (to.x - from.x) * scale,
    y: from.y + (to.y - from.y) * scale,
  };
}

function polylineHalfwayPoint(points: CanvasPoint[]): CanvasPoint {
  const segments = [];
  let totalLength = 0;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = distance(start, end);
    if (length === 0) continue;
    totalLength += length;
    segments.push({ start, end, length });
  }

  if (segments.length === 0) return points[0] ?? { x: 0, y: 0 };

  const halfwayLength = totalLength / 2;
  let traveled = 0;
  for (const segment of segments) {
    if (traveled + segment.length >= halfwayLength) {
      const distanceIntoSegment = halfwayLength - traveled;
      return pointToward(segment.start, segment.end, distanceIntoSegment);
    }
    traveled += segment.length;
  }

  const finalSegment = segments[segments.length - 1];
  return finalSegment.end;
}

function dedupeConsecutivePoints(points: CanvasPoint[]): CanvasPoint[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceToSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= ROUTE_EPSILON) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return distance(point, {
    x: start.x + t * dx,
    y: start.y + t * dy,
  });
}

function distance(a: CanvasPoint, b: CanvasPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}
