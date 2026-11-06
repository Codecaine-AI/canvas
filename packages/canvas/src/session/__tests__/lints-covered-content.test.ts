import { describe, expect, test } from "bun:test";

import { rule as coveredContent } from "../../board/lints/rules/covered-content";
import { box, connect, makeDocument } from "./synthetic";
import { FIGJAM_CONTEXT } from "./helpers";

describe("covered-content lint", () => {
  test("declares its faces", () => {
    expect(coveredContent.id).toBe("covered-content");
    expect(coveredContent.tier).toBe("error");
    expect(coveredContent.guidance).toContain("exempt");
  });

  // --- box-on-box (ported from rules-overlap) ---

  test("an overlap past 25% of the smaller box is an error", () => {
    // Same-size boxes offset 80px: intersection 80×96 = 50% of either.
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 80, 0),
    ]), FIGJAM_CONTEXT);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "covered-content",
      severity: "error",
      at: ["a", "b"],
      where: { x: 80, y: 0, width: 80, height: 96 },
    });
    expect(findings[0]!.message).toContain("50%");
  });

  test("a small overlap that covers a box's text center is still an error", () => {
    // Thin 900×20 bar across a's middle: 12% of a, but over its text center.
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("bar", 70, 38, 900, 20),
    ]), FIGJAM_CONTEXT);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("covers the text center of a");
  });

  test("clean boards and exempt kinds carry no finding; a box is never on the section that holds it", () => {
    const findings = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 224, 0),                              // apart
      box("wrap", 0, 0, 480, 320, "section"),        // sections exempt
      box("note", 40, 40, 160, 96, "sticky"),        // stickies exempt
      { ...box("inside", 240, 160), parentId: "wrap" }, // inside its own section
    ]), FIGJAM_CONTEXT);
    expect(findings).toHaveLength(0);
  });

  test("boxes with different parents that overlap are an error, like siblings", () => {
    // Two sections pushed into each other: their children paint on one another.
    const findings = coveredContent.check(makeDocument([
      box("left", 0, 0, 480, 320, "section"),
      box("right", 400, 0, 480, 320, "section"),
      { ...box("a", 300, 100), parentId: "left" },
      { ...box("b", 380, 100), parentId: "right" },
      box("loose", 300, 200),                        // a top-level box on a's section child
      { ...box("c", 320, 180), parentId: "left" },
    ]), FIGJAM_CONTEXT);
    const pairs = findings.map((finding) => [...finding.at].sort().join("+")).sort();
    expect(pairs).toEqual(["a+b", "c+loose", "left+right"]); // the frames themselves: section-on-section
    expect(findings.every((finding) => finding.severity === "error")).toBe(true);
  });

  test("exactly 25% with the text center on the seam is clean; a hair more is not", () => {
    const atThreshold = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 80, 48),
    ]), FIGJAM_CONTEXT);
    expect(atThreshold).toHaveLength(0);

    const pastThreshold = coveredContent.check(makeDocument([
      box("a", 0, 0),
      box("b", 79, 48),  // intersection 81×48 = 25.3% of the smaller
    ]), FIGJAM_CONTEXT);
    expect(pastThreshold).toHaveLength(1);
    expect(pastThreshold[0]!.message).toContain("25%");
  });

  test("icon boxes are judged by what they paint: apart tiles and captions are clean, touching tiles are not", () => {
    // Default (tile) style: a 300x120 icon paints a centered tile and its
    // caption (56px tile at x 122 and 272 here), not the empty sides of its box.
    const icon = (id: string, x: number) => ({ ...box(id, x, 0, 300, 120, "icon"), text: id, icon: "database" });
    expect(coveredContent.check(makeDocument([icon("db", 0), icon("api", 150)]))).toEqual([]);

    const findings = coveredContent.check(makeDocument([icon("db", 0), icon("api", 20)]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ severity: "error", at: ["db", "api"] });
  });

  // --- label chips: placed by the renderer, never judged ---

  test("a label chip on a box is not a finding: placement owns chips", () => {
    // A 64px gap cannot hold the chip clear of a and b, yet only boxes are judged.
    const findings = coveredContent.check(makeDocument(
      [box("a", 0, 0), box("b", 224, 0)],
      [{ ...connect("e", "a", "b"), label: "connect()" }],
    ), FIGJAM_CONTEXT);
    expect(findings).toEqual([]);
  });
});

describe("covered-content: section-on-section", () => {
  const frame = (id: string, x: number, y: number, width: number, height: number, parentId: string | null = null) =>
    ({ ...box(id, x, y, width, height, "section"), parentId });

  test("two sections whose frames overlap, neither holding the other, is an error naming both", () => {
    const findings = coveredContent.check(makeDocument([
      frame("page", 0, 0, 1200, 800),
      frame("left", 40, 40, 520, 400, "page"),
      frame("right", 540, 40, 400, 400, "page"),
    ]), FIGJAM_CONTEXT).filter((finding) => finding.message.startsWith("sections "));

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      severity: "error",
      at: ["left", "right"],
      where: { x: 540, y: 40, width: 20, height: 400 },
    });
    expect(findings[0]!.message).toBe("sections left and right overlap by 20×400px");
  });

  test("nesting at any depth and frames that only touch carry no finding", () => {
    const findings = coveredContent.check(makeDocument([
      frame("page", 0, 0, 1200, 800),
      frame("outer", 40, 40, 600, 600, "page"),
      frame("inner", 80, 80, 400, 400, "outer"),
      frame("beside", 640, 40, 400, 400, "page"),
    ]), FIGJAM_CONTEXT).filter((finding) => finding.message.startsWith("sections "));

    expect(findings).toHaveLength(0);
  });
});
