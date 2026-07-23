import { describe, expect, test } from "bun:test";

import {
  pathBoxViolationIds,
  routedPolyline,
} from "../src/board/lints/geometry";
import { rule as brokenEdges } from "../src/board/lints/rules/broken-edges";
import { box, connect, makeDocument } from "./synthetic";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

/**
 * A grid of straight runs that cross in empty space: `verticals` columns
 * (top_i→bottom_i) crossed by `horizontals` rows (left_j→right_j), sharing
 * no endpoints and passing through no boxes → verticals×horizontals
 * crossing pairs.
 */
function crossingGrid(verticals: number, horizontals: number): {
  objects: InteractiveCanvasObject[];
  connections: InteractiveCanvasConnection[];
} {
  const objects: InteractiveCanvasObject[] = [];
  const connections: InteractiveCanvasConnection[] = [];
  for (let i = 0; i < verticals; i += 1) {
    objects.push(box(`top-${i}`, i * 300, 0), box(`bottom-${i}`, i * 300, 600));
    connections.push(connect(`v-${i}`, `top-${i}`, `bottom-${i}`));
  }
  for (let j = 0; j < horizontals; j += 1) {
    objects.push(box(`left-${j}`, -400, 150 + j * 120), box(`right-${j}`, 1400, 150 + j * 120));
    connections.push(connect(`h-${j}`, `left-${j}`, `right-${j}`));
  }
  return { objects, connections };
}

describe("production routed-path primitives", () => {
  test("routes around a non-endpoint box with orthogonal segments", () => {
    const objects = [
      box("source", 0, 0, 100, 100),
      box("blocker", 200, 0, 100, 100),
      box("target", 400, 0, 100, 100),
    ];
    const edge = connect("edge", "source", "target");
    const points = routedPolyline(edge, makeDocument(objects, [edge]));

    expect(pathBoxViolationIds(points, "source", "target", objects)).toEqual([]);
    expect(points.length).toBeGreaterThan(2);
    for (let index = 1; index < points.length; index += 1) {
      const previous = points[index - 1]!;
      const current = points[index]!;
      expect(current.x === previous.x || current.y === previous.y).toBe(true);
    }
  });

  test("names a non-endpoint box crossed by a path once", () => {
    const objects = [
      box("source", 0, 0, 100, 100),
      box("blocker", 200, 0, 100, 100),
      box("target", 400, 0, 100, 100),
    ];
    const throughBlocker = [{ x: 100, y: 50 }, { x: 400, y: 50 }];

    expect(pathBoxViolationIds(throughBlocker, "source", "target", objects))
      .toEqual(["blocker"]);
  });

  test("handles self-loops and dangling endpoints without degenerate paths", () => {
    const objects = [box("source", 0, 0, 100, 100)];
    const loop = connect("loop", "source", "source");
    const dangling = connect("dangling", "source", "missing");
    const document = makeDocument(objects, [loop, dangling]);
    const loopPoints = routedPolyline(loop, document);

    expect(loopPoints.length).toBeGreaterThanOrEqual(2);
    expect(pathBoxViolationIds(loopPoints, "source", "source", objects)).toEqual([]);
    expect(routedPolyline(dangling, document)).toEqual([]);
  });

  test("sections and boxes overlapping an endpoint are not routing violations", () => {
    const objects = [
      box("source", 0, 0, 100, 100),
      box("stacked", 25, 25, 100, 100),
      box("section", 100, -100, 300, 300, "section"),
      box("target", 500, 0, 100, 100),
    ];
    const straight = [{ x: 100, y: 50 }, { x: 500, y: 50 }];

    expect(pathBoxViolationIds(straight, "source", "target", objects)).toEqual([]);
  });
});

