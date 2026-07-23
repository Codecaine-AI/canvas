import { describe, expect, test } from "bun:test";

import { rule as containment } from "../src/board/lints/rules/containment";
import { box, makeDocument } from "./synthetic";

describe("containment lint (moved from rules/ unchanged)", () => {
  test("declares its faces", () => {
    expect(containment.id).toBe("containment");
    expect(containment.tier).toBe("error");
    expect(containment.guidance).toContain("locked page frame");
    expect(containment.quickfix).toBeUndefined();
  });

  test("a parentId child escaping its section is an error", () => {
    const findings = containment.check(makeDocument([
      box("section", 0, 0, 480, 320, "section"),
      { ...box("child", 400, 96, 184, 96, "process"), parentId: "section" },
    ]));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "containment",
      severity: "error",
      at: ["child", "section"],
      where: { x: 400, y: 96, width: 184, height: 96 },
    });
    expect(findings[0]!.message).toContain("104px outside its section");
  });

  test("a contained child (edges touching) is clean", () => {
    const findings = containment.check(makeDocument([
      box("section", 0, 0, 480, 320, "section"),
      { ...box("child", 0, 0, 480, 320, "process"), parentId: "section" },
    ]));
    expect(findings).toHaveLength(0);
  });

  test("overflow past the locked frame beyond 16px is an error; 16px bleed is not", () => {
    const frame = { ...box("page", 0, 0, 640, 480, "section"), locked: "background" as const };
    const overflowing = containment.check(makeDocument([
      frame,
      box("card", 600, 96, 184, 96, "process"),
    ]));
    expect(overflowing).toHaveLength(1);
    expect(overflowing[0]).toMatchObject({ severity: "error", at: ["card", "page"] });
    expect(overflowing[0]!.message).toContain("144px past the locked frame page");

    const bleeding = containment.check(makeDocument([
      frame,
      box("card", 472, 96, 184, 96, "process"),  // right edge 656 = frame + 16
    ]));
    expect(bleeding).toHaveLength(0);
  });

  test("an unlocked section is not a frame; strays outside it carry no finding", () => {
    const findings = containment.check(makeDocument([
      box("section", 0, 0, 480, 320, "section"),
      box("stray", 900, 900, 184, 96, "process"),  // no parentId, no locked frame
    ]));
    expect(findings).toHaveLength(0);
  });
});
