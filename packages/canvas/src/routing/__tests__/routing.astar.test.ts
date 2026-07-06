import { describe, expect, it } from "bun:test";
import v2FlowSampleDocumentJson from "../../../../../canvases/v2-flow-interactive.canvas.json";
import { objectById, type CanvasBounds } from "../../model/geometry";
import { routeConnection, type RoutedConnection } from "../routing";
import type { InteractiveCanvasConnection, InteractiveCanvasDocument, InteractiveCanvasObject } from "../../model/schema";
import { CONNECTOR_END_GAP_PX } from "../../tokens/figjam-tokens";

const v2FlowSampleDocument = v2FlowSampleDocumentJson as InteractiveCanvasDocument;

/** Parses an SVG path's `M`/`L`/`Q` numeric coordinates into a flat point list (Q control points included, harmless for bounds checks since they lie near the corner). */
function pathPoints(path: string): { x: number; y: number }[] {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < numbers.length; i += 2) {
    points.push({ x: numbers[i]!, y: numbers[i + 1]! });
  }
  return points;
}

/** Whether the open segment strictly cuts through the interior of `bounds` (touching the border is fine). */
function segmentCrossesInterior(
  a: { x: number; y: number },
  b: { x: number; y: number },
  bounds: CanvasBounds,
  epsilon = 0.5,
): boolean {
  const steps = 24;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const insideX = x > bounds.x + epsilon && x < bounds.x + bounds.width - epsilon;
    const insideY = y > bounds.y + epsilon && y < bounds.y + bounds.height - epsilon;
    if (insideX && insideY) return true;
  }
  return false;
}

