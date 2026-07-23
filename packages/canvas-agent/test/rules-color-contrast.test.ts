import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as colorContrast } from "../src/rules/color-contrast";
import { box, makeDocument } from "./synthetic";
import type { InteractiveCanvasObject } from "@codecaine-ai/canvas/schema";

function tinted(object: InteractiveCanvasObject, color: string): InteractiveCanvasObject {
  return { ...object, color } as InteractiveCanvasObject;
}

describe("color-contrast rule", () => {
  test("declares its two faces", () => {
    expect(colorContrast.id).toBe("color-contrast");
    expect(colorContrast.tier).toBe("warning");
    expect(colorContrast.guidance).toContain("green on green");
    expect(colorContrast.guidance).toContain("red for failure");
    expect(colorContrast.quickfix).toBeUndefined();
  });

  test("sibling sections wearing the same tint are flagged once, as a group", () => {
    const findings = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s1", 0, 0, 480, 320, "section"), "blue"),
      tinted(box("s2", 600, 0, 480, 320, "section"), "blue"),
      tinted(box("s3", 1200, 0, 480, 320, "section"), "blue"),
      tinted(box("s4", 1800, 0, 480, 320, "section"), "green"),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "color-contrast",
      severity: "warning",
      at: ["s1", "s2", "s3"],
    });
    expect(findings[0]!.message).toContain("all wear blue");
  });

  test("uncolored sibling sections both default to gray and are flagged", () => {
    const findings = colorContrast.check(buildBoardModel(makeDocument([
      box("s1", 0, 0, 480, 320, "section"),
      box("s2", 600, 0, 480, 320, "section"),
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("all wear gray");
  });

  test("a node matching its parent section's tint is green on green", () => {
    const findings = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s", 0, 0, 480, 320, "section"), "green"),
      { ...tinted(box("same", 32, 64), "green"), parentId: "s" },
      { ...tinted(box("other", 32, 200), "blue"), parentId: "s" },
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      at: ["same", "s"],
      where: { x: 32, y: 64, width: 160, height: 96 },
    });
    expect(findings[0]!.message).toContain("green on the green section s");
  });

  test("a hue dominating a 4+ node section is monotone; 3 nodes are too few", () => {
    const monotone = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s", 0, 0, 900, 320, "section"), "yellow"),
      { ...tinted(box("n1", 32, 64), "blue"), parentId: "s" },
      { ...tinted(box("n2", 224, 64), "blue"), parentId: "s" },
      { ...tinted(box("n3", 416, 64), "blue"), parentId: "s" },
      { ...tinted(box("n4", 608, 64), "red"), parentId: "s" },
    ])));
    expect(monotone).toHaveLength(1);
    expect(monotone[0]).toMatchObject({ at: ["s", "n1", "n2", "n3"] });
    expect(monotone[0]!.message).toContain("3 of 4 nodes in s are blue");

    const tooFew = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s", 0, 0, 900, 320, "section"), "yellow"),
      { ...tinted(box("n1", 32, 64), "blue"), parentId: "s" },
      { ...tinted(box("n2", 224, 64), "blue"), parentId: "s" },
      { ...tinted(box("n3", 416, 64), "blue"), parentId: "s" },
    ])));
    expect(tooFew).toHaveLength(0);
  });

  test("exactly 70% of one hue is not monotone (strictly greater fires)", () => {
    const nodes = (colors: string[]): InteractiveCanvasObject[] => colors.map((color, index) => ({
      ...tinted(box(`n${index}`, 32 + index * 192, 64), color),
      parentId: "s",
    }));
    const seven = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s", 0, 0, 2400, 320, "section"), "yellow"),
      ...nodes(["blue", "blue", "blue", "blue", "blue", "blue", "blue", "red", "green", "teal"]),
    ])));
    expect(seven).toHaveLength(0);

    const eight = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s", 0, 0, 2400, 320, "section"), "yellow"),
      ...nodes(["blue", "blue", "blue", "blue", "blue", "blue", "blue", "blue", "red", "teal"]),
    ])));
    expect(eight).toHaveLength(1);
    expect(eight[0]!.message).toContain("8 of 10 nodes in s are blue");
  });

  test("distinctly tinted siblings and contrasting children are clean", () => {
    const findings = colorContrast.check(buildBoardModel(makeDocument([
      tinted(box("s1", 0, 0, 480, 320, "section"), "blue"),
      tinted(box("s2", 600, 0, 480, 320, "section"), "teal"),
      { ...tinted(box("n1", 32, 64), "green"), parentId: "s1" },
      { ...tinted(box("n2", 632, 64), "orange"), parentId: "s2" },
    ])));
    expect(findings).toHaveLength(0);
  });

  test("the locked background frame is the page, not a tint — exempt throughout", () => {
    const frame = { ...box("page", 0, 0, 1600, 900, "section"), locked: "background" as const };
    const findings = colorContrast.check(buildBoardModel(makeDocument([
      frame,                                            // effective gray, top-level like s
      box("s", 100, 100, 480, 320, "section"),          // effective gray too — but frame is exempt
      { ...box("card", 700, 100), parentId: "page" },   // gray node whose parent is the frame
    ])));
    expect(findings).toHaveLength(0);
  });
});