describe("broken-edges lint", () => {
  test("declares its faces", () => {
    expect(brokenEdges.id).toBe("broken-edges");
    expect(brokenEdges.tier).toBe("error");
    expect(brokenEdges.guidance).toContain("blocks commit");
    expect(brokenEdges.quickfix).toBeUndefined();
  });

  // --- ported from rules-edge-clarity ---

  test("a connector forced through boxes is an error", () => {
    // A closed ring of walls around the source — every elbow to the outside
    // target must pass through a wall.
    const findings = brokenEdges.check(makeDocument(
      [
        box("target", 300, 300, 100, 100),
        box("wall-n", 0, 0, 700, 80),
        box("wall-s", 0, 620, 700, 80),
        box("wall-w", 0, 0, 80, 700),
        box("wall-e", 620, 0, 80, 700),
        box("outside", 900, 300, 100, 100),
      ],
      [connect("connection-1", "target", "outside")],
    ));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      rule: "broken-edges",
      at: ["connection-1", "target", "outside"],
    });
    expect(errors[0]!.message).toContain("passes through a box");
  });

  test("an anti-parallel pair sharing both endpoints is a warning", () => {
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [connect("go", "a", "b"), connect("back", "b", "a")],
    ));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "warning",
      at: ["go", "back", "a", "b"],
    });
    expect(findings[0]!.message).toContain("anti-parallel");
  });

  test("degenerate edges are errors: self-loop, dangling, zero-length", () => {
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 0, 0), box("c", 400, 0)],
      [
        connect("self", "a", "a"),
        connect("dangling", "c", "ghost"),
        connect("flat", "a", "b"),  // identical rects → coincident centers
      ],
    ));
    expect(findings.map((finding) => finding.severity)).toEqual(["error", "error", "error"]);
    expect(findings[0]!.message).toContain("connects a to itself");
    expect(findings[1]!.message).toContain("dangles");
    expect(findings[1]).toMatchObject({ at: ["dangling", "ghost"] });
    expect(findings[2]!.message).toContain("zero-length");
  });

  test("a clean two-node flow carries no finding", () => {
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [connect("e", "a", "b")],
    ));
    expect(findings).toHaveLength(0);
  });

  test("crossing tangle fires past 6 crossings with the count in the message", () => {
    const six = crossingGrid(3, 2);  // 6 crossing pairs — at the threshold
    expect(brokenEdges.check(makeDocument(six.objects, six.connections)))
      .toHaveLength(0);

    const nine = crossingGrid(3, 3);  // 9 crossing pairs — past it
    const findings = brokenEdges.check(makeDocument(nine.objects, nine.connections));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain("9 connector crossings");
    expect(findings[0]!.at).toEqual(["v-0", "h-0", "h-1", "h-2", "v-1", "v-2"]);
  });

  // --- co-linear shared runs (NEW — swimlane R1 routing debt) ---

  test("two edges sharing a ≤8px-separated run for ≥100px warn", () => {
    // e1 routes border-to-border at y=48 (x 160..1000). e2 is waypoint-pinned
    // with a valid orthogonal route onto a parallel leg at y=56 spanning the
    // same corridor: separation 8, shared run 840px.
    const findings = brokenEdges.check(makeDocument(
      [box("a1", 0, 0), box("b1", 1000, 0), box("c", 110, -300, 100, 100), box("d", 950, -300, 100, 100)],
      [
        connect("e1", "a1", "b1"),
        {
          ...connect("e2", "c", "d"),
          from: { objectId: "c", anchor: "bottom" },
          to: { objectId: "d", anchor: "bottom" },
          waypoints: [[160, 56], [1000, 56]],
        },
      ],
    ));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", at: ["e1", "e2"] });
    expect(findings[0]!.message).toContain("run co-linear for 840px (8px apart)");
  });

  test("co-linear thresholds: 9px separation or a 99px run stay clean", () => {
    const separated = brokenEdges.check(makeDocument(
      [box("a1", 0, 0), box("b1", 1000, 0), box("c", 110, -300, 100, 100), box("d", 950, -300, 100, 100)],
      [
        connect("e1", "a1", "b1"),
        {
          ...connect("e2", "c", "d"),
          from: { objectId: "c", anchor: "bottom" },
          to: { objectId: "d", anchor: "bottom" },
          waypoints: [[160, 57], [1000, 57]],
        },
      ],
    ));
    expect(separated).toHaveLength(0);

    const shortRun = brokenEdges.check(makeDocument(
      [box("a1", 0, 0), box("b1", 1000, 0), box("c", 110, -300, 100, 100), box("d", 950, -300, 100, 100)],
      [
        connect("e1", "a1", "b1"),
        {
          ...connect("e2", "c", "d"),
          from: { objectId: "c", anchor: "bottom" },
          to: { objectId: "d", anchor: "bottom" },
          waypoints: [[160, -100], [200, -100], [200, 56], [299, 56], [299, -100], [1000, -100]],
        },
      ],
    ));
    expect(shortRun).toHaveLength(0);

    const exactRun = brokenEdges.check(makeDocument(
      [box("a1", 0, 0), box("b1", 1000, 0), box("c", 110, -300, 100, 100), box("d", 950, -300, 100, 100)],
      [
        connect("e1", "a1", "b1"),
        {
          ...connect("e2", "c", "d"),
          from: { objectId: "c", anchor: "bottom" },
          to: { objectId: "d", anchor: "bottom" },
          waypoints: [[160, -100], [200, -100], [200, 56], [300, 56], [300, -100], [1000, -100]],
        },
      ],
    ));
    expect(exactRun).toHaveLength(1);
    expect(exactRun[0]!.message).toContain("100px");
  });

  test("fan edges sharing their trunk out of a common node are exempt", () => {
    // Both true routes leave a through the same pinned trunk leg
    // (y=48, x 160..300): a 140px sep-0 co-run, but they share endpoint a.
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 600, -300), box("c", 600, 300)],
      [
        { ...connect("e1", "a", "b"), waypoints: [[300, 48], [300, -252]] },
        { ...connect("e2", "a", "c"), waypoints: [[300, 48], [300, 348]] },
      ],
    ));
    expect(findings.filter((finding) => finding.message.includes("co-linear"))).toHaveLength(0);
  });

  // --- border-hugging (NEW — swimlane R1 routing debt) ---

  test("an edge tracking a section border within 12px for ≥200px warns", () => {
    // Route runs straight at y=8, 8px above lane's top border (y=0),
    // overlapping its full 800px span.
    const findings = brokenEdges.check(makeDocument(
      [
        box("lane", 0, 0, 800, 400, "section"),
        box("m", -360, -40), box("n", 1000, -40),
      ],
      [{ ...connect("status", "m", "n"), waypoints: [[-200, 8], [1000, 8]] }],
    ));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "warning", at: ["status", "lane"] });
    expect(findings[0]!.message).toContain("hugs the top border of lane for 800px");
  });

  test("border-hugging thresholds: 13px away or a 199px overlap stay clean", () => {
    const farEnough = brokenEdges.check(makeDocument(
      [
        box("lane", 0, 0, 800, 400, "section"),
        box("m", -360, -61), box("n", 1000, -61),  // centers y=-13
      ],
      [{ ...connect("status", "m", "n"), waypoints: [[-200, -13], [1000, -13]] }],
    ));
    expect(farEnough).toHaveLength(0);

    const atDistance = brokenEdges.check(makeDocument(
      [
        box("lane", 0, 0, 800, 400, "section"),
        box("m", -360, -60), box("n", 1000, -60),  // centers y=-12 — at the line
      ],
      [{ ...connect("status", "m", "n"), waypoints: [[-200, -12], [1000, -12]] }],
    ));
    expect(atDistance).toHaveLength(1);

    const shortLane = brokenEdges.check(makeDocument(
      [
        box("lane", 0, 0, 199, 400, "section"),
        box("m", -360, -40), box("n", 1000, -40),
      ],
      [{ ...connect("status", "m", "n"), waypoints: [[-200, 8], [1000, 8]] }],
    ));
    expect(shortLane).toHaveLength(0);

    const exactLane = brokenEdges.check(makeDocument(
      [
        box("lane", 0, 0, 200, 400, "section"),
        box("m", -360, -40), box("n", 1000, -40),
      ],
      [{ ...connect("status", "m", "n"), waypoints: [[-200, 8], [1000, 8]] }],
    ));
    expect(exactLane).toHaveLength(1);
    expect(exactLane[0]!.message).toContain("200px");
  });

  // --- stranded chips (NEW — swimlane R1 margin-stranded labels) ---

  test("a rejected diagonal waypoint does not invent a stranded-chip warning", () => {
    // The renderer rejects this non-orthogonal waypoint and uses its actual
    // orthogonal fallback. The chip is judged on that true path.
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 336)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[880, 384]] }],
    ));
    expect(findings).toHaveLength(0);
  });

  test("stranded checks use the routed path, not diagonal stored-waypoint approximations", () => {
    const atThreshold = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 320)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[880, 368]] }],
    ));
    expect(atThreshold).toHaveLength(0);

    const past = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 322)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[880, 370]] }],
    ));
    expect(past).toHaveLength(0);
  });

  test("an elbow-routed labeled edge is on-wire by construction — no finding", () => {
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0), box("b", 800, 400)],
      [{ ...connect("e", "a", "b"), label: "long enough label" }],
    ));
    expect(findings.filter((finding) => finding.message.includes("wire"))).toHaveLength(0);
  });
});
