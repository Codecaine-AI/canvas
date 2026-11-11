"use client";

/**
 * Connector routing helpers build orthogonal SVG paths, endpoint gaps, labels,
 * and anchor picks for canvas connections.
 */
import { centerOf, type CanvasBounds, type CanvasPoint } from "../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../state/schema";
import type { Anchor } from "../state/schema/connections";
import {
  captionBandBounds,
  connectionBoundsForObject,
  getConnectionAnchors,
  hitBoundsForObject,
  outlinePolygon,
} from "../objects/geometry";
import { PathGenerator, type OrthogonalObstacle } from "./pathfinding/path-generator";
import { DEFAULT_CANVAS_STYLE, type CanvasStyle } from "../theme/canvas-style";
// Connector routing figures (moved from theme/tokens.ts in the theme
// dispersal — this router is their consumer; the routing tests import them
// from here). Logical px.

/**
 * DEFAULT elbow corner radius, logical px, on the stroke CENTERLINE (the
 * correct figure for our stroked-centerline path construction). The live
 * value is `CanvasStyle.connectorCornerRadiusPx`, passed as the trailing
 * `canvasStyle` argument of routeConnection / routeConnectionToPoint /
 * connectorPathFromPoints. Short segments clamp it smaller —
 * `roundedPolylinePath` clamps to half the shorter adjacent segment length —
 * so it is a ceiling, not a fixed radius.
 */
export const CONNECTOR_ELBOW_CORNER_RADIUS_PX = DEFAULT_CANVAS_STYLE.connectorCornerRadiusPx;

/**
 * Endpoint gap: connectors stop short of the target border rather than
 * touching it flush. A single figure is used for both plain and arrowhead
 * ends — splitting the two is left to a later wave if the difference reads
 * as necessary.
 */
export const CONNECTOR_END_GAP_PX = 10;

const MIN_STUB = 24;
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
/**
 * Shortest back-tracking run (board units) an elbow route keeps. A route that
 * doubles back on itself by less than this reads as a kink, not a turn, so
 * collapseShortReversingRuns removes it. It is a floor under the theme's bend
 * radius — not tied to it — so a tight radius (schematic's 8, or 0) still
 * collapses the ~1-15px reversals a drag preview or a close pair of objects
 * makes when the 24px stubs overshoot. Only exact reversals collapse;
 * doglegs (perpendicular jogs) never do.
 */
const MIN_REVERSAL_RUN_PX = 16;
const WAYPOINT_ORTHOGONAL_EPSILON_PX = 0.5;

export type { Anchor } from "../state/schema/connections";

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

export function connectorPathFromPoints(
  points: ReadonlyArray<CanvasPoint>,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): string {
  return roundedPolylinePath(
    dedupeConsecutivePoints(points.map((point) => ({ ...point }))),
    canvasStyle.connectorCornerRadiusPx,
  );
}

/**
 * Re-renders a route's drawn path with a non-default bend radius. Only the
 * SVG path depends on the radius — the polyline, anchors and label point
 * (everything hit-testing and bend editing read) do not.
 */
function withCornerRadius(routed: RoutedConnection, cornerRadiusPx: number): RoutedConnection {
  if (cornerRadiusPx === CONNECTOR_ELBOW_CORNER_RADIUS_PX || !routed.points) return routed;
  return { ...routed, path: roundedPolylinePath(routed.points, cornerRadiusPx) };
}

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
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): RoutedConnection {
  return withCornerRadius(
    routeConnectionPolyline(fromObject, toObject, connection, obstacles, canvasStyle),
    canvasStyle.connectorCornerRadiusPx,
  );
}

/** Where `connection` leaves and enters before any detour: its sides (explicit, else picked) and points. */
function routeEnds(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  connection: InteractiveCanvasConnection,
  canvasStyle: CanvasStyle,
): { startAnchor: Anchor; endAnchor: Anchor; start: CanvasPoint; end: CanvasPoint } {
  const fromBounds = connectionBoundsForObject(fromObject, canvasStyle);
  const toBounds = connectionBoundsForObject(toObject, canvasStyle);
  const pickedAnchors = autoPickAnchors(fromBounds, toBounds);
  const startAnchor = explicitAnchor(connection.from.anchor) ?? pickedAnchors.startAnchor;
  const endAnchor = explicitAnchor(connection.to.anchor) ?? pickedAnchors.endAnchor;
  const start =
    pointForObjectPosition(fromObject, connection.from.position, startAnchor, canvasStyle) ??
    pointForObjectAnchor(fromObject, startAnchor, canvasStyle);
  const end =
    pointForObjectPosition(toObject, connection.to.position, endAnchor, canvasStyle) ??
    pointForObjectAnchor(toObject, endAnchor, canvasStyle);
  return { startAnchor, endAnchor, start, end };
}

