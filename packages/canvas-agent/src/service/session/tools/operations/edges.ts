/**
 * The Edges group — `style_edge`, `change_connection`, `reroute`,
 * `shift_segment`, `reset_route`, `move_label`
 * (docs/30-agent-layout/50-tool-surface/10-gestures §Edges).
 *
 * THREE DIFFERENT GESTURES, THREE DIFFERENT TOOLS. Restyling a wire,
 * repointing it, and cleaning up its route are separate motions on the real
 * canvas, so they are separate calls here: `style_edge` never touches where an
 * edge lands, `change_connection` never touches how it is drawn, and neither
 * of them owns the elbows. Color and label are absent from all six — they are
 * `change_color` and `update_text`, one home per concern, which is exactly why
 * `style_edge` has no key to reach for.
 *
 * THE ROUTE, COARSE AND FINE. `reroute` replaces the interior waypoints
 * wholesale; `shift_segment` slides one elbow; `reset_route` throws the manual
 * routing away. The fine instrument is not a reimplementation: it drives the
 * canvas package's own bend machinery (`connectorBendSegments` →
 * `dragOrthogonalSegment` → `commitBendPolyline`) with a synthetic drag, so a
 * model-driven shift and a pointer-driven one land the same document patch —
 * including the endpoint re-pins the commit path writes when a drag pulls a
 * wire off its anchor.
 *
 * ## The fresh-polyline contract (the spec's staleness answer)
 *
 * Every op here must return the edge's POST-OP numbered polyline, so a second
 * shift in the same turn chains off the previous result instead of off a
 * digest that aged the moment the first one applied. That is not a per-tool
 * string: the ROUTES block already prints the numbered form for every
 * connection the change touched (`perception.ts` `routesBlock` over
 * `DocumentDelta.touchedConnectionIds`), so the contract is satisfied by making
 * sure each op actually trips it.
 *
 *  - `change_connection` marks it via the endpoint / anchor / position lines,
 *  - `reroute`, `shift_segment` and `reset_route` via the `wp` waypoint line,
 *  - `style_edge` and `move_label` move no geometry at all, so `documentDelta`
 *    now marks an edge touched when one of its WIRE channels moves —
 *    `style`, `arrow`, `labelPosition`, the three these two gestures write.
 *    A `label` or `color` write still reports no route: those are the content
 *    gestures and say nothing about how the wire runs.
 *
 * ## Where validation draws its lines
 *
 * `reroute` is the only op here whose input can describe a path the router
 * will not draw, and a silently ignored route is worse than a rejection: the
 * edge would keep auto-routing while the model believed it had placed the
 * wire. So validation asks the ROUTER, not a rulebook — it snaps the points,
 * checks the spec's own consecutive-points-share-an-axis rule for a precise
 * message, then routes a candidate edge and rejects anything the router would
 * have fallen back on (`routeWaypoints` in connectors/routing.ts rejects a
 * non-orthogonal polyline, including the two legs joining the endpoints).
 *
 * `shift_segment` rejects an index the edge does not have, and a segment the
 * bend machinery refuses to drag — a near-diagonal run, which edge-route.ts
 * documents as having no bend handle on stage either.
 *
 * ## Locks reach edges through their ends
 *
 * A connection carries no `locked` field, so the lock gate here is regional
 * (`requireUnlockedEdge`, op-context.ts): every gesture below is refused when
 * either endpoint object sits inside a locked-ALL closure, because a wire into
 * a protected region is part of that region. A "background" lock — which pins
 * one frame's own box and leaves its contents editable — never gates an edge,
 * including an edge between that frame's own children. `change_connection`
 * additionally gates the endpoint it is repointing TO, so a wire cannot be
 * dragged into a frozen region from outside it.
 */
import { Type } from "@mariozechner/pi-ai";

import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
  InteractiveCanvasObject,
} from "@codecaine-ai/canvas/schema";

import {
  commitBendPolyline,
  connectorBendSegments,
  dragOrthogonalSegment,
} from "../../../../../../canvas/src/connectors/bend-editing";
import {
  pointForObjectAnchor,
  routeConnection,
} from "../../../../../../canvas/src/connectors/routing";
import { connectionBoundsForObject } from "../../../../../../canvas/src/objects/geometry";

