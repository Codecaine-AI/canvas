import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as overlap } from "../src/rules/overlap";
import { box, makeDocument } from "./synthetic";

describe("overlap rule", () => {
  test("declares its two faces", () => {
    expect(overlap.id).toBe("overlap");
    expect(overlap.tier).toBe("error");
    expect(overlap.guidance).toContain("exempt");
    expect(overlap.quickfix).toBeUndefined();
  });

  test("an overlap past 25% of the smaller box is an error", () => {
    // Same-size boxes offset 80px: intersection 80×96 = 50% of either.
    const findings = overlap.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 80, 0),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "overlap",
      severity: "error",
      at: ["a", "b"],
      where: { x: 80, y: 0, width: 80, height: 96 },
    });
    expect(findings[0]!.message).toContain("50%");
  });

  test("a small overlap that covers a box's text center is still an error", () => {
    // Thin 900×20 bar across a's middle: 12% of a, but over its text center.
    const findings = overlap.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("bar", 70, 38, 900, 20),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("covers the text center of a");
  });

  test("clean boards, exempt kinds, and cross-parent pairs carry no finding", () => {
    const findings = overlap.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 224, 0),                              // apart
      box("wrap", 0, 0, 480, 320, "section"),        // sections exempt
      box("note", 40, 40, 160, 96, "sticky"),        // stickies exempt
      box("pin", 60, 60, 24, 24, "annotation-marker"),
      { ...box("other", 8, 8), parentId: "wrap" },   // overlaps a, different parent
    ])));
    expect(findings).toHaveLength(0);
  });

  test("exactly 25% with the text center on the seam is clean; a hair more is not", () => {
    // b offset by half in both axes: intersection is exactly 25% of either
    // box and a's center sits on the intersection boundary, not inside it.
    const atThreshold = overlap.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 80, 48),
    ])));
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = overlap.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 79, 48),  // intersection 81×48 = 25.3% of the smaller
    ])));
    expect(pastThreshold).toHaveLength(1);
    expect(pastThreshold[0]!.message).toContain("25%");
  });
});
