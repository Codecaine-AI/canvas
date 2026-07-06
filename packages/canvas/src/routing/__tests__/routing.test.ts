import { describe, expect, it } from "bun:test";
import type { CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { autoPickAnchors, routeConnection, type Anchor } from "../routing";
import { CONNECTOR_END_GAP_PX } from "../../tokens/figjam-tokens";

const EPSILON = 1e-6;
const MIN_STUB = 24;

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
    label: id,
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
  });

  describe("routeConnection", () => {
    it("routes elbow stubs perpendicular to start and end anchors", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 120);
      const routed = routeConnection(from, to, connection("elbow"));
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

    it("places straight labels at the segment midpoint", () => {
      const from = object("from", 0, 0);
      const to = object("to", 240, 0);
      const routed = routeConnection(from, to, connection("dotted"));

      expectPointClose(routed.labelPoint, {
        x: (routed.start.x + routed.end.x) / 2,
        y: (routed.start.y + routed.end.y) / 2,
      });
    });

    it("places smooth labels at cubic t=0.5", () => {
      const from = object("from", 0, 0);
      const to = object("to", 240, 0);
      const routed = routeConnection(from, to, connection("smooth"));
      const controlDistance = Math.max(40, Math.hypot(routed.end.x - routed.start.x, routed.end.y - routed.start.y) / 2);
      const startNormal = normalFor(routed.startAnchor);
      const endNormal = normalFor(routed.endAnchor);
      const control1 = {
        x: routed.start.x + startNormal.x * controlDistance,
        y: routed.start.y + startNormal.y * controlDistance,
      };
      const control2 = {
        x: routed.end.x + endNormal.x * controlDistance,
        y: routed.end.y + endNormal.y * controlDistance,
      };

      expectPointClose(routed.labelPoint, {
        x: 0.125 * routed.start.x + 0.375 * control1.x + 0.375 * control2.x + 0.125 * routed.end.x,
        y: 0.125 * routed.start.y + 0.375 * control1.y + 0.375 * control2.y + 0.125 * routed.end.y,
      });
    });

    it("places elbow labels on the unrounded path middle", () => {
      const from = object("from", 0, 0);
      const to = object("to", 260, 120);
      const routed = routeConnection(from, to, connection("elbow"));
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
});