import {
  formatNumberedSegments,
  numberedSegmentsForPolyline,
} from "../../../../board/edge-route";
import { routedPolyline } from "../../../../board/lints/geometry";
import { snapCoordinate, snapPoint } from "../grid";
import { defineOperationTool } from "./operation-tool";
import type { OpContext } from "./op-context";
import {
  EdgeStylePatch,
  Id,
  LabelAlong,
  Point,
  RepointPatch,
} from "../schemas";
import type { ConnectionPatch, Endpoint } from "../schemas";

/** The tolerance `routeWaypoints` judges a polyline orthogonal by. */
const ORTHOGONAL_EPSILON_PX = 0.5;

/** The tolerance `bendEndpointPatch` calls two world points the same by. */
const ENDPOINT_POSITION_EPSILON_PX = 0.5;

/** Below this a "shift" is asking for the coordinate the segment already has. */
const AXIS_EPSILON = 0.01;

interface WorldPoint {
  x: number;
  y: number;
}

function connectionOf(
  ctx: OpContext,
  id: string,
): InteractiveCanvasConnection | undefined {
  return ctx.draft.connections.find((connection) => connection.id === id);
}

function objectOf(
  document: InteractiveCanvasDocument,
  id: string,
): InteractiveCanvasObject | undefined {
  return document.objects.find((object) => object.id === id);
}

/** The edge's route as the model reads it — the string every op here returns. */
function numberedRouteOf(
  connection: InteractiveCanvasConnection,
  document: InteractiveCanvasDocument,
): string {
  const points = routedPolyline(connection, document);
  return formatNumberedSegments(
    connection.from.objectId,
    connection.to.objectId,
    numberedSegmentsForPolyline(points),
  );
}

// ---------------------------------------------------------------------------
// style_edge
// ---------------------------------------------------------------------------

export const styleEdge = defineOperationTool({
  name: "style_edge",
  description:
    "Redraw an edge's line and arrowheads. This is the wire's appearance only — recolor it with change_color and relabel it with update_text.",
  fields: { id: Id, patch: EdgeStylePatch },
  validate: (ctx, p) => {
    const errors = ctx.requireConnection(p.id);
    return errors.length > 0 ? errors : ctx.requireUnlockedEdge(p.id);
  },
  apply: (ctx, p) =>
    ctx.mergeConnection(p.id, p.patch as ConnectionPatch, `style_edge ${p.id}`),
});

// ---------------------------------------------------------------------------
// change_connection
// ---------------------------------------------------------------------------

function samePosition(
  a: readonly [number, number] | undefined,
  b: readonly [number, number] | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  return a[0] === b[0] && a[1] === b[1];
}

/**
 * The reducer's own endpoint-moved test (state/actions/connections.ts
 * `endpointChanged`), reproduced so the draft agrees with what a committed
 * proposal does: any of the three fields moving counts.
 */
function endpointChanged(
  previous: InteractiveCanvasConnection["from"],
  next: InteractiveCanvasConnection["from"],
): boolean {
  return (
    next.objectId !== previous.objectId
    || next.anchor !== previous.anchor
    || !samePosition(next.position, previous.position)
  );
}

export const changeConnection = defineOperationTool({
  name: "change_connection",
  description:
    "Repoint an edge: move one end to another object, or to another side of the one it already meets. The edge alone moves — neither object changes. A manual route is dropped, because it described the old ends.",
  fields: { id: Id, patch: RepointPatch },
  validate: (ctx, p) => {
    // A patch usually carries one endpoint, so distinctness has to be judged
    // against the edge AS IT WILL STAND: the side being repointed against the
    // side already stored. Comparing the patch to itself would let an edge
    // land on the object its other end already occupies.
    const stored = connectionOf(ctx, p.id);
    return [
      ...ctx.requireConnection(p.id),
      ...ctx.requireEndpoint("from", p.patch.from),
      ...ctx.requireEndpoint("to", p.patch.to),
      ...ctx.requireDistinctEndpoints(p.patch.from ?? stored?.from, p.patch.to ?? stored?.to),
      // Both sides of the repoint: the region the wire is in now, and the one
      // it is being pulled into.
      ...ctx.requireUnlockedEdge(p.id),
      ...ctx.requireUnlockedEndpoint("from", p.patch.from),
      ...ctx.requireUnlockedEndpoint("to", p.patch.to),
    ];
  },
  apply: (ctx, p) => {
    const stored = connectionOf(ctx, p.id)!;
    const mergedFrom = (p.patch.from ?? stored.from) as InteractiveCanvasConnection["from"];
    const mergedTo = (p.patch.to ?? stored.to) as InteractiveCanvasConnection["from"];
    const moved = endpointChanged(stored.from, mergedFrom)
      || endpointChanged(stored.to, mergedTo);

    // The live reducer drops a stored route when the ends move
    // (`handleUpdateConnection`), because waypoints drawn for the old geometry
    // describe nothing after a repoint. The agent's draft applier is a plain
    // spread and would keep them, so the drop is made EXPLICIT in the patch —
    // which is also what carries it through the commit replay, where
    // `applyAgentPatch` is a plain spread too.
    const dropsRoute = moved && stored.waypoints !== undefined;
    const patch = {
      ...p.patch,
      ...(dropsRoute ? { waypoints: undefined } : {}),
    } as ConnectionPatch;

    return ctx.mergeConnection(
      p.id,
      patch,
      `change_connection ${p.id}`,
      dropsRoute
        ? ["manual waypoints dropped — they described the old endpoints; the router owns this edge again"]
        : [],
    );
  },
});

