import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as density } from "../src/rules/density";
import { box, makeDocument } from "./synthetic";

describe("density rule", () => {
  test("declares its two faces", () => {
    expect(density.id).toBe("density");
    expect(density.tier).toBe("warning");
    expect(density.guidance).toContain("512px");
    expect(density.quickfix).toBeUndefined();
  });

  test("a section mostly empty on one side is flagged with the worst side", () => {
    // Child spans x 16..176 in a 640-wide section: right margin 464 = 73%.
    const findings = density.check(buildBoardModel(makeDocument([
      box("wrap", 0, 0, 640, 480, "section"),
      { ...box("child", 16, 200, 160, 96, "process"), parentId: "wrap" },
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "density",
      severity: "warning",
      at: ["wrap"],
      where: { x: 176, y: 0, width: 464, height: 480 },
    });
    expect(findings[0]!.message).toContain("73% of its width is empty on the right");
  });

  test("empty sections and balanced sections are clean", () => {
    const findings = density.check(buildBoardModel(makeDocument([
      box("empty", 0, 0, 640, 480, "section"),
      box("wrap", 800, 0, 240, 160, "section"),
      { ...box("child", 840, 32, 160, 96, "process"), parentId: "wrap" },
    ])));
    expect(findings).toHaveLength(0);
  });

  test("exactly 45% empty on a side is not a finding (strictly greater fires)", () => {
    // Child from x 450 to 1000 in a 1000-wide section: left margin exactly 45%.
    const atThreshold = density.check(buildBoardModel(makeDocument([
      box("wrap", 0, 0, 1000, 400, "section"),
      { ...box("child", 450, 0, 550, 400, "process"), parentId: "wrap" },
    ])));
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = density.check(buildBoardModel(makeDocument([
      box("wrap", 0, 0, 1000, 400, "section"),
      { ...box("child", 460, 0, 540, 400, "process"), parentId: "wrap" },
    ])));
    expect(pastThreshold).toHaveLength(1);
    expect(pastThreshold[0]!.message).toContain("46% of its width is empty on the left");
  });

  test("a node beyond 512px of every other node is an orphan", () => {
    // a↔b gap 40 (a cluster); c sits 1640px from b's right edge.
    const findings = density.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 200, 0),
      box("c", 2000, 0),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ at: ["c"], severity: "warning" });
    expect(findings[0]!.message).toContain("1640px from its nearest node");
  });

  test("orphan threshold is strict: a 512px gap is fine, 513px is not", () => {
    const atThreshold = density.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 672, 0),  // gap = 672 - 160 = 512
    ])));
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = density.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 673, 0),  // gap 513 — both nodes are each other's only neighbor
    ])));
    expect(pastThreshold).toHaveLength(2);
    expect(pastThreshold.map((finding) => finding.at)).toEqual([["a"], ["b"]]);
  });

  test("a lone node has no neighborhood to be orphaned from", () => {
    const findings = density.check(buildBoardModel(makeDocument([box("solo", 0, 0)])));
    expect(findings).toHaveLength(0);
  });
});