function routeConnectionPolyline(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  connection: InteractiveCanvasConnection,
  obstacles: ReadonlyArray<InteractiveCanvasObject> | undefined,
  canvasStyle: CanvasStyle,
): RoutedConnection {
  const { startAnchor, endAnchor, start, end } = routeEnds(fromObject, toObject, connection, canvasStyle);

  const withSelves = routeKeepOut(fromObject, toObject, start, end, obstacles ?? [], canvasStyle);
  const keepOut = { ...withSelves, selves: [] };
  const boxesOnly = withoutSections(keepOut);
  const detourKeepOut = withoutSections(withSelves);

  // Stored bends are drawn only while they stay clear of boxes and the ends'
  // own captions: a move that puts one under them hands the edge back to the
  // router. Crossing an unrelated section's frame is allowed, as on stage.
  const explicitWaypoints = validWaypoints(connection.waypoints);
  if (explicitWaypoints) {
    const waypointRoute = routeWaypoints(start, end, explicitWaypoints, startAnchor, endAnchor, {
      fromObject,
      toObject,
      canSlideStart: !connection.from.position,
      canSlideEnd: !connection.to.position,
      canvasStyle,
    }, (route) => isClear(route, boxesOnly));
    if (waypointRoute) return waypointRoute;
  }

  const straight = routeStraightIfAligned(
    fromObject,
    toObject,
    start,
    end,
    startAnchor,
    endAnchor,
    canvasStyle,
  );
  const elbow = routeElbow(start, end, startAnchor, endAnchor, canvasStyle.connectorCornerRadiusPx);
  const tried: Array<RoutedConnection | null> = [straight, elbow];

  // Unrelated sections are kept out first, so a wire goes around a group it
  // does not belong to.
  if (straight && isClear(straight, keepOut)) return straight;
  if (isClear(elbow, keepOut)) return elbow;
  const aStar = (level: KeepOut) =>
    exitsClear(start, startAnchor, end, endAnchor, level)
      ? routeOrthogonalAStar(fromObject, toObject, start, end, startAnchor, endAnchor, aStarObstacles(level), canvasStyle)
      : null;
  const strict = aStar(keepOut);
  if (strict && isClear(strict, keepOut)) return strict;
  tried.push(strict);
  // When sections wall the route in, only boxes count.
  if (straight && isClear(straight, detourKeepOut)) return straight;
  if (isClear(elbow, detourKeepOut)) return elbow;

  // The facing sides are walled in. Cheapest first: an elbow from the other
  // sides an unpinned end may leave from; then A* with only boxes (a failed
  // A* search is the costly step); then A* from those other sides; then the
  // same from any side, explicit anchors and pins included; and only then the
  // least-bad route.
  const otherSides = detourPairs(fromObject, toObject, connection, startAnchor, endAnchor, false, canvasStyle);
  const otherElbow = clearElbow(otherSides, detourKeepOut);
  if (otherElbow) return otherElbow;
  if (boxesOnly.boxes.length < keepOut.boxes.length) {
    const relaxed = aStar(boxesOnly);
    if (relaxed && isClear(relaxed, boxesOnly)) return relaxed;
    tried.push(relaxed);
  }
  const detour =
    searchDetour(fromObject, toObject, otherSides, detourKeepOut, canvasStyle) ??
    (hasSteeredEnd(connection)
      ? clearDetour(fromObject, toObject, detourPairs(fromObject, toObject, connection, startAnchor, endAnchor, true, canvasStyle), detourKeepOut, canvasStyle)
      : null);
  return detour ?? leastBlocked(tried, boxesOnly);
}

/**
 * A rect a route keeps out of, with the id of the object that paints it. A
 * caption also carries its `wings`: the band less the glyph column.
 */
type KeepOutRect = { id: string; bounds: CanvasBounds; section?: boolean; wings?: CanvasBounds[] };

/**
 * What a route keeps out of. `boxes`: every other node's footprint
 * (routingObstacleBounds). `captions`: each endpoint's own caption band —
 * connection bounds keep only the glyph column and other-node avoidance
 * exempts the endpoints, so nothing else keeps a wire off the name painted
 * under its own icon. `selves`: each endpoint's own connection bounds, which
 * a detour from a side the router picked must not double back through (an
 * end pinned inside its own body has none: every route leaves through it).
 * Only the tiers past the strict search judge them: there a route can come
 * from a side the router picked, while a strict-tier route keeps the route
 * its explicit side asked for.
 */
type KeepOut = { boxes: KeepOutRect[]; captions: KeepOutRect[]; selves: KeepOutRect[]; cornerRadiusPx: number };

/** What a route runs through: a box (an endpoint's own body included), or an endpoint's own caption. */
export type RouteBlocker = { objectId: string; kind: "box" | "caption" };

/** A route may touch an own caption band's edge; any longer run is through its text. */
const CAPTION_CLEAR_PX = 0.5;

