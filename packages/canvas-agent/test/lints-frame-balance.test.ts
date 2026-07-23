import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as frameBalance } from "../src/lints/frame-balance";
import { box, makeDocument } from "./synthetic";

function lockedFrame(width = 1600, height = 800) {
  return { ...box("page", 0, 0, width, height, "section"), locked: "background" as const };
}

describe("frame-balance lint", () => {
  test("declares its faces", () => {
    expect(frameBalance.id).toBe("frame-balance");
    expect(frameBalance.tier).toBe("warning");
    expect(frameBalance.guidance).toContain("40%");
    expect(frameBalance.quickfix).toBeUndefined();
  });

  test("content packed on one side of the frame warns once, naming the region", () => {
    // Content bbox x 64..460 in a 1600-wide frame: the right 71% is dead.
    const findings = frameBalance.check(buildBoardModel(makeDocument([
      lockedFrame(),
      box("x1", 64, 64),
      box("x2", 300, 500),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "frame-balance",
      severity: "warning",
      at: ["page"],
    });
    expect(findings[0]!.message).toContain("inhabits only the left of the frame");
    expect(findings[0]!.message).toContain("71% dead on the right");
    expect(findings[0]!.where).toEqual({ x: 460, y: 0, width: 1140, height: 800 });
  });

  test("a diagram spread across the frame is clean", () => {
    const findings = frameBalance.check(buildBoardModel(makeDocument([
      lockedFrame(),
      box("wide", 100, 100, 1400, 600),
    ])));
    expect(findings).toHaveLength(0);
  });

  test("threshold: a 40% dead strip is tolerated, 41% is not", () => {
    const atThreshold = frameBalance.check(buildBoardModel(makeDocument([
      { ...box("page", 0, 0, 1000, 500, "section"), locked: "background" as const },
      box("block", 0, 0, 600, 500),  // right strip 400/1000 = 40%
    ])));
    expect(atThreshold).toHaveLength(0);

    const past = frameBalance.check(buildBoardModel(makeDocument([
      { ...box("page", 0, 0, 1000, 500, "section"), locked: "background" as const },
      box("block", 0, 0, 590, 500),  // right strip 410/1000 = 41%
    ])));
    expect(past).toHaveLength(1);
    expect(past[0]!.message).toContain("41% dead on the right");
  });

  test("stickies and annotation markers cannot rescue a dead half", () => {
    const findings = frameBalance.check(buildBoardModel(makeDocument([
      lockedFrame(),
      box("x1", 64, 64),
      box("x2", 300, 500),
      box("note", 1400, 640, 160, 96, "sticky"),
      box("pin", 1500, 100, 24, 24, "annotation-marker"),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("dead on the right");
  });

  test("one finding max: a corner-packed board reports only the largest strip", () => {
    // Right strip 90% beats bottom strip 88%.
    const findings = frameBalance.check(buildBoardModel(makeDocument([
      lockedFrame(),
      box("only", 0, 0),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("dead on the right");
  });

  test("no locked frame or no content — silent", () => {
    const noFrame = frameBalance.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("wrap", 400, 0, 480, 320, "section"),  // unlocked section is not a frame
    ])));
    expect(noFrame).toHaveLength(0);

    const emptyFrame = frameBalance.check(buildBoardModel(makeDocument([
      lockedFrame(),
      box("note", 700, 300, 160, 96, "sticky"),  // stickies are not content
    ])));
    expect(emptyFrame).toHaveLength(0);
  });
});
