import { describe, expect, test } from "bun:test";

import {
  pathBoxViolationIds,
  routedPolyline,
} from "../../board/lints/geometry";
import { rule as brokenEdges } from "../../board/lints/rules/broken-edges";
import { box, connect, makeDocument } from "./synthetic";
import type { InteractiveCanvasConnection, InteractiveCanvasObject } from "../../state/schema";

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

function icon(id: string, x: number, y: number, text: string, detail: string) {
  return { ...box(id, x, y, 300, 120, "icon"), text, detail };
}

const page = box("page", 0, 0, 2600, 1400, "section");

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

  test("a reply routed apart from its request is two wires, not an anti-parallel pair", () => {
    const findings = brokenEdges.check(makeDocument(
      [box("a", 0, 0, 184, 96), box("b", 600, 0, 184, 96)],
      [
        { id: "request", from: { objectId: "a", anchor: "right" }, to: { objectId: "b", anchor: "left" } },
        {
          id: "reply",
          from: { objectId: "b", anchor: "top" },
          to: { objectId: "a", anchor: "top" },
          waypoints: [[692, -120], [92, -120]],
        },
      ],
    ));
    expect(findings).toEqual([]);
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

  test("crossings are layout numbers, not findings", () => {
    const nine = crossingGrid(3, 3);  // 9 crossing pairs
    expect(brokenEdges.check(makeDocument(nine.objects, nine.connections))).toEqual([]);
  });

  test("two wires sharing a lane are not a finding", () => {
    // e2 is pinned onto a leg 8px from e1's route for 840px.
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
    expect(findings).toEqual([]);
  });

  // --- a wire through its own endpoint's caption ---

  test("a port slid into its own endpoint's caption band is an error naming the port fix", () => {
    const document = makeDocument(
      [page, icon("integrations", 2000, 680, "Action integrations", "stores no credentials"), icon("account", 1520, 1000, "Account system", "subscriptions")],
      [{
        ...connect("subscription", "integrations", "account"),
        from: { objectId: "integrations", anchor: "left", position: [0, 0.85] },
        to: { objectId: "account", anchor: "top" },
      }],
    );
    const findings = brokenEdges.check(document);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["subscription", "integrations"] });
    expect(findings[0]!.message).toBe("connector subscription runs 60px through its endpoint integrations's caption");
    expect(findings[0]!.suggestion).toStartWith("change_connection subscription to meet integrations on the side away from the caption");
  });

  test("a side port reached from below runs through its own caption and is an error", () => {
    const document = makeDocument(
      [
        page,
        icon("pool", 1140, 200, "Bounded worker pool", "capped concurrency"),
        icon("worker", 1620, 200, "Scenario worker", "performs steps in order"),
        { ...box("record", 1140, 420, 280, 100, "process"), text: "Record product failure" },
        { ...box("outcome", 1620, 420, 300, 120, "decision"), text: "Step outcome?" },
      ],
      [{ ...connect("continue", "record", "worker"), from: { objectId: "record", anchor: "top" } }],
    );
    const findings = brokenEdges.check(document).filter((finding) => finding.message.includes("caption"));
    expect(findings.map((finding) => finding.at)).toEqual([["continue", "worker"]]);
    expect(findings[0]!.message).toBe("connector continue runs 48px through its endpoint worker's caption");
  });

  test("a wire into the bottom port, under the caption, is quiet", () => {
    const document = makeDocument(
      [page, icon("worker", 1620, 200, "Scenario worker", "performs steps in order"), { ...box("record", 1630, 600, 280, 100, "process"), text: "Record" }],
      [{ ...connect("up", "record", "worker"), to: { objectId: "worker", anchor: "bottom" } }],
    );
    expect(brokenEdges.check(document)).toEqual([]);
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