function routeKeepOut(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
  canvasStyle: CanvasStyle,
): KeepOut {
  const captions: KeepOutRect[] = [];
  for (const object of fromObject.id === toObject.id ? [fromObject] : [fromObject, toObject]) {
    const bounds = captionBandBounds(object, canvasStyle);
    if (bounds) captions.push({ id: object.id, bounds, wings: captionWings(bounds, connectionBoundsForObject(object, canvasStyle)) });
  }
  return {
    boxes: routingObstacleBounds(fromObject, toObject, start, end, obstacles, canvasStyle),
    captions,
    selves: [
      { object: fromObject, point: start },
      { object: toObject, point: end },
    ]
      .map(({ object, point }) => ({ id: object.id, bounds: connectionBoundsForObject(object, canvasStyle), point }))
      .filter(({ bounds, point }) => !boundsStrictlyContain(bounds, point))
      .map(({ id, bounds }) => ({ id, bounds })),
    cornerRadiusPx: canvasStyle.connectorCornerRadiusPx,
  };
}

/** The parts of a caption band left and right of the glyph column. */
function captionWings(band: CanvasBounds, column: CanvasBounds): CanvasBounds[] {
  const wings: CanvasBounds[] = [];
  const left = column.x - band.x;
  const right = band.x + band.width - (column.x + column.width);
  if (left > ROUTE_EPSILON) wings.push({ x: band.x, y: band.y, width: left, height: band.height });
  if (right > ROUTE_EPSILON) wings.push({ x: column.x + column.width, y: band.y, width: right, height: band.height });
  return wings;
}

/** The same keep-out set without unrelated sections: only boxes and own captions. */
function withoutSections(keepOut: KeepOut): KeepOut {
  return { ...keepOut, boxes: keepOut.boxes.filter((box) => !box.section) };
}

/** Whether `route` is orthogonal and runs through nothing in `keepOut`. */
function isClear(route: RoutedConnection, keepOut: KeepOut): boolean {
  const points = route.points ?? [];
  return isOrthogonalPolyline(points, WAYPOINT_ORTHOGONAL_EPSILON_PX) && routeBlockers(points, keepOut).length === 0;
}

function routeBlockers(points: ReadonlyArray<CanvasPoint>, keepOut: KeepOut): RouteBlocker[] {
  const blockers: RouteBlocker[] = [];
  // Boxes are judged on the path as drawn: a rounded corner cuts inside its
  // turn, so a route hugging a box's two sides would bend into it.
  const drawn = drawnPolyline(points, keepOut.cornerRadiusPx);
  for (const box of [...keepOut.boxes, ...keepOut.selves]) {
    if (polylineCrossesObstacles(drawn, [box.bounds])) blockers.push({ objectId: box.id, kind: "box" });
  }
  for (const caption of keepOut.captions) {
    if (polylineLengthInBounds(points, caption.bounds) > CAPTION_CLEAR_PX) {
      blockers.push({ objectId: caption.id, kind: "caption" });
    }
  }
  return blockers;
}

/**
 * The A* obstacle set: the other boxes, and each own caption band's wings —
 * the parts wider than the glyph column. The column itself is inside the
 * endpoint's connection bounds, which A* already keeps out of, and its bottom
 * edge holds the bottom anchor, which an obstacle there would wall in.
 */
function aStarObstacles(keepOut: KeepOut): CanvasBounds[] {
  return [...keepOut.boxes.map((box) => box.bounds), ...keepOut.captions.flatMap((caption) => caption.wings ?? [])];
}

/**
 * Room an end needs straight out from its anchor before a box: the end gap.
 * A box closer than that walls the side in, so no A* search starts there.
 */
const EXIT_CLEARANCE_PX = END_GAP;

/**
 * Whether both ends can leave their sides: nothing in `keepOut.boxes` within
 * EXIT_CLEARANCE_PX straight out of each anchor. It is the cheap check run
 * before every A* search, because a search from a walled-in side fails, and
 * a failed search costs the most.
 */
function exitsClear(start: CanvasPoint, startSide: Anchor, end: CanvasPoint, endSide: Anchor, keepOut: KeepOut): boolean {
  const exitClear = (point: CanvasPoint, side: Anchor) => {
    const tip = addScaled(point, normalFor(side), EXIT_CLEARANCE_PX);
    return !keepOut.boxes.some((box) => segmentCrossesInterior(point, tip, box.bounds));
  };
  return exitClear(start, startSide) && exitClear(end, endSide);
}

/** Whether an end has an explicit side or a pin the any-side detour may override. */
function hasSteeredEnd(connection: InteractiveCanvasConnection): boolean {
  return (
    explicitAnchor(connection.from.anchor) !== null ||
    explicitAnchor(connection.to.anchor) !== null ||
    connection.from.position !== undefined ||
    connection.to.position !== undefined
  );
}

type DetourPair = {
  fromSide: Anchor;
  toSide: Anchor;
  start: CanvasPoint;
  end: CanvasPoint;
  elbow: RoutedConnection;
  length: number;
};

/**
 * The side pairs a detour may try, shortest elbow first: the other sides an
 * unpinned end may leave from (an explicit anchor keeps its side and a pin its
 * point), or with `anySide` every pair, anchors and pins included.
 */
