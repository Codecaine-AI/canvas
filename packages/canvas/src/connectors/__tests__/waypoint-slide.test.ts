import { describe, expect, it } from "bun:test";
import type { CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { routeConnection } from "../routing";

function box(id: string, x: number, y: number): InteractiveCanvasObject {
  return { id, type: "process", text: id, geometry: { x, y, width: 100, height: 60 } };
}

function wire(
  from: InteractiveCanvasConnection["from"],
  to: InteractiveCanvasConnection["to"],
  waypoints: Array<[number, number]>,
): InteractiveCanvasConnection {
  return { id: "w", from, to, style: "solid", waypoints };
}

/** `points` without the points a straight run passes through. */
function corners(points: ReadonlyArray<CanvasPoint>): CanvasPoint[] {
  return points.filter((point, index) => {
    const before = points[index - 1];
    const after = points[index + 1];
    if (!before || !after) return true;
    const straightX = Math.abs(before.x - point.x) < 0.01 && Math.abs(point.x - after.x) < 0.01;
    const straightY = Math.abs(before.y - point.y) < 0.01 && Math.abs(point.y - after.y) < 0.01;
    return !straightX && !straightY;
  });
}

describe("stored waypoints after a port change", () => {
  const from = box("from", 0, 0);
  const to = box("to", 400, 200);
  // Drawn when the wire left the middle of the right side (y 30).
  const waypoints: Array<[number, number]> = [[320, 30], [320, 230]];

  it("keeps the stored lane when the start port moves along its side", () => {
    const moved = wire({ objectId: "from", anchor: "right", position: [1, 0.75] }, { objectId: "to", anchor: "left" }, waypoints);
    const routed = routeConnection(from, to, moved, [from, to]);
    expect(corners(routed.points!)).toEqual([
      { x: 100, y: 45 },
      { x: 320, y: 45 },
      { x: 320, y: 230 },
      { x: 400, y: 230 },
    ]);
  });

  it("keeps the stored lane when the end port moves along its side", () => {
    const moved = wire({ objectId: "from", anchor: "right" }, { objectId: "to", anchor: "left", position: [0, 0.25] }, waypoints);
    const routed = routeConnection(from, to, moved, [from, to]);
    expect(corners(routed.points!)).toEqual([
      { x: 100, y: 30 },
      { x: 320, y: 30 },
      { x: 320, y: 215 },
      { x: 400, y: 215 },
    ]);
  });

  it("keeps a stored one-corner path", () => {
    const below = box("below", 300, 300);
    // Drawn down from the middle of the bottom side (x 50), then right.
    const moved = wire({ objectId: "from", position: [0.75, 1] }, { objectId: "below" }, [[50, 330]]);
    const routed = routeConnection(from, below, moved, [from, below]);
    expect(corners(routed.points!)).toEqual([
      { x: 75, y: 60 },
      { x: 75, y: 330 },
      { x: 300, y: 330 },
    ]);
  });

  it("drops a stored corner that would run the wire along its box edge", () => {
    const below = box("below", 300, 300);
    // The corner enters `below` from the top, and the end now sits on its left side.
    const moved = wire({ objectId: "from", position: [1, 0.75] }, { objectId: "below" }, [[350, 30]]);
    const points = corners(routeConnection(from, below, moved, [from, below]).points!);
    const last = points[points.length - 1]!;
    const before = points[points.length - 2]!;
    expect(last).toEqual({ x: 300, y: 330 });
    expect(before.y).toBe(330);
    expect(before.x).toBeLessThan(300);
  });
});
