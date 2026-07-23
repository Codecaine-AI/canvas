import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as grid } from "../src/rules/grid";
import { box, makeDocument } from "./synthetic";

describe("grid rule", () => {
  test("declares its two faces", () => {
    expect(grid.id).toBe("grid");
    expect(grid.tier).toBe("warning");
    expect(grid.guidance).toContain("16px grid");
    expect(grid.guidance).toContain("not a law");
    expect(grid.quickfix).toBeUndefined();
  });

  test("an off-grid position is flagged with the value and nearest multiple", () => {
    const findings = grid.check(buildBoardModel(makeDocument([
      box("a", 203, 96),
      box("b", 192, 96),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "grid",
      severity: "warning",
      at: ["a"],
      where: { x: 203, y: 96, width: 160, height: 96 },
    });
    expect(findings[0]!.message).toContain("x=203 (nearest 208)");
  });

  test("every off-grid field is reported in one finding per node", () => {
    const findings = grid.check(buildBoardModel(makeDocument([
      box("a", 10, 20, 150, 90),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("x=10 (nearest 16)");
    expect(findings[0]!.message).toContain("y=20 (nearest 16)");
    expect(findings[0]!.message).toContain("w=150 (nearest 144)");
    expect(findings[0]!.message).toContain("h=90 (nearest 96)");
  });

  test("an aligned board is clean", () => {
    const findings = grid.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 224, 0),
      box("sec", 0, 160, 480, 320, "section"),
    ])));
    expect(findings).toHaveLength(0);
  });

  test("sub-pixel noise under 1px is ignored; 1px is not", () => {
    const noisy = grid.check(buildBoardModel(makeDocument([box("a", 192.5, 0)])));
    expect(noisy).toHaveLength(0);

    const off = grid.check(buildBoardModel(makeDocument([box("a", 193, 0)])));
    expect(off).toHaveLength(1);
    expect(off[0]!.message).toContain("x=193 (nearest 192)");
  });

  test("sections are checked; stickies and annotations are exempt", () => {
    const findings = grid.check(buildBoardModel(makeDocument([
      box("sec", 10, 0, 480, 320, "section"),
      box("note", 5, 7, 160, 96, "sticky"),
      box("mark", 3, 3, 32, 32, "annotation-marker"),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.at).toEqual(["sec"]);
  });
});