function detourPairs(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  connection: InteractiveCanvasConnection,
  startAnchor: Anchor,
  endAnchor: Anchor,
  anySide: boolean,
  canvasStyle: CanvasStyle,
): DetourPair[] {
  const sides: Anchor[] = ["top", "right", "bottom", "left"];
  const startSides = !anySide && explicitAnchor(connection.from.anchor) ? [startAnchor] : sides;
  const endSides = !anySide && explicitAnchor(connection.to.anchor) ? [endAnchor] : sides;
  const fromPin = anySide ? undefined : connection.from.position;
  const toPin = anySide ? undefined : connection.to.position;
  const pairs: DetourPair[] = [];
  for (const fromSide of startSides) {
    for (const toSide of endSides) {
      if (!anySide && fromSide === startAnchor && toSide === endAnchor) continue;
      const start =
        pointForObjectPosition(fromObject, fromPin, fromSide, canvasStyle) ??
        pointForObjectAnchor(fromObject, fromSide, canvasStyle);
      const end =
        pointForObjectPosition(toObject, toPin, toSide, canvasStyle) ??
        pointForObjectAnchor(toObject, toSide, canvasStyle);
      const elbow = routeElbow(start, end, fromSide, toSide, canvasStyle.connectorCornerRadiusPx);
      pairs.push({ fromSide, toSide, start, end, elbow, length: polylineLength(elbow.points ?? []) });
    }
  }
  return pairs.sort((a, b) => a.length - b.length);
}

/**
 * The first clear A* route over `pairs`, shortest elbow first, or null. Every
 * pair whose exits are clear gets a search: the one open pair can be the
 * longest, and a crossing route is drawn only when none is clear.
 */
function searchDetour(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  pairs: ReadonlyArray<DetourPair>,
  keepOut: KeepOut,
  canvasStyle: CanvasStyle,
): RoutedConnection | null {
  for (const pair of pairs) {
    if (!exitsClear(pair.start, pair.fromSide, pair.end, pair.toSide, keepOut)) continue;
    const route = routeOrthogonalAStar(
      fromObject, toObject, pair.start, pair.end, pair.fromSide, pair.toSide, aStarObstacles(keepOut), canvasStyle,
    );
    if (route && isClear(route, keepOut)) return route;
  }
  return null;
}

/**
 * The shortest clear elbow among `pairs` that leaves and enters along its own
 * sides: two stubs that meet head on collapse into one run along the boxes'
 * edges, which leaves a side sideways.
 */
function clearElbow(pairs: ReadonlyArray<DetourPair>, keepOut: KeepOut): RoutedConnection | null {
  const pair = pairs.find(
    (candidate) => leavesAlongSides(candidate.elbow, candidate.fromSide, candidate.toSide) && isClear(candidate.elbow, keepOut),
  );
  return pair ? pair.elbow : null;
}

function leavesAlongSides(route: RoutedConnection, fromSide: Anchor, toSide: Anchor): boolean {
  const points = route.points ?? [];
  if (points.length < 2) return false;
  const along = (from: CanvasPoint, to: CanvasPoint, side: Anchor) => {
    const normal = normalFor(side);
    return (to.x - from.x) * normal.x + (to.y - from.y) * normal.y > ROUTE_EPSILON;
  };
  return along(points[0]!, points[1]!, fromSide) && along(points[points.length - 1]!, points[points.length - 2]!, toSide);
}

/** The shortest clear elbow among `pairs`, else the first clear A* route. */
function clearDetour(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  pairs: ReadonlyArray<DetourPair>,
  keepOut: KeepOut,
  canvasStyle: CanvasStyle,
): RoutedConnection | null {
  return clearElbow(pairs, keepOut) ?? searchDetour(fromObject, toObject, pairs, keepOut, canvasStyle);
}

/** The last resort: the route through the fewest boxes, then the fewest own captions. */
function leastBlocked(
  routes: ReadonlyArray<RoutedConnection | null>,
  keepOut: KeepOut,
): RoutedConnection {
  let best: { route: RoutedConnection; boxes: number; captions: number } | null = null;
  for (const route of routes) {
    if (!route) continue;
    const blockers = routeBlockers(route.points ?? [], keepOut);
    const boxes = blockers.filter((blocker) => blocker.kind === "box").length;
    const captions = blockers.length - boxes;
    if (!best || boxes < best.boxes || (boxes === best.boxes && captions < best.captions)) {
      best = { route, boxes, captions };
    }
  }
  return best!.route;
}

/**
 * The boxes other than its ends that `connection`'s drawn route runs through,
 * judged as the router judges every route it tries (routeBlockers on the
 * drawn path, unrelated sections left out). Empty unless no clear route
 * exists and the router fell back to the least-blocked one.
 */
export function routeThroughBoxIds(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  connection: InteractiveCanvasConnection,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): string[] {
  const { start, end } = routeEnds(fromObject, toObject, connection, canvasStyle);
  const keepOut = { ...withoutSections(routeKeepOut(fromObject, toObject, start, end, obstacles, canvasStyle)), selves: [] };
  const route = routeConnectionPolyline(fromObject, toObject, connection, obstacles, canvasStyle);
  return routeBlockers(route.points ?? [], keepOut).filter((blocker) => blocker.kind === "box").map((blocker) => blocker.objectId);
}

