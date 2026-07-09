import { describe, expect, it } from "bun:test";
import type { CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { dragOrthogonalSegment, polylineInteriorWaypoints } from "../bend-editing";
import { autoPickAnchors, routeConnection, routeConnectionToPoint, type Anchor } from "../routing";
import { CONNECTOR_END_GAP_PX } from "../routing";

const EPSILON = 1e-6;
const MIN_STUB = 24;
const SHORT_REVERSAL_THRESHOLD = 10;

/** Parses the trailing "L x y" (or "Q ... x y") pair from a rendered path string. */
function lastPointOf(path: string): CanvasPoint {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { x: numbers[numbers.length - 2], y: numbers[numbers.length - 1] };
}

/** Parses the leading "M x y" pair from a rendered path string. */
function firstPointOf(path: string): CanvasPoint {
  const numbers = [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  return { x: numbers[0], y: numbers[1] };
}

function expectClose(actual: number, expected: number): void {
  expect(Math.abs(actual - expected)).toBeLessThan(EPSILON);
}

function expectPointClose(actual: CanvasPoint, expected: CanvasPoint): void {
  expectClose(actual.x, expected.x);
  expectClose(actual.y, expected.y);
}

function object(id: string, x: number, y: number): InteractiveCanvasObject {
  return {
    id,
    type: "process",
    text: id,
    geometry: { x, y, width: 100, height: 60 },
  };
}

function connection(
  style?: InteractiveCanvasConnection["style"],
  anchors?: { from?: "top" | "right" | "bottom" | "left" | "center"; to?: "top" | "right" | "bottom" | "left" | "center" },
): InteractiveCanvasConnection {
  return {
    id: "connection",
    from: { objectId: "from", anchor: anchors?.from },
    to: { objectId: "to", anchor: anchors?.to },
    style,
  };
}

function borderPoint(object: InteractiveCanvasObject, anchor: Anchor): CanvasPoint {
  const { geometry } = object;
  if (anchor === "top") return { x: geometry.x + geometry.width / 2, y: geometry.y };
  if (anchor === "right") return { x: geometry.x + geometry.width, y: geometry.y + geometry.height / 2 };
  if (anchor === "bottom") return { x: geometry.x + geometry.width / 2, y: geometry.y + geometry.height };
  return { x: geometry.x, y: geometry.y + geometry.height / 2 };
}

function normalFor(anchor: Anchor): CanvasPoint {
  if (anchor === "top") return { x: 0, y: -1 };
  if (anchor === "right") return { x: 1, y: 0 };
  if (anchor === "bottom") return { x: 0, y: 1 };
  return { x: -1, y: 0 };
}

function shortReversalSegments(points: ReadonlyArray<CanvasPoint>) {
  const reversals = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const c = points[index + 1]!;
    const first = { x: b.x - a.x, y: b.y - a.y };
    const second = { x: c.x - b.x, y: c.y - b.y };
    const cross = first.x * second.y - first.y * second.x;
    const dot = first.x * second.x + first.y * second.y;
    const firstLength = Math.hypot(first.x, first.y);
    const secondLength = Math.hypot(second.x, second.y);

    if (
      Math.abs(cross) < EPSILON &&
      dot < -EPSILON &&
      Math.min(firstLength, secondLength) < SHORT_REVERSAL_THRESHOLD
    ) {
      reversals.push({ index, firstLength, secondLength });
    }
  }
  return reversals;
}

function nonOrthogonalSegments(points: ReadonlyArray<CanvasPoint>, epsilon = 0.5) {
  const segments = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const current = points[index]!;
    const dx = Math.abs(current.x - previous.x);
    const dy = Math.abs(current.y - previous.y);
    if (dx > epsilon && dy > epsilon) {
      segments.push({ from: previous, to: current });
    }
  }
  return segments;
}