// ---------------------------------------------------------------------------
// reroute
// ---------------------------------------------------------------------------

/**
 * Snap every coordinate to the agent grid and collapse points that land on
 * top of one another — the router dedupes consecutive duplicates anyway, and a
 * pair of identical points is not a segment the model can name afterwards.
 */
function reroutePoints(points: readonly Point[]): Array<[number, number]> {
  const snapped: Array<[number, number]> = [];
  for (const point of points) {
    const next = snapPoint(point);
    const previous = snapped[snapped.length - 1];
    if (previous && previous[0] === next[0] && previous[1] === next[1]) continue;
    snapped.push(next);
  }
  return snapped;
}

function isOrthogonalPair(a: readonly [number, number], b: readonly [number, number]): boolean {
  return Math.abs(a[0] - b[0]) <= ORTHOGONAL_EPSILON_PX
    || Math.abs(a[1] - b[1]) <= ORTHOGONAL_EPSILON_PX;
}

function pointsAlmostEqual(a: WorldPoint, b: WorldPoint): boolean {
  return Math.abs(a.x - b.x) <= ORTHOGONAL_EPSILON_PX
    && Math.abs(a.y - b.y) <= ORTHOGONAL_EPSILON_PX;
}

/**
 * Whether the router would actually DRAW this path, rather than quietly
 * falling back to auto-routing.
 *
 * `routeWaypoints` tries several endpoint attachments and takes the first that
 * yields an orthogonal polyline; reproducing that search here would be a second
 * implementation to keep in sync, so the check routes a candidate edge and asks
 * whether the supplied waypoints survived into the result.
 */
function routerAcceptsWaypoints(
  connection: InteractiveCanvasConnection,
  document: InteractiveCanvasDocument,
  waypoints: ReadonlyArray<[number, number]>,
): boolean {
  const candidate: InteractiveCanvasConnection = {
    ...connection,
    waypoints: waypoints.map(([x, y]) => [x, y] as [number, number]),
  };
  const points = routedPolyline(candidate, document);
  if (points.length === 0) return false;
  const wanted = waypoints.map(([x, y]) => ({ x, y }));
  for (let start = 0; start + wanted.length <= points.length; start += 1) {
    if (wanted.every((point, offset) => pointsAlmostEqual(point, points[start + offset]!))) {
      return true;
    }
  }
  return false;
}

/** Where the router attaches this edge when nothing is steering it. */
function autoAttachment(
  connection: InteractiveCanvasConnection,
  document: InteractiveCanvasDocument,
): { start: WorldPoint; end: WorldPoint } | null {
  const from = objectOf(document, connection.from.objectId);
  const to = objectOf(document, connection.to.objectId);
  if (!from || !to) return null;
  const routed = routeConnection(from, to, { ...connection, waypoints: undefined }, document.objects);
  return { start: routed.start, end: routed.end };
}

function fmtPoint(point: WorldPoint | readonly [number, number]): string {
  const [x, y] = Array.isArray(point)
    ? (point as readonly [number, number])
    : [(point as WorldPoint).x, (point as WorldPoint).y];
  return `${Math.round(x)},${Math.round(y)}`;
}