/**
 * What the router would refuse to draw through for `connection` routed along
 * `waypoints`: the boxes and own captions the waypoint route crosses, or
 * `null` when no orthogonal route joins the corners to the ends. `route`
 * asks this in its points mode, so its refusal can name the box.
 */
export function waypointRouteBlockers(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  connection: InteractiveCanvasConnection,
  waypoints: ReadonlyArray<[number, number]>,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): RouteBlocker[] | null {
  const { startAnchor, endAnchor, start, end } = routeEnds(fromObject, toObject, connection, canvasStyle);
  const keepOut = { ...withoutSections(routeKeepOut(fromObject, toObject, start, end, obstacles, canvasStyle)), selves: [] };
  let fewest: RouteBlocker[] | null = null;
  routeWaypoints(start, end, waypoints.map(([x, y]) => ({ x, y })), startAnchor, endAnchor, {
    fromObject,
    toObject,
    canSlideStart: !connection.from.position,
    canSlideEnd: !connection.to.position,
    canvasStyle,
  }, (route) => {
    const blockers = routeBlockers(route.points ?? [], keepOut);
    if (!fewest || blockers.length < fewest.length) fewest = blockers;
    return blockers.length === 0;
  });
  return fewest;
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
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): RoutedConnection {
  const start = pointForObjectAnchor(fromObject, fromAnchor, canvasStyle);
  const endAnchor = freePointEndAnchor(start, point);
  const cornerRadiusPx = canvasStyle.connectorCornerRadiusPx;

  if (isStraightFromAnchorToPoint(start, point, fromAnchor)) {
    return routedConnectionFromPoints([start, point], start, point, fromAnchor, endAnchor);
  }

  return withCornerRadius(
    routeFreePointElbow(start, point, fromAnchor, endAnchor, cornerRadiusPx),
    cornerRadiusPx,
  );
}

/** Returns the relative-position anchor point for `bounds`, or null when `position` is absent. */
function pointForPosition(bounds: CanvasBounds, position?: [number, number]): CanvasPoint | null {
  if (!position) return null;
  const [rx, ry] = position;
  return { x: bounds.x + rx * bounds.width, y: bounds.y + ry * bounds.height };
}

/**
 * The world point of an end pinned at `position`. A pin in the rows of an
 * icon's own caption would start the wire in its text, because the band is
 * wider than the glyph column the pin is relative to: a pin on the column's
 * side that leaves sideways moves up onto the glyph's side, a pin on the
 * band's bottom edge stays, and any other pin inside the band moves down to
 * that edge, where the bottom anchor sits.
 */
function pointForObjectPosition(
  object: InteractiveCanvasObject,
  position: [number, number] | undefined,
  anchor: Anchor,
  canvasStyle: CanvasStyle,
): CanvasPoint | null {
  const bounds = connectionBoundsForObject(object, canvasStyle);
  const point = pointForPosition(bounds, position);
  const band = point && captionBandBounds(object, canvasStyle);
  if (!point || !band || point.y <= band.y + ROUTE_EPSILON) return point;
  const onSide =
    Math.abs(point.x - bounds.x) <= ROUTE_EPSILON ||
    Math.abs(point.x - (bounds.x + bounds.width)) <= ROUTE_EPSILON;
  if (onSide && isHorizontalAnchor(anchor)) {
    const glyphHeight = band.y - bounds.y;
    return { x: point.x, y: band.y - Math.min(STRAIGHT_EDGE_MARGIN_PX, glyphHeight / 2) };
  }
  return boundsStrictlyContain(band, point) ? { x: point.x, y: band.y + band.height } : point;
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
  endpointContext?: WaypointEndpointContext,
  accept: (route: RoutedConnection) => boolean = () => true,
): RoutedConnection | null {
  for (const endpoints of waypointEndpointCandidates(
    start,
    end,
    waypoints,
    startAnchor,
    endAnchor,
    endpointContext,
  )) {
    const points = dedupeConsecutivePoints([endpoints.start, ...waypoints, endpoints.end]);
    if (!isOrthogonalPolyline(points, WAYPOINT_ORTHOGONAL_EPSILON_PX)) continue;
    const route = routedConnectionFromPoints(points, endpoints.start, endpoints.end, startAnchor, endAnchor);
    if (accept(route)) return route;
  }
  return null;
}

type WaypointEndpointContext = {
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
  canSlideStart: boolean;
  canSlideEnd: boolean;
  canvasStyle: CanvasStyle;
};

