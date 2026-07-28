/**
 * The one place an edge's routed polyline is turned into NUMBERED SEGMENTS.
 *
 * Three consumers share this formatter so they can never disagree about which
 * segment "s2" is: the board digest's edge lines, the ROUTES block, and (once
 * the edge gesture group lands) the routing ops' own results. The printed
 * shape is the surface spec's:
 *
 *     e1: A ─(s0 h y=240)→ (s1 v x=520) ─(s2 h y=300)→ B
 *
 * A horizontal segment is defined by its y, a vertical one by its x — that
 * single number is the one `shift_segment(id, segment, to)` writes, so the
 * printed coordinate is literally the value the model is about to change.
 * Horizontal segments carry the `─…→` wire glyph; vertical segments print
 * bare, because a vertical run cannot be drawn inline.
 *
 * ## The indexing rule (the contract `shift_segment` depends on)
 *
 * `index` is the polyline POINT-PAIR index: segment `sN` runs from
 * `points[N]` to `points[N+1]`. This is exactly `ConnectorBendSegment.index`
 * from the canvas package's `connectorBendSegments`
 * (packages/canvas/src/connectors/bend-editing.ts) — the same numbering the
 * on-stage bend handles use and the same numbering `dragOrthogonalSegment`
 * accepts. End stubs are NOT excluded: `dragOrthogonalSegment` handles
 * segment 0 and segment `points.length - 2` through its start/end-stub paths,
 * so they are shiftable and therefore numbered. Indices are never
 * renumbered — a segment the enumerator drops leaves a hole rather than
 * shifting its neighbours down, so `sN` always means `points[N] → points[N+1]`.
 *
 * Two kinds of segment are not axis-aligned, and `connectorBendSegments`
 * omits both (its `segmentAxis` returns null):
 *
 *  - **Degenerate** (both deltas within AXIS_EPSILON): a zero-length hop.
 *    Dropped here too — there is nothing to draw and `dragOrthogonalSegment`
 *    is a no-op on it.
 *  - **Near-diagonal** (both deltas exceed AXIS_EPSILON): happens when an
 *    endpoint position pin puts the wire off-axis. Printed with its DOMINANT
 *    axis (the longer delta) and that axis' MIDPOINT coordinate, rounded, so
 *    perception still describes the whole wire. Such a segment has no bend
 *    handle on stage, so a shift of it is best avoided; its index is still
 *    reserved so the neighbours keep their numbers.
 *
 * Collinear runs are NOT merged. The auto-router emits short anchor stubs, so
 * `s0` and `s1` are often the same straight line at the same coordinate. That
 * is what the stage draws handles for (`Connector.tsx` feeds `routed.points`
 * to `connectorBendSegments` unsimplified), so it is what the model must be
 * able to name.
 *
 * All printed coordinates are whole world units (`Math.round`).
 */
import type {
  InteractiveCanvasConnection,
  InteractiveCanvasDocument,
} from "@codecaine-ai/canvas/schema";

import { connectorBendSegments } from "../../../canvas/src/connectors/bend-editing.ts";

import { routedPolyline, type Point } from "./lints/geometry.ts";

/** Same tolerance `bend-editing.ts` uses to call a segment axis-aligned. */
const AXIS_EPSILON = 0.01;

/** `h` = horizontal (defined by its y) · `v` = vertical (defined by its x). */
export type RouteSegmentAxis = "h" | "v";

export interface NumberedRouteSegment {
  /** Point-pair index — the index `shift_segment` accepts. */
  index: number;
  axis: RouteSegmentAxis;
  /** The coordinate the segment is pinned at: y when `h`, x when `v`. */
  fixed: number;
  from: Point;
  to: Point;
}

/**
 * Number a polyline's segments. Exported for callers that already routed the
 * edge (the ROUTES block routes once and reuses the points).
 */
export function numberedSegmentsForPolyline(
  points: readonly Point[],
): NumberedRouteSegment[] {
  const axisByIndex = new Map(
    connectorBendSegments(points).map((segment) => [segment.index, segment.axis]),
  );
  const segments: NumberedRouteSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]!;
    const to = points[index + 1]!;
    const bendAxis = axisByIndex.get(index);
    let axis: RouteSegmentAxis;
    if (bendAxis !== undefined) {
      axis = bendAxis === "horizontal" ? "h" : "v";
    } else {
      const dx = Math.abs(to.x - from.x);
      const dy = Math.abs(to.y - from.y);
      // Degenerate hop: bend-editing drops it and so do we (index reserved).
      if (dx <= AXIS_EPSILON && dy <= AXIS_EPSILON) continue;
      // Near-diagonal: dominant axis wins.
      axis = dx >= dy ? "h" : "v";
    }
    segments.push({
      index,
      axis,
      fixed: axis === "h" ? (from.y + to.y) / 2 : (from.x + to.x) / 2,
      from: { x: from.x, y: from.y },
      to: { x: to.x, y: to.y },
    });
  }
  return segments;
}

/**
 * The edge's routed polyline as numbered segments. Empty when the edge is
 * unroutable (a missing endpoint object) or collapses to nothing.
 */
export function numberedRouteSegments(
  connection: InteractiveCanvasConnection,
  document: InteractiveCanvasDocument,
): NumberedRouteSegment[] {
  return numberedSegmentsForPolyline(routedPolyline(connection, document));
}

function formatSegment(segment: NumberedRouteSegment): string {
  const coordinate = segment.axis === "h" ? "y" : "x";
  const body = `(s${segment.index} ${segment.axis} ${coordinate}=${Math.round(segment.fixed)})`;
  return segment.axis === "h" ? `─${body}→` : body;
}

/**
 * Render already-numbered segments between two endpoint ids:
 * `A ─(s0 h y=240)→ (s1 v x=520) ─(s2 h y=300)→ B`. Empty string when there
 * is no route to describe, so callers can omit the field entirely.
 */
export function formatNumberedSegments(
  fromId: string,
  toId: string,
  segments: readonly NumberedRouteSegment[],
): string {
  if (segments.length === 0) return "";
  return [fromId, ...segments.map(formatSegment), toId].join(" ");
}

/**
 * The digest/ROUTES/routing-op string for one edge. Empty when the edge is
 * unroutable.
 */
export function formatNumberedRoute(
  connection: InteractiveCanvasConnection,
  document: InteractiveCanvasDocument,
): string {
  return formatNumberedSegments(
    connection.from.objectId,
    connection.to.objectId,
    numberedRouteSegments(connection, document),
  );
}
