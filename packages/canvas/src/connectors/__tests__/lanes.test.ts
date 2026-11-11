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
      wire("solid", { objectId: "left", anchor: "bottom" }, { objectId: "sink", anchor: "left" }, { color: "blue", waypoints: [[50, 330]] }),
      wire("dashed", { objectId: "right", anchor: "bottom" }, { objectId: "sink", anchor: "left" }, { color: "red", style: "dashed", waypoints: [[350, 330]] }),
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

describe("ports on a board", () => {
  const tip = (points: ReadonlyArray<CanvasPoint>) => points[points.length - 1]!;

  it("centres a lone arrowhead on its side, even one the author pinned off centre", () => {
    const a = box("a", 0, 0);
    const b = box("b", 300, 300, 200);
    const pinned = wire("w", { objectId: "a", anchor: "right" }, { objectId: "b", anchor: "top", position: [0.2, 0] });
    expect(tip(drawn([a, b], [pinned]).get("w")!)).toEqual({ x: 400, y: 300 });
    // Alone, the wire still ends on the pin.
    expect(tip(routeConnection(a, b, pinned, [a, b]).points!)).toEqual({ x: 340, y: 300 });
  });

  it("runs a wire straight into the centre its arrowhead sits on", () => {
    // Boxes 4px out of line: the end without the arrowhead slides.
    const nearly = drawn([box("a", 0, 230), box("b", 240, 234)], [wire("w", { objectId: "a" }, { objectId: "b" })]);
    expect(nearly.get("w")).toEqual([{ x: 100, y: 264 }, { x: 240, y: 264 }]);
    // A pinned tail slides too, any distance along its side.
    const pinned = wire("w", { objectId: "wide", anchor: "bottom", position: [0.2, 1] }, { objectId: "below", anchor: "top" });
    expect(drawn([box("wide", 0, 0, 400), box("below", 250, 200)], [pinned]).get("w")).toEqual([{ x: 300, y: 60 }, { x: 300, y: 200 }]);
  });

  it("holds a pin that saves a bend", () => {
    // The centre of the wide side is out of reach of the box above: only the pin gives a straight wire.
    const pinned = wire("w", { objectId: "a", anchor: "bottom" }, { objectId: "b", anchor: "top", position: [0.125, 0] });
    expect(drawn([box("a", 0, 0), box("b", 0, 200, 400)], [pinned]).get("w")).toEqual([{ x: 50, y: 60 }, { x: 50, y: 200 }]);
  });

  describe("arrowheads on one side of one target", () => {
    const sink = box("sink", 400, 200);
    const loose = [sink, box("top", 0, 0), box("bottom", 0, 400)];
    const tips = (
      objects: InteractiveCanvasObject[],
      a: Partial<InteractiveCanvasConnection>,
      b: Partial<InteractiveCanvasConnection>,
      to: [InteractiveCanvasConnection["to"], InteractiveCanvasConnection["to"]] = [{ objectId: "sink", anchor: "left" }, { objectId: "sink", anchor: "left" }],
    ) => {
      const routes = drawn(objects, [
        wire("a", { objectId: "top", anchor: "right" }, to[0], a),
        wire("b", { objectId: "bottom", anchor: "right" }, to[1], b),
      ]);
      return [tip(routes.get("a")!), tip(routes.get("b")!)] as const;
    };

    it("join when the wires share a colour", () => {
      const [a, b] = tips(loose, { color: "red" }, { color: "red", style: "dashed" });
      expect(a).toEqual(b);
    });

    // The three boxes on a page. A section `groupWidth` wide holds the two sources, and past 400 the sink too.
    const onPage = (groupWidth?: number): InteractiveCanvasObject[] => [
      { id: "page", type: "section", text: "page", geometry: { x: -100, y: -100, width: 800, height: 700 } },
      ...(groupWidth ? [{ id: "group", type: "section" as const, text: "group", parentId: "page", geometry: { x: -40, y: -60, width: groupWidth, height: 560 } }] : []),
      ...loose.map((object) => ({ ...object, parentId: groupWidth && object.geometry.x < groupWidth - 40 ? "group" : "page" })),
    ];

    it("join when the sources sit in one section", () => {
      const [a, b] = tips(onPage(200), { color: "red" }, { color: "blue", style: "dashed" });
      expect(a).toEqual(b);
    });

    it("join when that section holds the target too", () => {
      const [a, b] = tips(onPage(600), { color: "red" }, { color: "blue", style: "dashed" });
      expect(a).toEqual(b);
    });

    it("stay apart when the one section they share is the page", () => {
      const [a, b] = tips(onPage(), { color: "red" }, { color: "blue", style: "dashed" });
      expect(Math.abs(a.y - b.y)).toBeCloseTo(16, 5);
    });

    it("join when the author pinned them a few pixels apart", () => {
      const [a, b] = tips(loose, { color: "red" }, { color: "red" }, [
        { objectId: "sink", anchor: "left", position: [0, 0.4] },
        { objectId: "sink", anchor: "left", position: [0, 0.6] },
      ]);
      expect(a).toEqual({ x: 400, y: 230 });
      expect(b).toEqual(a);
    });

    it("join when one wire is gray by default and the other gray by choice", () => {
      const [a, b] = tips(loose, {}, { color: "gray", style: "dashed" });
      expect(a).toEqual(b);
    });

    it("stay apart when the wires share no dash, colour, source or section", () => {
      const [a, b] = tips(loose, { color: "red" }, { color: "blue", style: "dashed" });
      expect(Math.abs(a.y - b.y)).toBeCloseTo(16, 5);
    });
  });

  it("keeps a junction on its own side of a wire that leaves between", () => {
    const objects = [box("pool", 400, 0, 200), box("mid", 450, 300), box("left", 0, 300), box("right", 900, 300)];
    const routes = drawn(objects, [
      wire("out", { objectId: "pool", anchor: "bottom" }, { objectId: "mid", anchor: "top" }),
      wire("l", { objectId: "left", anchor: "top" }, { objectId: "pool", anchor: "bottom" }, { style: "dashed" }),
      wire("r", { objectId: "right", anchor: "top" }, { objectId: "pool", anchor: "bottom" }, { style: "dashed" }),
    ]);
    const [out, l, r] = [routes.get("out")!, routes.get("l")!, routes.get("r")!];
    expect(out).toEqual([{ x: 500, y: 60 }, { x: 500, y: 300 }]);
    expect(tip(l).x).toBeLessThan(500);
    expect(tip(r).x).toBeGreaterThan(500);
    expect(crossings(out, l) + crossings(out, r)).toBe(0);
  });

  it("keeps a junction on its own side of a wire that runs straight in between", () => {
    const objects = [box("t", 400, 200, 200, 100), box("r", 100, 500), box("b", 450, 500), box("o", 800, 500)];
    const to = { objectId: "t", anchor: "bottom" } as const;
    const routes = drawn(objects, [
      wire("r", { objectId: "r" }, to, { color: "red" }),
      wire("b", { objectId: "b" }, to, { color: "blue", style: "dashed" }),
      wire("o", { objectId: "o" }, to, { color: "orange" }),
    ]);
    const [r, b, o] = [routes.get("r")!, routes.get("b")!, routes.get("o")!];
    expect(b).toEqual([{ x: 500, y: 500 }, { x: 500, y: 300 }]);
    expect(tip(r).x).toBeLessThan(500);
    expect(tip(o).x).toBeGreaterThan(500);
    expect(crossings(b, r) + crossings(b, o)).toBe(0);
  });

  it("keeps a wire on its own side of a wire that runs straight in and has joined others", () => {
    // Dashed c and d join straight b from the two sides. Solid f turns in from the left, beyond d.
    const objects = [box("t", 400, 200, 200, 100), box("b", 450, 1500), box("c", 700, 500), box("d", 150, 400), box("f", 0, 1000)];
    const to = { objectId: "t", anchor: "bottom" } as const;
    const dashed = { color: "blue", style: "dashed" } as const;
    const routes = drawn(objects, [
      wire("b", { objectId: "b", anchor: "top" }, to, dashed),
      wire("c", { objectId: "c", anchor: "top" }, to, dashed),
      wire("d", { objectId: "d", anchor: "top" }, to, dashed),
      wire("f", { objectId: "f", anchor: "top" }, to, { color: "red" }),
    ]);
    const [b, c, f] = [routes.get("b")!, routes.get("c")!, routes.get("f")!];
    expect(tip(f).x).toBeLessThan(500);
    expect(crossings(f, b) + crossings(f, c)).toBe(0);
  });

  it("trades the sides two wires enter where that stops them crossing", () => {
    const objects = [box("t", 400, 200, 200, 100), box("p", 0, 400), box("q", 250, 560)];
    const p = wire("p", { objectId: "p" }, { objectId: "t", anchor: "bottom" }, { color: "orange" });
    const q = wire("q", { objectId: "q" }, { objectId: "t", anchor: "left" }, { color: "gray" });
    const free = drawn(objects, [p, q]);
    expect(crossings(free.get("p")!, free.get("q")!)).toBe(0);
    expect(tip(free.get("p")!)).toEqual({ x: 400, y: 250 });
    expect(tip(free.get("q")!)).toEqual({ x: 500, y: 300 });
    // A second orange wire that stays at the bottom does not hold the trade back.
    const below = wire("c", { objectId: "c", anchor: "top" }, { objectId: "t", anchor: "bottom" }, { color: "orange" });
    const third = drawn([...objects, box("c", 450, 700)], [p, q, below]);
    expect(crossings(third.get("p")!, third.get("q")!)).toBe(0);
    // A pinned end is the author's choice of side: it stays, and so does the crossing.
    const held = drawn(objects, [wire("p", { objectId: "p" }, { objectId: "t", anchor: "bottom", position: [0.5, 1] }, { color: "orange" }), q]);
    expect(tip(held.get("p")!)).toEqual({ x: 500, y: 300 });
    expect(crossings(held.get("p")!, held.get("q")!)).toBe(1);
  });

  it("lines up the elbows of wires that travel side by side", () => {
    const from = { objectId: "s", anchor: "right" } as const;
    const pair = (second: InteractiveCanvasObject) => {
      const routes = drawn([box("s", 0, 200), box("t1", 400, 0), second], [
        wire("a", from, { objectId: "t1", anchor: "left" }, { color: "blue" }),
        wire("b", from, { objectId: second.id, anchor: "left" }, { color: "red" }),
      ]);
      return [routes.get("a")![1]!, routes.get("b")![1]!] as const;
    };
    // Two that turn apart turn on one line.
    const [up, down] = pair(box("t2", 500, 400));
    expect(up.x).toBeCloseTo(down.x, 5);
    // Two that turn the same way stay as far apart after the bend as before it.
    const [inner, outer] = pair(box("t2", 500, -150));
    expect(outer.y - inner.y).toBeCloseTo(16, 5);
    expect(outer.x - inner.x).toBeCloseTo(16, 5);
  });

  it("moves a run off a section border", () => {
    const objects: InteractiveCanvasObject[] = [
      { id: "group", type: "section", text: "group", geometry: { x: 0, y: 0, width: 400, height: 300 } },
      { ...box("a", 260, 100), parentId: "group" },
      box("b", 440, 400),
    ];
    const from = { objectId: "a", anchor: "right" } as const;
    const w = wire("w", from, { objectId: "b", anchor: "left" });
    const route = drawn(objects, [w]).get("w")!;
    // Alone the wire turns halfway, on the section's right border at x 400.
    expect(route).toEqual([{ x: 360, y: 130 }, { x: 416, y: 130 }, { x: 416, y: 430 }, { x: 440, y: 430 }]);
    // A trunk of two wires leaves the border as one line.
    const trunk = drawn([...objects, box("c", 440, 500)], [w, wire("v", from, { objectId: "c", anchor: "left" })]);
    expect(trunk.get("w")).toEqual(route);
    expect(trunk.get("v")).toEqual([{ x: 360, y: 130 }, { x: 416, y: 130 }, { x: 416, y: 530 }, { x: 440, y: 530 }]);
  });
});
