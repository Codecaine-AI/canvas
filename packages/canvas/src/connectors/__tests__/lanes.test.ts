import { describe, expect, it } from "bun:test";
import type { CanvasPoint } from "../../state/geometry";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";
import { chipPointOnRoute, routeConnection, routeConnectionOnBoard } from "../routing";
import { renderDocumentToSvg } from "../../render/static-svg";

function box(id: string, x: number, y: number, width = 100, height = 60): InteractiveCanvasObject {
  return { id, type: "process", text: id, geometry: { x, y, width, height } };
}

function wire(
  id: string,
  from: InteractiveCanvasConnection["from"],
  to: InteractiveCanvasConnection["to"],
  rest: Partial<InteractiveCanvasConnection> = {},
): InteractiveCanvasConnection {
  return { id, from, to, style: "solid", ...rest };
}

/** Every wire of the board as the board draws it, corners only. */
function drawn(objects: InteractiveCanvasObject[], connections: InteractiveCanvasConnection[]): Map<string, CanvasPoint[]> {
  const byId = new Map(objects.map((object) => [object.id, object]));
  const board = { objects, connections };
  return new Map(connections.map((connection) => {
    const routed = routeConnectionOnBoard(board, connection, byId.get(connection.from.objectId)!, byId.get(connection.to.objectId)!);
    return [connection.id, corners(routed.points ?? [routed.start, routed.end])];
  }));
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

/** The longest stretch two wires run side by side, 8px apart or closer. */
function sharedRunPx(a: ReadonlyArray<CanvasPoint>, b: ReadonlyArray<CanvasPoint>): number {
  let longest = 0;
  for (let i = 1; i < a.length; i += 1) {
    for (let j = 1; j < b.length; j += 1) {
      const [p, q, r, s] = [a[i - 1]!, a[i]!, b[j - 1]!, b[j]!];
      for (const [across, along] of [["y", "x"], ["x", "y"]] as const) {
        if (Math.abs(p[across] - q[across]) > 0.01 || Math.abs(r[across] - s[across]) > 0.01) continue;
        if (Math.abs(p[across] - r[across]) > 8) continue;
        const shared = Math.min(Math.max(p[along], q[along]), Math.max(r[along], s[along])) -
          Math.max(Math.min(p[along], q[along]), Math.min(r[along], s[along]));
        longest = Math.max(longest, shared);
      }
    }
  }
  return longest;
}

/** Points where a run of one wire passes through a run of the other. */
function crossings(a: ReadonlyArray<CanvasPoint>, b: ReadonlyArray<CanvasPoint>): number {
  let count = 0;
  for (let i = 1; i < a.length; i += 1) {
    for (let j = 1; j < b.length; j += 1) {
      const [p, q, r, s] = [a[i - 1]!, a[i]!, b[j - 1]!, b[j]!];
      const pHorizontal = Math.abs(p.y - q.y) < 0.01;
      const rHorizontal = Math.abs(r.y - s.y) < 0.01;
      if (pHorizontal === rHorizontal) continue;
      const [h0, h1, v0, v1] = pHorizontal ? [p, q, r, s] : [r, s, p, q];
      if (
        v0.x > Math.min(h0.x, h1.x) + 0.5 && v0.x < Math.max(h0.x, h1.x) - 0.5 &&
        h0.y > Math.min(v0.y, v1.y) + 0.5 && h0.y < Math.max(v0.y, v1.y) - 0.5
      ) count += 1;
    }
  }
  return count;
}

describe("lanes on a board", () => {
  const source = box("source", 0, 200);
  const upper = box("upper", 400, 0);
  const lower = box("lower", 400, 400);

  it("gives two meanings that leave one side two ports and two lanes", () => {
    const objects = [source, upper, lower];
    const connections = [
      wire("solid", { objectId: "source", anchor: "right" }, { objectId: "upper", anchor: "left" }),
      wire("dashed", { objectId: "source", anchor: "right" }, { objectId: "lower", anchor: "left" }, { style: "dashed" }),
    ];
    const routes = drawn(objects, connections);
    const solid = routes.get("solid")!;
    const dashed = routes.get("dashed")!;
    expect(sharedRunPx(solid, dashed)).toBeLessThanOrEqual(0);
    expect(Math.abs(solid[0]!.y - dashed[0]!.y)).toBeCloseTo(16, 5);
    expect(crossings(solid, dashed)).toBe(0);
  });

  it("gives two colours that leave one side two lanes", () => {
    const objects = [source, upper, lower];
    const connections = [
      wire("blue", { objectId: "source", anchor: "right" }, { objectId: "upper", anchor: "left" }, { color: "blue" }),
      wire("red", { objectId: "source", anchor: "right" }, { objectId: "lower", anchor: "left" }, { color: "red" }),
    ];
    const routes = drawn(objects, connections);
    expect(sharedRunPx(routes.get("blue")!, routes.get("red")!)).toBeLessThanOrEqual(0);
  });

  it("keeps one trunk for one meaning", () => {
    const objects = [source, upper, lower];
    const connections = [
      wire("a", { objectId: "source", anchor: "right" }, { objectId: "upper", anchor: "left" }),
      wire("b", { objectId: "source", anchor: "right" }, { objectId: "lower", anchor: "left" }),
    ];
    const routes = drawn(objects, connections);
    const a = routes.get("a")!;
    const b = routes.get("b")!;
    expect(a[0]).toEqual(b[0]!);
    expect(sharedRunPx(a, b)).toBeGreaterThan(40);
  });

  it("never lets an incoming and an outgoing wire share a port", () => {
    const target = box("target", 400, 200);
    const objects = [source, target, lower];
    const connections = [
      wire("out", { objectId: "source", anchor: "right" }, { objectId: "target", anchor: "left" }),
      wire("in", { objectId: "lower", anchor: "left" }, { objectId: "source", anchor: "right" }),
    ];
    const routes = drawn(objects, connections);
    const out = routes.get("out")!;
    const incoming = routes.get("in")!;
    expect(sharedRunPx(out, incoming)).toBeLessThanOrEqual(0);
    // The straight wire stays straight, and the arrowhead of the other gets a port of its own.
    expect(out).toEqual([{ x: 100, y: 230 }, { x: 400, y: 230 }]);
    expect(Math.abs(incoming[incoming.length - 1]!.y - 230)).toBeCloseTo(16, 5);
    expect(crossings(out, incoming)).toBe(0);
  });

  it("keeps a fan-in of one dash as one junction with one arrowhead", () => {
    const sink = box("sink", 400, 200);
    const top = box("top", 0, 0);
    const bottom = box("bottom", 0, 400);
    const objects = [sink, top, bottom];
    const connections = [
      wire("a", { objectId: "top", anchor: "right" }, { objectId: "sink", anchor: "left" }),
      wire("b", { objectId: "bottom", anchor: "right" }, { objectId: "sink", anchor: "left" }),
    ];
    const routes = drawn(objects, connections);
    const a = routes.get("a")!;
    const b = routes.get("b")!;
    expect(a[a.length - 1]).toEqual(b[b.length - 1]!);
  });

  it("parts two meanings that an author stored on one lane", () => {
    const left = box("left", 0, 0);
    const right = box("right", 300, 0);
    const sink = box("sink", 600, 300);
    const objects = [left, right, sink];
    const connections = [
      wire("solid", { objectId: "left", anchor: "bottom" }, { objectId: "sink", anchor: "left" }, { waypoints: [[50, 330]] }),
      wire("dashed", { objectId: "right", anchor: "bottom" }, { objectId: "sink", anchor: "left" }, { style: "dashed", waypoints: [[350, 330]] }),
    ];
    const routes = drawn(objects, connections);
    const solid = routes.get("solid")!;
    const dashed = routes.get("dashed")!;
    expect(sharedRunPx(solid, dashed)).toBeLessThanOrEqual(0);
    // Each keeps its own arrowhead.
    expect(Math.abs(solid[solid.length - 1]!.y - dashed[dashed.length - 1]!.y)).toBeGreaterThanOrEqual(10);
    expect(crossings(solid, dashed)).toBe(0);
  });

  it("trades stored lanes that cross for lanes that nest", () => {
    const job = box("job", 0, 0, 300, 120);
    const targets = [box("t1", 800, 170), box("t2", 800, 370), box("t3", 800, 570)];
    const objects = [job, ...targets];
    // Each wire turns down in the lane nearest its port, so each lane cuts the wires above it.
    const connections = targets.map((target, index) => wire(
      `w${index}`,
      { objectId: "job", anchor: "right", position: [1, 0.5 + index / 6] },
      { objectId: target.id, anchor: "left" },
      { waypoints: [[360 + index * 20, 60 + index * 20], [360 + index * 20, 200 + index * 200]] },
    ));
    const solo = connections.map((connection, index) => corners(routeConnection(job, targets[index]!, connection, objects).points!));
    expect(crossings(solo[0]!, solo[1]!) + crossings(solo[0]!, solo[2]!) + crossings(solo[1]!, solo[2]!)).toBe(6);

    const routes = [...drawn(objects, connections).values()];
    expect(crossings(routes[0]!, routes[1]!) + crossings(routes[0]!, routes[2]!) + crossings(routes[1]!, routes[2]!)).toBe(0);
    // The three stored lanes stay: only their order changes.
    expect(routes.map((points) => points[1]!.x).sort()).toEqual([360, 380, 400]);
  });

  it("leaves a wire with no neighbour as routeConnection draws it", () => {
    const objects = [source, upper];
    const only = wire("only", { objectId: "source", anchor: "right" }, { objectId: "upper", anchor: "left" });
    const routed = routeConnectionOnBoard({ objects, connections: [only] }, only, source, upper);
    expect(routed).toEqual(routeConnection(source, upper, only, objects));
  });

  it("keeps a label chip on a wire the lanes moved", () => {
    const objects = [source, upper, lower];
    const connections = [
      wire("solid", { objectId: "source", anchor: "right" }, { objectId: "upper", anchor: "left" }),
      wire("dashed", { objectId: "source", anchor: "right" }, { objectId: "lower", anchor: "left" }, { style: "dashed" }),
    ];
    const board = { objects, connections };
    for (const [connection, target] of [[connections[0]!, upper], [connections[1]!, lower]] as const) {
      const solo = routeConnection(source, target, connection, objects);
      const laned = routeConnectionOnBoard(board, connection, source, target);
      // The chip sits on the first run of the wire's own route.
      const chip = { x: solo.points![0]!.x + 40, y: solo.points![0]!.y };
      const followed = chipPointOnRoute(chip, laned, connection);
      expect(followed.x).toBeCloseTo(chip.x, 5);
      expect(followed.y).toBeCloseTo(laned.points![0]!.y, 5);
    }
  });

  it("paints each wire in its lane in the static render", () => {
    const objects = [source, upper, lower];
    const connections = [
      wire("solid", { objectId: "source", anchor: "right" }, { objectId: "upper", anchor: "left" }),
      wire("dashed", { objectId: "source", anchor: "right" }, { objectId: "lower", anchor: "left" }, { style: "dashed" }),
    ];
    const { svg } = renderDocumentToSvg({ schemaVersion: 1, id: "lanes", mode: "diagram", objects, connections });
    const board = { objects, connections };
    for (const [connection, target] of [[connections[0]!, upper], [connections[1]!, lower]] as const) {
      expect(svg).toContain(`d="${routeConnectionOnBoard(board, connection, source, target).path}"`);
    }
    // The dashed wire moved, so the route it had alone is not painted.
    expect(svg).not.toContain(`d="${routeConnection(source, lower, connections[1]!, objects).path}"`);
  });
});