export const reroute = defineOperationTool({
  name: "reroute",
  description:
    "Replace an edge's whole route. `points` are the interior corners only — the two ends stay attached where they are. Every leg must be horizontal or vertical, including the two that join the endpoints; coordinates snap to the board grid.",
  fields: {
    id: Id,
    points: Type.Array(Point, {
      minItems: 1,
      description:
        "The interior corners, in order from the `from` end. Each consecutive pair must share an x or a y.",
    }),
  },
  validate: (ctx, p) => {
    const errors = [...ctx.requireConnection(p.id), ...ctx.requireUnlockedEdge(p.id)];
    if (errors.length > 0) return errors;
    const connection = connectionOf(ctx, p.id)!;

    const points = reroutePoints(p.points);
    if (points.length === 0) {
      return ["points collapsed to nothing once snapped to the grid — give at least one corner, or use reset_route to hand the edge back to the router."];
    }

    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      if (isOrthogonalPair(previous, current)) continue;
      return [
        `points ${index - 1}→${index} (${fmtPoint(previous)} → ${fmtPoint(current)}) is diagonal —`
        + " consecutive corners must share an x or a y. Insert the corner between them.",
      ];
    }

    if (routerAcceptsWaypoints(connection, ctx.draft, points)) return [];

    const attachment = autoAttachment(connection, ctx.draft);
    if (!attachment) {
      return [`connectionId "${p.id}" has no routable path — one of its endpoint objects is missing.`];
    }
    return [
      `these corners cannot be joined to the edge's ends without a diagonal leg: the router attaches`
      + ` ${connection.from.objectId} at ${fmtPoint(attachment.start)} and ${connection.to.objectId}`
      + ` at ${fmtPoint(attachment.end)}, so the first corner must share an x or a y with`
      + ` ${fmtPoint(attachment.start)} and the last with ${fmtPoint(attachment.end)}.`,
    ];
  },
  apply: (ctx, p) => {
    const points = reroutePoints(p.points);
    return ctx.mergeConnection(
      p.id,
      { waypoints: points } as ConnectionPatch,
      `reroute ${p.id}`,
    );
  },
});

// ---------------------------------------------------------------------------
// shift_segment
// ---------------------------------------------------------------------------

/**
 * `bendEndpointPatch` from connectors/gestures.ts, which is module-private
 * there. A bend drag that pulls a wire off its anchor point pins the endpoint
 * at the fraction of the object's side it now meets; the agent path writes the
 * same pin so a model-driven shift and a pointer-driven one are the same edit.
 * `reset_route` is the tool that clears these again.
 */
function bendEndpointPatch(
  endpoint: InteractiveCanvasConnection["from"],
  object: InteractiveCanvasObject,
  point: WorldPoint,
): InteractiveCanvasConnection["from"] | undefined {
  const bounds = connectionBoundsForObject(object);
  const existingPoint = endpoint.position
    ? {
        x: bounds.x + endpoint.position[0] * bounds.width,
        y: bounds.y + endpoint.position[1] * bounds.height,
      }
    : canonicalEndpointPoint(object, endpoint.anchor, point);
  if (existingPoint && pointsAlmostEqualBy(existingPoint, point, ENDPOINT_POSITION_EPSILON_PX)) {
    return undefined;
  }
  if (Math.abs(bounds.width) <= 1e-6 || Math.abs(bounds.height) <= 1e-6) return undefined;
  return {
    ...endpoint,
    position: [
      clampUnit((point.x - bounds.x) / bounds.width),
      clampUnit((point.y - bounds.y) / bounds.height),
    ],
  };
}

function canonicalEndpointPoint(
  object: InteractiveCanvasObject,
  anchor: InteractiveCanvasConnection["from"]["anchor"],
  point: WorldPoint,
): WorldPoint | undefined {
  if (anchor === "top" || anchor === "right" || anchor === "bottom" || anchor === "left") {
    return pointForObjectAnchor(object, anchor);
  }
  return (["top", "right", "bottom", "left"] as const)
    .map((candidate) => pointForObjectAnchor(object, candidate))
    .find((candidate) => pointsAlmostEqualBy(candidate, point, ENDPOINT_POSITION_EPSILON_PX));
}

