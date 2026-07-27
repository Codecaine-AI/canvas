import { describe, expect, test } from "bun:test";

import { rule as containment } from "../src/board/lints/rules/containment";
import { box, makeDocument } from "./synthetic";

describe("containment lint (moved from rules/ unchanged)", () => {
  test("declares its faces", () => {
    expect(containment.id).toBe("containment");
    expect(containment.tier).toBe("error");
    expect(containment.guidance).toContain("the base section is the page");
  });

  test("a parentId child escaping its section is an error", () => {
    const findings = containment.check(makeDocument([
      box("section", 0, 0, 480, 320, "section"),
      { ...box("child", 400, 96, 184, 96, "process"), parentId: "section" },
    ]));
    // The lone root section is also the board's base section, so the escape
    // is reported against both its parent and the page.
    expect(findings).toHaveLength(2);
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

  test("overflow past the base section beyond 16px is an error; 16px bleed is not", () => {
    const frame = box("page", 0, 0, 640, 480, "section");
    const overflowing = containment.check(makeDocument([
      frame,
      box("card", 600, 96, 184, 96, "process"),
    ]));
    expect(overflowing).toHaveLength(1);
    expect(overflowing[0]).toMatchObject({ severity: "error", at: ["card", "page"] });
    expect(overflowing[0]!.message).toContain("144px past the base section page");

    const bleeding = containment.check(makeDocument([
      frame,
      box("card", 472, 96, 184, 96, "process"),  // right edge 656 = frame + 16
    ]));
    expect(bleeding).toHaveLength(0);
  });

  test("with several root sections there is no unambiguous page, so strays are clean", () => {
    const findings = containment.check(makeDocument([
      box("section", 0, 0, 480, 320, "section"),
      box("other", 640, 0, 480, 320, "section"),
      box("stray", 900, 900, 184, 96, "process"),  // no parentId, no single base section
    ]));
    expect(findings).toHaveLength(0);
  });
});