function parseNumbers(path: string): number[] {
  return [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((match) => Number(match[0]));
}

function firstLineTarget(path: string): CanvasPoint {
  const numbers = parseNumbers(path);
  return { x: numbers[2], y: numbers[3] };
}

function isPointOnSegment(point: CanvasPoint, start: CanvasPoint, end: CanvasPoint): boolean {
  const cross = (point.x - start.x) * (end.y - start.y) - (point.y - start.y) * (end.x - start.x);
  const dot = (point.x - start.x) * (end.x - start.x) + (point.y - start.y) * (end.y - start.y);
  const lengthSquared = (end.x - start.x) ** 2 + (end.y - start.y) ** 2;
  return Math.abs(cross) < EPSILON && dot > EPSILON && dot < lengthSquared - EPSILON;
}

describe("routing", () => {
  describe("autoPickAnchors", () => {
    it("picks facing sides for horizontal layout", () => {
      const from = object("from", 0, 0);
      const to = object("to", 240, 0);

      expect(autoPickAnchors(from.geometry, to.geometry)).toEqual({
        startAnchor: "right",
        endAnchor: "left",
      });
    });

    it("picks facing sides for vertical layout", () => {
      const from = object("from", 0, 0);
      const to = object("to", 0, 180);

      expect(autoPickAnchors(from.geometry, to.geometry)).toEqual({
        startAnchor: "bottom",
        endAnchor: "top",
      });
    });

    it("uses horizontal anchors when diagonal horizontal separation dominates", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 80);

      expect(autoPickAnchors(from.geometry, to.geometry)).toEqual({
        startAnchor: "right",
        endAnchor: "left",
      });
    });

    it("uses vertical anchors when diagonal vertical separation dominates", () => {
      const from = object("from", 0, 0);
      const to = object("to", 80, 260);

      expect(autoPickAnchors(from.geometry, to.geometry)).toEqual({
        startAnchor: "bottom",
        endAnchor: "top",
      });
    });

    it("uses horizontal facing anchors when a left-of-target source vertically overlaps", () => {
      const from = {
        ...object("from", 0, 0),
        geometry: { x: 0, y: 0, width: 100, height: 300 },
      };
      const to = {
        ...object("to", 140, 180),
        geometry: { x: 140, y: 180, width: 100, height: 300 },
      };

      expect(autoPickAnchors(from.geometry, to.geometry)).toEqual({
        startAnchor: "right",
        endAnchor: "left",
      });
    });
  });

  describe("routeConnection", () => {
    it("routes elbow stubs perpendicular to start and end anchors", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 120);
      const routed = routeConnection(from, to, connection("solid"));
      const firstTarget = firstLineTarget(routed.path);
      const startNormal = normalFor(routed.startAnchor);
      const numbers = parseNumbers(routed.path);
      const finalLineStart = { x: numbers[numbers.length - 4], y: numbers[numbers.length - 3] };
      const endNormal = normalFor(routed.endAnchor);

      expectClose((firstTarget.x - routed.start.x) * startNormal.y, 0);
      expectClose((firstTarget.y - routed.start.y) * startNormal.x, 0);
      expect((firstTarget.x - routed.start.x) * startNormal.x + (firstTarget.y - routed.start.y) * startNormal.y).toBeGreaterThan(0);

      // The rendered path stops CONNECTOR_END_GAP_PX short of routed.end
      // (FigJam connectors never touch the target border) rather than
      // ending exactly at it — pulled back toward the shape (opposite the
      // end anchor's outward normal), but still collinear with it so the
      // connector still visually aims straight at the anchor.
      const renderedEnd = lastPointOf(routed.path);
      const gapVector = { x: routed.end.x - renderedEnd.x, y: routed.end.y - renderedEnd.y };
      expectClose(Math.hypot(gapVector.x, gapVector.y), CONNECTOR_END_GAP_PX);
      expectClose(gapVector.x * endNormal.y, gapVector.y * endNormal.x);
      expect(gapVector.x * endNormal.x + gapVector.y * endNormal.y).toBeLessThan(0);
      expectClose((routed.end.x - finalLineStart.x) * endNormal.y, 0);
      expectClose((routed.end.y - finalLineStart.y) * endNormal.x, 0);
      expect((routed.end.x - finalLineStart.x) * endNormal.x + (routed.end.y - finalLineStart.y) * endNormal.y).toBeLessThan(0);
    });

    it("pulls the rendered path back by CONNECTOR_END_GAP_PX at both ends without moving routed.start/end", () => {
      const from = object("from", 0, 0);
      const to = object("to", 240, 0);
      const routed = routeConnection(from, to, connection("solid"));

      const renderedStart = firstPointOf(routed.path);
      const renderedEnd = lastPointOf(routed.path);

      expectClose(Math.hypot(renderedStart.x - routed.start.x, renderedStart.y - routed.start.y), CONNECTOR_END_GAP_PX);
      expectClose(Math.hypot(renderedEnd.x - routed.end.x, renderedEnd.y - routed.end.y), CONNECTOR_END_GAP_PX);
      // Still aimed directly at the anchors (collinear with the start-end axis).
      expectClose(renderedStart.y, routed.start.y);
      expectClose(renderedEnd.y, routed.end.y);
    });

    it("auto-routes near-aligned facing anchors to an exactly horizontal slid segment", () => {
      const from = object("from", 0, 230);
      const to = object("to", 240, 234);
      const routed = routeConnection(from, to, connection("solid"));

      expect(routed.points).toEqual([routed.start, routed.end]);
      expectPointClose(routed.start, { x: 100, y: 262 });
      expectPointClose(routed.end, { x: 240, y: 262 });
      expectClose(routed.start.y, routed.end.y);
      expect(routed.start.y).toBeGreaterThanOrEqual(from.geometry.y + CONNECTOR_END_GAP_PX);
      expect(routed.start.y).toBeLessThanOrEqual(from.geometry.y + from.geometry.height - CONNECTOR_END_GAP_PX);
      expect(routed.end.y).toBeGreaterThanOrEqual(to.geometry.y + CONNECTOR_END_GAP_PX);
      expect(routed.end.y).toBeLessThanOrEqual(to.geometry.y + to.geometry.height - CONNECTOR_END_GAP_PX);
      expect(parseNumbers(routed.path).length).toBe(4);

      const renderedStart = firstPointOf(routed.path);
      const renderedEnd = lastPointOf(routed.path);
      expectClose(Math.hypot(renderedStart.x - routed.start.x, renderedStart.y - routed.start.y), CONNECTOR_END_GAP_PX);
      expectClose(Math.hypot(renderedEnd.x - routed.end.x, renderedEnd.y - routed.end.y), CONNECTOR_END_GAP_PX);
      expectClose(renderedStart.y, renderedEnd.y);
    });

    it("uses the same elbow route for solid and dashed line styles", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 120);
      const solid = routeConnection(from, to, connection("solid"));
      const dashed = routeConnection(from, to, connection("dashed"));

      expect(dashed.path).toBe(solid.path);
      expect(dashed.points).toEqual(solid.points);
      expect(dashed.labelPoint).toEqual(solid.labelPoint);
    });

    it("places elbow labels on the unrounded path middle", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 120);
      const routed = routeConnection(from, to, connection("solid"));
      const stubStart = { x: routed.start.x + MIN_STUB, y: routed.start.y };
      const stubEnd = { x: routed.end.x - MIN_STUB, y: routed.end.y };
      const midX = (stubStart.x + stubEnd.x) / 2;
      const rawPoints = [
        routed.start,
        stubStart,
        { x: midX, y: stubStart.y },
        { x: midX, y: stubEnd.y },
        stubEnd,
        routed.end,
      ];

      expect(routed.labelPoint).not.toEqual(routed.start);
      expect(routed.labelPoint).not.toEqual(routed.end);
      expect(
        rawPoints.some((point, index) => {
          const next = rawPoints[index + 1];
          return next ? isPointOnSegment(routed.labelPoint, point, next) : false;
        }),
      ).toBe(true);
    });

    it("places labels at the exact polyline arc-length midpoint", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 120);
      const routed = routeConnection(from, to, connection("solid", { from: "top", to: "left" }));

      expectPointClose(routed.labelPoint, { x: 56, y: 150 });
    });

    it("ignores stale waypoint polylines with diagonal segments and falls back to an orthogonal route", () => {
      const from = object("from", 0, 0);
      const to = object("to", 300, 160);
      const routed = routeConnection(from, to, {
        ...connection("solid", { from: "right", to: "left" }),
        waypoints: [[140, 80]],
      });

      expect(nonOrthogonalSegments(routed.points ?? [])).toEqual([]);
      expect(routed.points).not.toContainEqual({ x: 140, y: 80 });
    });

    it("round-trips interior waypoints from a stub drag on slid straight endpoints", () => {
      const from = object("from", 0, 230);
      const to = object("to", 240, 234);
      const base = routeConnection(from, to, connection("solid"), [from, to]);
      const firstBend = dragOrthogonalSegment(base.points ?? [], 0, { dx: 0, dy: 40 });
      const stubDrag = dragOrthogonalSegment(firstBend, 0, { dx: 30, dy: 0 });

      const routed = routeConnection(
        from,
        to,
        {
          ...connection("solid"),
          waypoints: polylineInteriorWaypoints(stubDrag),
        },
        [from, to],
      );

      expect(stubDrag).toEqual([
        { x: 100, y: 262 },
        { x: 130, y: 262 },
        { x: 130, y: 302 },
        { x: 240, y: 302 },
        { x: 240, y: 262 },
      ]);
      expect(routed.points).toEqual(stubDrag);
    });

    it("honors detoured waypoint polylines whose endpoint contacts slid off anchor midpoints", () => {
      const from = object("from", 0, 230);
      const to = object("to", 360, 234);
      const obstacle: InteractiveCanvasObject = {
        id: "obstacle",
        type: "process",
        text: "Obstacle",
        geometry: { x: 190, y: 180, width: 80, height: 150 },
      };
      const detoured = [
        { x: 100, y: 262 },
        { x: 130, y: 262 },
        { x: 130, y: 160 },
        { x: 330, y: 160 },
        { x: 330, y: 262 },
        { x: 360, y: 262 },
      ];

      const routed = routeConnection(
        from,
        to,
        {
          ...connection("solid", { from: "right", to: "left" }),
          waypoints: polylineInteriorWaypoints(detoured),
        },
        [from, to, obstacle],
      );

      expect(routed.points).toEqual(detoured);
    });

    it("respects explicit anchors and uses their border midpoints", () => {
      const from = object("from", 0, 0);
      const to = object("to", 240, 0);
      const routed = routeConnection(from, to, connection("solid", { from: "top", to: "left" }));

      expect(routed.startAnchor).toBe("top");
      expect(routed.endAnchor).toBe("left");
      expectPointClose(routed.start, borderPoint(from, "top"));
      expectPointClose(routed.end, borderPoint(to, "left"));
    });
  });

  describe("routeConnectionToPoint", () => {
    it("routes a free-point preview orthogonally with rounded corners and end gaps", () => {
      const from = object("from", 0, 0);
      const routed = routeConnectionToPoint(from, "right", { x: 280, y: 180 });

      expect(routed.start).toEqual({ x: 100, y: 30 });
      expect(routed.end).toEqual({ x: 280, y: 180 });
      expect(routed.path).toContain("Q");
      expect(routed.points).toEqual([
        { x: 100, y: 30 },
        { x: 124, y: 30 },
        { x: 190, y: 30 },
        { x: 190, y: 180 },
        { x: 256, y: 180 },
        { x: 280, y: 180 },
      ]);

      const renderedEnd = lastPointOf(routed.path);
      expectClose(Math.hypot(renderedEnd.x - routed.end.x, renderedEnd.y - routed.end.y), CONNECTOR_END_GAP_PX);
    });

    it("keeps an aligned free-point preview as a straight routed run", () => {
      const from = object("from", 0, 0);
      const routed = routeConnectionToPoint(from, "right", { x: 270, y: 30 });

      expect(routed.points).toEqual([routed.start, routed.end]);
      expect(parseNumbers(routed.path).length).toBe(4);
      expect(firstPointOf(routed.path)).toEqual({ x: 110, y: 30 });
      expect(lastPointOf(routed.path)).toEqual({ x: 260, y: 30 });
    });

    it("does not emit short reversal segments for nearby free-point previews", () => {
      const from = object("from", 0, 0);
      const anchors: Anchor[] = ["top", "right", "bottom", "left"];
      const offsets = [-20, -8, 8, 20];

      for (const anchor of anchors) {
        const start = borderPoint(from, anchor);
        const normal = normalFor(anchor);
        const tangent = { x: -normal.y, y: normal.x };

        for (const offset of offsets) {
          const point = {
            x: start.x + normal.x * 30 + tangent.x * offset,
            y: start.y + normal.y * 30 + tangent.y * offset,
          };
          const routed = routeConnectionToPoint(from, anchor, point);

          expect({
            anchor,
            offset,
            points: routed.points,
            reversals: shortReversalSegments(routed.points ?? []),
          }).toEqual({
            anchor,
            offset,
            points: routed.points,
            reversals: [],
          });
        }
      }
    });
  });
});