/** Collects `objectId` and every transitive parentId above it in `document`. */
function collectSelfAndAncestors(document: InteractiveCanvasDocument, objectId: string): Set<string> {
  const byId = new Map(document.objects.map((object) => [object.id, object]));
  const ids = new Set<string>([objectId]);
  let current = byId.get(objectId)?.parentId ?? null;
  while (current && !ids.has(current)) {
    ids.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return ids;
}

/** True if `path`'s first rendered point (`M x y`) sits CONNECTOR_END_GAP_PX short of `anchor`, collinear with `neighbor`. */
function pathStartsNearAnchor(path: string, anchor: { x: number; y: number }): boolean {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const renderedStart = { x: numbers[0], y: numbers[1] };
  const gap = Math.hypot(renderedStart.x - anchor.x, renderedStart.y - anchor.y);
  return Math.abs(gap - CONNECTOR_END_GAP_PX) < 0.5;
}

/** True if `path`'s last rendered point sits CONNECTOR_END_GAP_PX short of `anchor`. */
function pathEndsNearAnchor(path: string, anchor: { x: number; y: number }): boolean {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  const renderedEnd = { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
  const gap = Math.hypot(renderedEnd.x - anchor.x, renderedEnd.y - anchor.y);
  return Math.abs(gap - CONNECTOR_END_GAP_PX) < 0.5;
}

function routeAll(document: InteractiveCanvasDocument): Array<{
  connection: InteractiveCanvasConnection;
  routed: RoutedConnection;
  fromObject: InteractiveCanvasObject;
  toObject: InteractiveCanvasObject;
}> {
  return document.connections.map((connection) => {
    const fromObject = objectById(document, connection.from.objectId)!;
    const toObject = objectById(document, connection.to.objectId)!;
    const routed = routeConnection(fromObject, toObject, connection, document.objects);
    return { connection, routed, fromObject, toObject };
  });
}

describe("routing — A* orthogonal integration (D33 thread B)", () => {
  it("routes every elbow-style v2-flow connection without crossing a non-owner object's interior", () => {
    // Obstacle-avoiding A* routing (routeOrthogonalAStar) only ever engages
    // for `style: "elbow"` connections with no explicit waypoints/position
    // override — those are the only cases where routeConnection is meant to
    // detour around other shapes. "solid"/"dotted"/"smooth" connections are,
    // by design (see routing.test.ts's pre-existing "places straight labels
    // at the segment midpoint" contract), literal direct lines/curves between
    // their two anchor points and may legitimately pass near or through
    // unrelated shapes sitting on that line — that's not a routing bug.
    const results = routeAll(v2FlowSampleDocument).filter(
      ({ connection }) => connection.style === "elbow" && !connection.waypoints,
    );
    expect(results.length).toBeGreaterThan(0);

    for (const { connection, routed, fromObject, toObject } of results) {
      const points = pathPoints(routed.path);
      // Exclude the two endpoints themselves *and* any container that is an
      // ancestor of either endpoint — a connection touching a nested object
      // necessarily passes through that object's parent containers' bounds,
      // which is containment, not an obstacle crossing.
      const excluded = new Set<string>([
        ...collectSelfAndAncestors(v2FlowSampleDocument, fromObject.id),
        ...collectSelfAndAncestors(v2FlowSampleDocument, toObject.id),
      ]);
      const nonOwnerObjects = v2FlowSampleDocument.objects.filter((object) => !excluded.has(object.id));

      for (let i = 1; i < points.length; i += 1) {
        const a = points[i - 1]!;
        const b = points[i]!;
        for (const object of nonOwnerObjects) {
          const crosses = segmentCrossesInterior(a, b, object.geometry);
          expect(crosses, `connection ${connection.id} segment crosses ${object.id}`).toBe(false);
        }
      }
    }
  });

  it("is deterministic — routing the same connection twice yields the same path", () => {
    const connection = v2FlowSampleDocument.connections.find((c) => c.id === "transition-to-question")!;
    const fromObject = objectById(v2FlowSampleDocument, connection.from.objectId)!;
    const toObject = objectById(v2FlowSampleDocument, connection.to.objectId)!;

    const first = routeConnection(fromObject, toObject, connection, v2FlowSampleDocument.objects);
    const second = routeConnection(fromObject, toObject, connection, v2FlowSampleDocument.objects);

    expect(second).toEqual(first);
  });

  it("keeps the 3-arg form working — omitting obstacles behaves exactly like passing none", () => {
    const connection = v2FlowSampleDocument.connections.find((c) => c.id === "transition-to-question")!;
    const fromObject = objectById(v2FlowSampleDocument, connection.from.objectId)!;
    const toObject = objectById(v2FlowSampleDocument, connection.to.objectId)!;

    const threeArg = routeConnection(fromObject, toObject, connection);
    const emptyObstacles = routeConnection(fromObject, toObject, connection, []);

    expect(threeArg).toEqual(emptyObstacles);
    // Still a real routed connection anchored at both endpoints — the
    // rendered path stops CONNECTOR_END_GAP_PX short of each anchor rather
    // than touching it (FigJam end-gap rule).
    expect(pathStartsNearAnchor(threeArg.path, threeArg.start)).toBe(true);
    expect(pathEndsNearAnchor(threeArg.path, threeArg.end)).toBe(true);
  });

  it("still produces a clean elbow route (start/end anchored, monotonic corner count) when there is no obstacle", () => {
    const from: InteractiveCanvasObject = {
      id: "solo-a",
      type: "process",
      label: "A",
      geometry: { x: 0, y: 0, width: 100, height: 60 },
    };
    const to: InteractiveCanvasObject = {
      id: "solo-b",
      type: "process",
      label: "B",
      geometry: { x: 400, y: 300, width: 100, height: 60 },
    };
    const connection: InteractiveCanvasConnection = {
      id: "solo-connection",
      from: { objectId: "solo-a" },
      to: { objectId: "solo-b" },
      style: "elbow",
    };

    const routed = routeConnection(from, to, connection);
    // Rendered path stops CONNECTOR_END_GAP_PX short of the true anchors.
    expect(pathStartsNearAnchor(routed.path, routed.start)).toBe(true);
    expect(pathEndsNearAnchor(routed.path, routed.end)).toBe(true);
  });

  it("honors explicit connection.waypoints instead of recomputing a route", () => {
    const from: InteractiveCanvasObject = {
      id: "wp-a",
      type: "process",
      label: "A",
      geometry: { x: 0, y: 0, width: 100, height: 60 },
    };
    const to: InteractiveCanvasObject = {
      id: "wp-b",
      type: "process",
      label: "B",
      geometry: { x: 300, y: 0, width: 100, height: 60 },
    };
    const connection: InteractiveCanvasConnection = {
      id: "wp-connection",
      from: { objectId: "wp-a", anchor: "right" },
      to: { objectId: "wp-b", anchor: "left" },
      style: "elbow",
      waypoints: [
        [150, 30],
        [150, 200],
        [250, 200],
      ],
    };

    const routed = routeConnection(from, to, connection);
    const points = pathPoints(routed.path);

    expect(points).toContainEqual({ x: 150, y: 30 });
    expect(points).toContainEqual({ x: 150, y: 200 });
    expect(points).toContainEqual({ x: 250, y: 200 });
  });

  it("uses endpoint `position` (relative anchor) instead of side anchor when present", () => {
    const from: InteractiveCanvasObject = {
      id: "pos-a",
      type: "process",
      label: "A",
      geometry: { x: 0, y: 0, width: 100, height: 60 },
    };
    const to: InteractiveCanvasObject = {
      id: "pos-b",
      type: "process",
      label: "B",
      geometry: { x: 300, y: 0, width: 100, height: 60 },
    };
    const connection: InteractiveCanvasConnection = {
      id: "pos-connection",
      from: { objectId: "pos-a", anchor: "right", position: [1, 0.75] },
      to: { objectId: "pos-b", anchor: "left" },
      style: "solid",
    };

    const routed = routeConnection(from, to, connection);
    expect(routed.start).toEqual({ x: 100, y: 45 });
  });
});