function waypointEndpointCandidates(
  start: CanvasPoint,
  end: CanvasPoint,
  waypoints: CanvasPoint[],
  startAnchor: Anchor,
  endAnchor: Anchor,
  endpointContext?: WaypointEndpointContext,
): Array<{ start: CanvasPoint; end: CanvasPoint }> {
  const candidates: Array<{ start: CanvasPoint; end: CanvasPoint }> = [];
  const addCandidate = (candidateStart: CanvasPoint, candidateEnd: CanvasPoint) => {
    if (
      candidates.some(
        (candidate) =>
          pointsAlmostEqual(candidate.start, candidateStart, ROUTE_EPSILON) &&
          pointsAlmostEqual(candidate.end, candidateEnd, ROUTE_EPSILON),
      )
    ) {
      return;
    }
    candidates.push({ start: candidateStart, end: candidateEnd });
  };

  if (endpointContext?.canSlideStart && endpointContext.canSlideEnd) {
    const straightEndpoints = exactStraightAnchoredPoints(
      endpointContext.fromObject,
      endpointContext.toObject,
      start,
      end,
      startAnchor,
      endAnchor,
      AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX,
      endpointContext.canvasStyle,
    );
    if (straightEndpoints) addCandidate(straightEndpoints[0], straightEndpoints[1]);
  }

  addCandidate(start, end);

  if (endpointContext) {
    const firstWaypoint = waypoints[0];
    const lastWaypoint = waypoints[waypoints.length - 1];
    addCandidate(
      endpointContext.canSlideStart && firstWaypoint
        ? reconcileWaypointEndpoint(start, firstWaypoint, endpointContext.fromObject, startAnchor, endpointContext.canvasStyle)
        : start,
      endpointContext.canSlideEnd && lastWaypoint
        ? reconcileWaypointEndpoint(end, lastWaypoint, endpointContext.toObject, endAnchor, endpointContext.canvasStyle)
        : end,
    );
  }

  return candidates;
}

function reconcileWaypointEndpoint(
  endpoint: CanvasPoint,
  adjacent: CanvasPoint,
  object: InteractiveCanvasObject,
  anchor: Anchor,
  canvasStyle: CanvasStyle,
): CanvasPoint {
  if (isOrthogonalSegment(endpoint, adjacent, WAYPOINT_ORTHOGONAL_EPSILON_PX)) {
    return endpoint;
  }

  const span = edgeSlideSpan(object, anchor, canvasStyle);
  if (!span) return endpoint;
  const candidate = isHorizontalAnchor(anchor)
    ? { x: span.fixed, y: adjacent.y }
    : { x: adjacent.x, y: span.fixed };
  const slideCoordinate = isHorizontalAnchor(anchor) ? candidate.y : candidate.x;
  if (
    slideCoordinate < span.min - WAYPOINT_ORTHOGONAL_EPSILON_PX ||
    slideCoordinate > span.max + WAYPOINT_ORTHOGONAL_EPSILON_PX
  ) {
    return endpoint;
  }
  return candidate;
}

function isOrthogonalPolyline(points: ReadonlyArray<CanvasPoint>, epsilon: number): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    if (!isOrthogonalSegment(previous, current, epsilon)) return false;
  }
  return true;
}

function isOrthogonalSegment(start: CanvasPoint, end: CanvasPoint, epsilon: number): boolean {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  return dx <= epsilon || dy <= epsilon;
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
  canvasStyle: CanvasStyle,
): RoutedConnection | null {
  const extraObstacles = extraObstacleBounds.map(toObstacle);

  let waypoints: Array<[number, number]>;
  try {
    const generator = new PathGenerator();
    waypoints = generator.generateOrthogonalConnectorPath(
      {
        startBound: toObstacle(connectionBoundsForObject(fromObject, canvasStyle)),
        endBound: toObstacle(connectionBoundsForObject(toObject, canvasStyle)),
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
        canvasStyle,
      )
    : null;
  const routedPoints = straightPoints ?? points;
  const routedStart = routedPoints[0]!;
  const routedEnd = routedPoints[routedPoints.length - 1]!;

  return routedConnectionFromPoints(routedPoints, routedStart, routedEnd, startAnchor, endAnchor);
}

/**
 * What a route must keep out of: every node but the two endpoints and their
 * ancestor sections, each as its hit footprint (hitBoundsForObject: the box,
 * the glyph and the whole caption band, band width included), so a wire never
 * runs through another node's caption. The endpoints keep their connection
 * bounds (the A* start and end bounds), so anchors do not move. A node whose
 * footprint holds an endpoint is skipped: the route could not leave it.
 */
function routingObstacleBounds(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  obstacles: ReadonlyArray<InteractiveCanvasObject>,
  canvasStyle: CanvasStyle,
): KeepOutRect[] {
  const excludedIds = new Set<string>([fromObject.id, toObject.id]);
  collectAncestorIds(fromObject.id, excludedIds, obstacles);
  collectAncestorIds(toObject.id, excludedIds, obstacles);

  return obstacles
    .filter((object) => !excludedIds.has(object.id))
    .map((object) => ({
      id: object.id,
      bounds: hitBoundsForObject(object, canvasStyle),
      section: object.type === "section",
    }))
    .filter(({ bounds }) => !boundsStrictlyContain(bounds, start) && !boundsStrictlyContain(bounds, end));
}

function routeStraightIfAligned(
  fromObject: InteractiveCanvasObject,
  toObject: InteractiveCanvasObject,
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
  canvasStyle: CanvasStyle,
): RoutedConnection | null {
  const points = exactStraightAnchoredPoints(
    fromObject,
    toObject,
    start,
    end,
    startAnchor,
    endAnchor,
    AUTO_ROUTE_ALIGNMENT_TOLERANCE_PX,
    canvasStyle,
  );
  if (!points) return null;
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
  canvasStyle: CanvasStyle,
): [CanvasPoint, CanvasPoint] | null {
  const axis = straightRouteAxis(start, end, tolerance);
  if (!axis || !anchorsFaceAlongAxis(start, end, startAnchor, endAnchor, axis)) return null;

  const startSpan = edgeSlideSpan(fromObject, startAnchor, canvasStyle);
  const endSpan = edgeSlideSpan(toObject, endAnchor, canvasStyle);
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
  canvasStyle: CanvasStyle,
): EdgeSlideSpan | null {
  const bounds = connectionBoundsForObject(object, canvasStyle);
  const polygon = outlinePolygon(object, canvasStyle);
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

/** Total length of `points` inside the closed `bounds` (edge runs count). */
function polylineLengthInBounds(points: ReadonlyArray<CanvasPoint>, bounds: CanvasBounds): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    // Routes are orthogonal: clip each run to the rect on its own axis.
    const overlapX = Math.min(Math.max(a.x, b.x), bounds.x + bounds.width) - Math.max(Math.min(a.x, b.x), bounds.x);
    const overlapY = Math.min(Math.max(a.y, b.y), bounds.y + bounds.height) - Math.max(Math.min(a.y, b.y), bounds.y);
    if (overlapX < 0 || overlapY < 0) continue;
    total += Math.abs(a.y - b.y) <= ROUTE_EPSILON ? overlapX : Math.abs(a.x - b.x) <= ROUTE_EPSILON ? overlapY : Math.hypot(overlapX, overlapY);
  }
  return total;
}

function polylineLength(points: ReadonlyArray<CanvasPoint>): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) total += distance(points[index - 1]!, points[index]!);
  return total;
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