function pointsAlmostEqualBy(a: WorldPoint, b: WorldPoint, epsilon: number): boolean {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export const shiftSegment = defineOperationTool({
  name: "shift_segment",
  description:
    "Slide one segment of an edge's route sideways, the way dragging its handle does. `segment` is the sN index the route prints; `to` is the segment's new x when it is vertical and its new y when it is horizontal, snapped to the board grid. The result prints the edge's new route, so a second shift can chain off it.",
  fields: {
    id: Id,
    segment: Type.Integer({
      minimum: 0,
      description: "The sN index from the edge's printed route.",
    }),
    to: Type.Number({
      description: "The segment's new fixed coordinate: x for a vertical segment, y for a horizontal one.",
    }),
  },
  validate: (ctx, p) => {
    const errors = [...ctx.requireConnection(p.id), ...ctx.requireUnlockedEdge(p.id)];
    if (errors.length > 0) return errors;
    const connection = connectionOf(ctx, p.id)!;
    const points = routedPolyline(connection, ctx.draft);
    const printed = numberedRouteOf(connection, ctx.draft);
    if (points.length < 2) {
      return [`connectionId "${p.id}" has no routed path to shift — one of its endpoint objects is missing.`];
    }

    const numbered = numberedSegmentsForPolyline(points);
    const named = numbered.find((segment) => segment.index === p.segment);
    if (!named) {
      const available = numbered.map((segment) => `s${segment.index}`).join(", ");
      return [
        `segment ${p.segment} is not on this edge — its route is ${printed}`
        + ` (${available.length > 0 ? `segments ${available}` : "no shiftable segments"}).`,
      ];
    }

    // The bend machinery drops anything `segmentAxis` will not call
    // axis-aligned. edge-route.ts still PRINTS such a run under its dominant
    // axis so perception describes the whole wire, but there is no handle on
    // stage for it and no drag to drive here.
    const draggable = new Set(connectorBendSegments(points).map((segment) => segment.index));
    if (!draggable.has(p.segment)) {
      return [
        `segment s${p.segment} runs diagonally, so it has no bend handle to slide —`
        + ` this happens when an endpoint pin pulls the wire off-axis. Use reroute to set the`
        + ` whole path, or reset_route to start over. The route is ${printed}.`,
      ];
    }
    return [];
  },
  apply: (ctx, p) => {
    const connection = connectionOf(ctx, p.id)!;
    const points = routedPolyline(connection, ctx.draft);
    const segment = connectorBendSegments(points)
      .find((candidate) => candidate.index === p.segment)!;

    const target = snapCoordinate(p.to);
    const current = segment.axis === "horizontal"
      ? (segment.start.y + segment.end.y) / 2
      : (segment.start.x + segment.end.x) / 2;
    const offset = target - current;
    if (Math.abs(offset) <= AXIS_EPSILON) {
      const coordinate = segment.axis === "horizontal" ? "y" : "x";
      return {
        status: "noop",
        note: `segment s${p.segment} already sits at ${coordinate}=${Math.round(target)}.`,
      };
    }

    // The UI's own drag, driven programmatically. No snap tolerance: the
    // pointer path's magnet-to-neighbour behaviour exists because a hand
    // cannot hit a coordinate exactly, and the model can.
    const dragged = dragOrthogonalSegment(
      points,
      p.segment,
      segment.axis === "horizontal" ? { dx: 0, dy: offset } : { dx: offset, dy: 0 },
    );
    const commit = commitBendPolyline(dragged);

    const notes: string[] = [];
    let patch: ConnectionPatch;
    if (commit.clearedWaypoints) {
      notes.push("the shift straightened the wire, so its manual route is gone and the router owns it again");
      patch = { waypoints: undefined } as ConnectionPatch;
    } else {
      // The same endpoint re-pins the pointer commit path writes: a shift that
      // pulls the wire off its anchor point has to say where it now meets the
      // box, or the router would pull the whole route back on the next read.
      const fromObject = objectOf(ctx.draft, connection.from.objectId);
      const toObject = objectOf(ctx.draft, connection.to.objectId);
      const first = commit.points[0];
      const last = commit.points[commit.points.length - 1];
      const from = fromObject && first
        ? bendEndpointPatch(connection.from, fromObject, first)
        : undefined;
      const to = toObject && last
        ? bendEndpointPatch(connection.to, toObject, last)
        : undefined;
      patch = {
        waypoints: commit.waypoints,
        ...(from ? { from: from as Endpoint } : {}),
        ...(to ? { to: to as Endpoint } : {}),
      } as ConnectionPatch;
    }

    return ctx.mergeConnection(p.id, patch, `shift_segment ${p.id}`, notes);
  },
});

// ---------------------------------------------------------------------------
// reset_route
// ---------------------------------------------------------------------------

/**
 * Everything a manual route leaves on a connection, and therefore everything
 * this clears:
 *
 *  - `waypoints` — the interior corners, written by `reroute` and by the bend
 *    commit path (`commitBendPolyline` → `polylineInteriorWaypoints`).
 *  - `from.position` / `to.position` — the 0..1 pins a bend drag writes when
 *    the shift pulls a wire off its anchor point (`bendEndpointPatch`, and the
 *    `reconcileWaypointEndpoint` slide that motivates it). Left behind, these
 *    keep steering the "auto" route and are the usual cause of the diagonal
 *    stub `shift_segment` refuses to touch.
 *
 * What it deliberately KEEPS is `from.anchor` / `to.anchor`: choosing which
 * side of a box an edge leaves is a stated intent, not routing debris, and the
 * spec says explicit anchors survive a reset.
 */
function withoutPositionPin(
  endpoint: InteractiveCanvasConnection["from"],
): InteractiveCanvasConnection["from"] {
  return {
    objectId: endpoint.objectId,
    ...(endpoint.anchor !== undefined ? { anchor: endpoint.anchor } : {}),
  };
}

export const resetRoute = defineOperationTool({
  name: "reset_route",
  description:
    "Hand an edge back to the auto-router: its manual corners and any endpoint pins a route left behind are dropped. A side you chose with an anchor is kept.",
  fields: { id: Id },
  validate: (ctx, p) => {
    const errors = ctx.requireConnection(p.id);
    return errors.length > 0 ? errors : ctx.requireUnlockedEdge(p.id);
  },
  apply: (ctx, p) => {
    const connection = connectionOf(ctx, p.id)!;
    const hasWaypoints = connection.waypoints !== undefined;
    const hasPins = connection.from.position !== undefined || connection.to.position !== undefined;
    if (!hasWaypoints && !hasPins) {
      return {
        status: "noop",
        note: "this edge is already on the auto-router — it carries no manual corners and no endpoint pins.",
      };
    }
    const patch = {
      waypoints: undefined,
      ...(connection.from.position !== undefined
        ? { from: withoutPositionPin(connection.from) as Endpoint }
        : {}),
      ...(connection.to.position !== undefined
        ? { to: withoutPositionPin(connection.to) as Endpoint }
        : {}),
    } as ConnectionPatch;
    return ctx.mergeConnection(p.id, patch, `reset_route ${p.id}`);
  },
});

// ---------------------------------------------------------------------------
// move_label
// ---------------------------------------------------------------------------

export const moveLabel = defineOperationTool({
  name: "move_label",
  description:
    "Pin an edge's label chip somewhere other than the middle of its route: `along` is a 0..1 fraction of the routed path and `offset` nudges it perpendicular, in px on the board grid. `along: \"auto\"` drops the pin and returns the chip to the midpoint.",
  fields: {
    id: Id,
    along: LabelAlong,
    offset: Type.Optional(Type.Number({
      description: "Perpendicular nudge in px, landing on the board grid; positive is left of the from→to direction. Ignored with \"auto\".",
    })),
  },
  validate: (ctx, p) => {
    const errors = [...ctx.requireConnection(p.id), ...ctx.requireUnlockedEdge(p.id)];
    if (errors.length > 0) return errors;
    if (p.along === "auto") return [];
    if (typeof p.along !== "number" || !Number.isFinite(p.along)) {
      return ["along must be a number between 0 and 1, or \"auto\"."];
    }
    if (p.along < 0 || p.along > 1) {
      return [
        `along ${p.along} is outside 0..1 — it is a fraction of the routed path,`
        + " not a world coordinate: 0 is the from end, 1 the to end.",
      ];
    }
    return [];
  },
  apply: (ctx, p) => {
    // `along` is exempt from the 20 grid — it is a 0..1 fraction of the routed
    // path, not a world coordinate. `offset` is NOT exempt: it is a distance in
    // px that the chip is displaced by on the board, so it lands on the grid
    // like every other number this surface writes (grid.ts), and the summary
    // says so when the snap moved it.
    const offset = p.offset === undefined ? undefined : snapCoordinate(p.offset);
    const patch = (p.along === "auto"
      ? { labelPosition: undefined }
      : {
          labelPosition: {
            along: p.along as number,
            ...(offset !== undefined ? { offset } : {}),
          },
        }) as ConnectionPatch;
    return ctx.mergeConnection(
      p.id,
      patch,
      `move_label ${p.id}`
      + (p.along === "auto" ? " → auto" : ` → along ${p.along}`)
      + (p.along !== "auto" && offset !== undefined ? `, offset ${offset}` : ""),
    );
  },
});
