import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as edgeClarity } from "../src/rules/edge-clarity";
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

describe("edge-clarity rule", () => {
  test("declares its two faces", () => {
    expect(edgeClarity.id).toBe("edge-clarity");
    expect(edgeClarity.tier).toBe("error");
    expect(edgeClarity.guidance).toContain("blocks commit");
    expect(edgeClarity.quickfix).toBeUndefined();
  });

  test("a connector forced through boxes is an error", () => {
    // Ported from lint.test.ts: a closed ring of walls around the source —
    // every elbow to the outside target must pass through a wall.
    const findings = edgeClarity.check(buildBoardModel(makeDocument(
      [
        box("target", 300, 300, 100, 100),
        box("wall-n", 0, 0, 700, 80),
        box("wall-s", 0, 620, 700, 80),
        box("wall-w", 0, 0, 80, 700),
        box("wall-e", 620, 0, 80, 700),
        box("outside", 900, 300, 100, 100),
      ],
      [connect("connection-1", "target", "outside")],
    )));
    const errors = findings.filter((finding) => finding.severity === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      rule: "edge-clarity",
      at: ["connection-1", "target", "outside"],
    });
    expect(errors[0]!.message).toContain("passes through a box");
  });

  test("an anti-parallel pair sharing both endpoints is a warning", () => {
    const findings = edgeClarity.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [connect("go", "a", "b"), connect("back", "b", "a")],
    )));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "warning",
      at: ["go", "back", "a", "b"],
    });
    expect(findings[0]!.message).toContain("anti-parallel");
  });

  test("degenerate edges warn: self-loop, dangling endpoint, zero-length route", () => {
    const findings = edgeClarity.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 0, 0), box("c", 400, 0)],
      [
        connect("self", "a", "a"),
        connect("dangling", "c", "ghost"),
        connect("flat", "a", "b"),  // identical rects → coincident centers
      ],
    )));
    expect(findings.map((finding) => finding.severity)).toEqual(["warning", "warning", "warning"]);
    expect(findings[0]!.message).toContain("connects a to itself");
    expect(findings[1]!.message).toContain("dangles");
    expect(findings[1]).toMatchObject({ at: ["dangling", "ghost"] });
    expect(findings[2]!.message).toContain("zero-length");
  });

  test("a clean two-node flow carries no finding", () => {
    const findings = edgeClarity.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],
      [connect("e", "a", "b")],
    )));
    expect(findings).toHaveLength(0);
  });

  test("crossing tangle fires past 6 crossings with the count in the message", () => {
    const six = crossingGrid(3, 2);  // 6 crossing pairs — at the threshold
    expect(edgeClarity.check(buildBoardModel(makeDocument(six.objects, six.connections))))
      .toHaveLength(0);

    const nine = crossingGrid(3, 3);  // 9 crossing pairs — past it
    const findings = edgeClarity.check(buildBoardModel(makeDocument(nine.objects, nine.connections)));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe("warning");
    expect(findings[0]!.message).toContain("9 connector crossings");
    expect(findings[0]!.at).toEqual(["v-0", "h-0", "h-1", "h-2", "v-1", "v-2"]);
  });
});