/** World point of `object`'s `anchor` port; `canvasStyle` sizes below-band captions (default style when omitted). */
export function pointForObjectAnchor(
  object: InteractiveCanvasObject,
  anchor: Anchor,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): CanvasPoint {
  const anchors = getConnectionAnchors(object, canvasStyle);
  const fallback = () => pointForAnchor(connectionBoundsForObject(object, canvasStyle), anchor);
  if (anchor === "top") return anchors[0]?.point ?? fallback();
  if (anchor === "bottom") return anchors[1]?.point ?? fallback();
  if (anchor === "left") return anchors[2]?.point ?? fallback();
  return anchors[3]?.point ?? fallback();
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

/** `object`'s port anchor nearest `point`; `canvasStyle` sizes below-band captions (default style when omitted). */
export function nearestObjectAnchor(
  object: InteractiveCanvasObject,
  point: CanvasPoint,
  canvasStyle: CanvasStyle = DEFAULT_CANVAS_STYLE,
): Anchor {
  const anchors = getConnectionAnchors(object, canvasStyle);
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
  cornerRadiusPx: number,
): RoutedConnection {
  const stubStart = addScaled(start, normalFor(startAnchor), MIN_STUB);
  const stubEnd = addScaled(end, normalFor(endAnchor), MIN_STUB);
  const corners = elbowCorners(stubStart, stubEnd, startAnchor, endAnchor);
  // Close objects (and the quick-connect ghost under a create drag) put the
  // two 24px stubs past each other, so the elbow doubles back a few px.
  const points = collapseShortReversingRuns(
    dedupeConsecutivePoints([start, stubStart, ...corners, stubEnd, end]),
    cornerRadiusPx,
    true,
  );

  return routedConnectionFromPoints(points, start, end, startAnchor, endAnchor);
}

function routeFreePointElbow(
  start: CanvasPoint,
  end: CanvasPoint,
  startAnchor: Anchor,
  endAnchor: Anchor,
  cornerRadiusPx: number,
): RoutedConnection {
  const stubStart = addScaled(start, normalFor(startAnchor), MIN_STUB);
  const stubEnd = addScaled(end, normalFor(endAnchor), MIN_STUB);
  const corners = elbowCorners(stubStart, stubEnd, startAnchor, endAnchor);
  const points = collapseShortReversingRuns(
    dedupeConsecutivePoints([start, stubStart, ...corners, stubEnd, end]),
    cornerRadiusPx,
  );

  return routedConnectionFromPoints(points, start, end, startAnchor, endAnchor);
}

/**
 * Drops the vertex of every exact reversal (a run that doubles straight back)
 * whose shorter side is under max(bend radius, MIN_REVERSAL_RUN_PX).
 * `keepEndDirections` refuses a collapse that would flip the first or last
 * segment — i.e. leave or enter an anchored object through its own body.
 */
function collapseShortReversingRuns(
  points: CanvasPoint[],
  cornerRadiusPx: number,
  keepEndDirections = false,
): CanvasPoint[] {
  const collapseBelowPx = Math.max(cornerRadiusPx, MIN_REVERSAL_RUN_PX);
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

    const flipsStart = index === 1 && outgoingLength > incomingLength + ROUTE_EPSILON;
    const flipsEnd = index === segmentCount - 1 && incomingLength > outgoingLength + ROUTE_EPSILON;
    if (
      Math.min(effectiveIncomingLength, effectiveOutgoingLength) >
        collapseBelowPx + ROUTE_EPSILON ||
      (keepEndDirections && (flipsStart || flipsEnd))
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
function roundedPolylinePath(
  points: CanvasPoint[],
  cornerRadiusPx: number = CONNECTOR_ELBOW_CORNER_RADIUS_PX,
): string {
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
    const radius = Math.min(cornerRadiusPx, distance(previous, corner) / 2, distance(corner, next) / 2);

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
/** Steps each rounded corner is sampled at when a route is judged as drawn. */
const CORNER_SAMPLES = 8;

/**
 * The polyline roundedPolylinePath paints for `points`: the end gaps, and
 * each corner's quadratic arc sampled into short chords. A chord lies on the
 * inside of its arc, so a box the arc reaches is crossed by a chord too.
 */
function drawnPolyline(points: ReadonlyArray<CanvasPoint>, cornerRadiusPx: number): CanvasPoint[] {
  if (points.length < 3 || cornerRadiusPx <= 0) return [...points];
  const render = withEndGap([...points]);
  const drawn: CanvasPoint[] = [render[0]!];
  for (let index = 1; index < render.length - 1; index += 1) {
    const previous = render[index - 1]!;
    const corner = render[index]!;
    const next = render[index + 1]!;
    const radius = Math.min(cornerRadiusPx, distance(previous, corner) / 2, distance(corner, next) / 2);
    if (radius <= 0) {
      drawn.push(corner);
      continue;
    }
    const enter = pointToward(corner, previous, radius);
    const exit = pointToward(corner, next, radius);
    for (let step = 0; step <= CORNER_SAMPLES; step += 1) {
      const t = step / CORNER_SAMPLES;
      const a = (1 - t) * (1 - t);
      const b = 2 * t * (1 - t);
      const c = t * t;
      drawn.push({ x: a * enter.x + b * corner.x + c * exit.x, y: a * enter.y + b * corner.y + c * exit.y });
    }
  }
  drawn.push(render[render.length - 1]!);
  return drawn;
}

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

/**
 * The EFFECTIVE label-chip center for a connection — the single reader every
 * chip consumer goes through (stage SVG chip, HTML overlay chip, static-SVG
 * export, the inline label editor's anchor, painted bounds, and label
 * placement), so the drawn chip and every judgement about it can never
 * disagree.
 *
 * Without `connection.labelPosition` this is exactly `routed.labelPoint`,
 * the route's arc-length midpoint — the pre-S1.1 behavior, unchanged.
 *
 * With a pin, the routed polyline is walked to arc-length fraction `along`
 * and the point is pushed `offset` px perpendicular to the LOCAL segment
 * direction there. Positive offset is LEFT of travel (from → to): in this
 * y-down world the unit normal is `(dy, -dx)`, so on a left-to-right run a
 * positive offset lifts the chip upward.
 *
 * Degenerate routes (a single point, or every segment zero-length) have no
 * direction to offset along, so they fall back to `routed.labelPoint`. A
 * defensive clamp keeps `along` in range for callers that skipped the
 * validator (drafts, tests).
 */
export function labelPointFor(
  routed: RoutedConnection,
  connection: Pick<InteractiveCanvasConnection, "labelPosition"> | undefined,
): CanvasPoint {
  const pin = connection?.labelPosition;
  if (!pin || !Number.isFinite(pin.along)) return routed.labelPoint;

  const points = routed.points ?? [routed.start, routed.end];
  const segments: Array<{ start: CanvasPoint; end: CanvasPoint; length: number }> = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]!;
    const end = points[index + 1]!;
    const length = distance(start, end);
    if (length === 0) continue;
    totalLength += length;
    segments.push({ start, end, length });
  }
  if (segments.length === 0) return routed.labelPoint;

  const along = clamp(pin.along, 0, 1);
  const targetLength = totalLength * along;
  let traveled = 0;
  let hit = segments[segments.length - 1]!;
  let distanceIntoSegment = hit.length;
  for (const segment of segments) {
    if (traveled + segment.length >= targetLength) {
      hit = segment;
      distanceIntoSegment = targetLength - traveled;
      break;
    }
    traveled += segment.length;
  }

  const base = pointToward(hit.start, hit.end, distanceIntoSegment);
  const offset = pin.offset;
  if (offset === undefined || !Number.isFinite(offset) || offset === 0) return base;

  // Left-hand normal of the local travel direction, y-down: (dy, -dx).
  const dx = (hit.end.x - hit.start.x) / hit.length;
  const dy = (hit.end.y - hit.start.y) / hit.length;
  return { x: base.x + dy * offset, y: base.y - dx * offset };
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

function pointsAlmostEqual(a: CanvasPoint, b: CanvasPoint, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}
