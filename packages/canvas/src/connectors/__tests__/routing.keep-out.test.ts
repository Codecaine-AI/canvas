/**
 * The router keeps every wire out of two things without a lint asking: a box
 * that is not one of its ends, and the caption painted under one of its own
 * icon ends. Stored bends that cross either are not drawn, and when the facing
 * sides are walled in the router searches other sides before it draws a
 * crossing at all.
 */
import { describe, expect, it } from "bun:test";

import type { CanvasBounds, CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { captionBandBounds, hitBoundsForObject } from "../../objects/geometry";
import { routeConnection } from "../routing";

function box(id: string, x: number, y: number, width = 300, height = 120): InteractiveCanvasObject {
  return { id, type: "process", text: id, geometry: { x, y, width, height } };
}

/** An icon in a 300x120 box whose detail line paints a caption far wider than its 56px tile. */
function icon(id: string, x: number, y: number): InteractiveCanvasObject {
  return {
    id,
    type: "icon",
    icon: "database",
    text: "Fallback reply",
    detail: "static template · no model call",
    geometry: { x, y, width: 300, height: 120 },
  };
}

function edge(
  from: InteractiveCanvasConnection["from"],
  to: InteractiveCanvasConnection["to"],
  waypoints?: Array<[number, number]>,
): InteractiveCanvasConnection {
  return { id: "e", from, to, ...(waypoints ? { waypoints } : {}) };
}

/** Length of an orthogonal polyline inside the closed rect. */
function runInside(points: ReadonlyArray<CanvasPoint>, rect: CanvasBounds): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    const x = Math.min(Math.max(a.x, b.x), rect.x + rect.width) - Math.max(Math.min(a.x, b.x), rect.x);
    const y = Math.min(Math.max(a.y, b.y), rect.y + rect.height) - Math.max(Math.min(a.y, b.y), rect.y);
    if (x >= 0 && y >= 0) total += Math.max(x, y);
  }
  return total;
}

/** Whether any leg passes through the open interior of `rect`. */
function crossesInterior(points: ReadonlyArray<CanvasPoint>, rect: CanvasBounds): boolean {
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1]!;
    const b = points[index]!;
    if (
      Math.max(a.x, b.x) > rect.x + 0.5 &&
      Math.min(a.x, b.x) < rect.x + rect.width - 0.5 &&
      Math.max(a.y, b.y) > rect.y + 0.5 &&
      Math.min(a.y, b.y) < rect.y + rect.height - 0.5
    ) {
      return true;
    }
  }
  return false;
}

function isOrthogonal(points: ReadonlyArray<CanvasPoint>): boolean {
  return points.every((point, index) => {
    const previous = points[index - 1];
    return !previous || Math.abs(previous.x - point.x) < 0.5 || Math.abs(previous.y - point.y) < 0.5;
  });
}

describe("routeConnection: a wire leaving an icon stays out of its own caption", () => {
  it("goes around the caption's overhang when it leaves the top for a target below", () => {
    // A replayed drawer board: top to top, target far below-left. The A* route
    // hugged the glyph column and dropped 48px through the caption beside it.
    const source = icon("source", 2520, 420);
    const target = icon("target", 600, 660);
    const routed = routeConnection(source, target, edge(
      { objectId: "source", anchor: "top" },
      { objectId: "target", anchor: "top" },
    ), [source, target]);

    const points = routed.points ?? [];
    expect(isOrthogonal(points)).toBe(true);
    expect(runInside(points, captionBandBounds(source)!)).toBeLessThanOrEqual(0.5);
    expect(runInside(points, captionBandBounds(target)!)).toBeLessThanOrEqual(0.5);
  });

  it("moves a side pin set in the caption's rows up onto the glyph's side", () => {
    // A pin at 85% down the left side sits beside the caption text, so the
    // straight wire to the box on the left ran through the caption.
    const source = icon("source", 580, 1240);
    const target = box("target", 100, 1240);
    const band = captionBandBounds(source)!;
    const routed = routeConnection(source, target, edge(
      { objectId: "source", anchor: "left", position: [0, 0.849] },
      { objectId: "target", anchor: "right" },
    ), [source, target]);

    expect(routed.start.y).toBeLessThan(band.y);
    expect(runInside(routed.points ?? [], band)).toBeLessThanOrEqual(0.5);
  });
});

describe("routeConnection: stored bends never draw a wire through a box", () => {
  it("routes automatically when a box now sits under the stored bends", () => {
    const a = box("a", 60, 100, 280, 100);
    const b = box("b", 560, 340, 280, 100);
    // Moved onto the stored vertical at x=450.
    const blocker = box("blocker", 400, 200, 100, 100);
    const routed = routeConnection(a, b, edge({ objectId: "a" }, { objectId: "b" }, [[450, 150], [450, 390]]), [
      a,
      b,
      blocker,
    ]);

    const points = routed.points ?? [];
    expect(isOrthogonal(points)).toBe(true);
    expect(crossesInterior(points, hitBoundsForObject(blocker))).toBe(false);
  });

  it("still draws the stored bends while they are clear", () => {
    const a = box("a", 60, 100, 280, 100);
    const b = box("b", 560, 340, 280, 100);
    const routed = routeConnection(a, b, edge({ objectId: "a" }, { objectId: "b" }, [[450, 150], [450, 390]]), [a, b]);

    expect(routed.points).toContainEqual({ x: 450, y: 150 });
    expect(routed.points).toContainEqual({ x: 450, y: 390 });
  });
});

describe("routeConnection: a walled-in route detours before it crosses a box", () => {
  it("leaves another side when a box 20px under the explicit anchor walls it in", () => {
    // A replayed move: the box under `source` now sits 20px below its bottom
    // anchor, and the A* search finds no path from that side. The old fallback
    // drew the plain elbow straight down through it.
    const source = box("source", 1080, 700);
    const wall = box("wall", 960, 840);
    const target = box("target", 600, 960);
    const routed = routeConnection(source, target, edge(
      { objectId: "source", anchor: "bottom" },
      { objectId: "target", anchor: "right" },
    ), [source, wall, target]);

    const points = routed.points ?? [];
    expect(isOrthogonal(points)).toBe(true);
    expect(crossesInterior(points, hitBoundsForObject(wall))).toBe(false);
  });
});
