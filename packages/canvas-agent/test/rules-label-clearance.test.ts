import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as labelClearance } from "../src/rules/label-clearance";
import { box, connect, makeDocument } from "./synthetic";

describe("label-clearance rule", () => {
  test("declares its two faces", () => {
    expect(labelClearance.id).toBe("label-clearance");
    expect(labelClearance.tier).toBe("error");
    expect(labelClearance.guidance).toContain("96");
    expect(labelClearance.quickfix).toBeUndefined();
  });

  test("a label chip landing on a third box is an error", () => {
    // Waypoints pin the route straight across "mid": polyline (80,48)→(480,48)
    // →(880,48), arc midpoint (480,48); label "X" chip is 32×28 at x 464..496
    // — inside "mid" (400..560 × 0..96). (Un-waypointed edges route around
    // obstacles, so a genuine chip-over-box needs a pinned route.)
    const findings = labelClearance.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("mid", 400, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[480, 48]] }],
    )));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "label-clearance",
      severity: "error",
      at: ["e", "mid"],
      where: { x: 464, y: 34, width: 32, height: 28 },
    });
    expect(findings[0]!.message).toContain('label "X" chip on e covers mid');
  });

  test("two chips over each other are an error", () => {
    // Both edges are horizontal runs whose chips center near (480, ~48/68).
    const findings = labelClearance.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 800, 0), box("c", 0, 20), box("d", 800, 20)],
      [
        { ...connect("e1", "a", "b"), label: "X" },
        { ...connect("e2", "c", "d"), label: "Y" },
      ],
    )));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["e1", "e2"], severity: "error" });
    expect(findings[0]!.message).toContain("overlaps label");
  });

  test("chips ignore their own endpoints; unlabeled edges carry no chip", () => {
    const findings = labelClearance.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 224, 0), box("far", 1200, 600)],
      [
        { ...connect("labeled", "a", "b"), label: "connect()" },  // chip pokes into a and b only
        connect("bare", "a", "far"),
      ],
    )));
    expect(findings).toHaveLength(0);
  });

  test("waypointed edges hang the chip at the routed path's arc midpoint", () => {
    // Polyline (80,48)→(80,300)→(880,48): total ≈1090.8px, so the arc
    // midpoint sits on the second segment near (360,212) — over "w";
    // the straight a→b midpoint (480,48) would not be.
    const findings = labelClearance.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("w", 320, 180), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X", waypoints: [[80, 300]] }],
    )));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["e", "w"] });
  });

  test("a chip exactly touching a box edge is clean; one px inside is not", () => {
    // Chip "X" spans x 464..496; a box starting at 496 only touches it.
    const touching = labelClearance.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("t", 496, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(touching).toHaveLength(0);

    const overlapping = labelClearance.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("t", 495, 0), box("b", 800, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(overlapping).toHaveLength(1);
  });
});
