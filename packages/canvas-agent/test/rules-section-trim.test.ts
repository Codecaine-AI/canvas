import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { rule as sectionTrim } from "../src/rules/section-trim";
import { box, makeDocument } from "./synthetic";

describe("section-trim rule", () => {
  test("declares its two faces", () => {
    expect(sectionTrim.id).toBe("section-trim");
    expect(sectionTrim.tier).toBe("warning");
    expect(sectionTrim.guidance).toContain("64");
    expect(sectionTrim.guidance).toContain("48");
    expect(sectionTrim.guidance).toContain("fitSectionToChildren");
    expect(sectionTrim.quickfix).toBeUndefined();
  });

  test("a thin header band is flagged", () => {
    // Child top inset 32 < 48; sides and bottom all sit at the ideal 48.
    const findings = sectionTrim.check(buildBoardModel(makeDocument([
      box("sec", 0, 0, 256, 176, "section"),
      { ...box("child", 48, 32), parentId: "sec" },
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "section-trim",
      severity: "warning",
      at: ["sec"],
      where: { x: 0, y: 0, width: 256, height: 176 },
    });
    expect(findings[0]!.message).toContain("header band 32px (<48)");
  });

  test("tight side padding is flagged", () => {
    // Left inset 16 < 24; header 64, right 48, bottom 48.
    const findings = sectionTrim.check(buildBoardModel(makeDocument([
      box("sec", 0, 0, 224, 208, "section"),
      { ...box("child", 16, 64), parentId: "sec" },
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("left padding 16px (<24)");
  });

  test("a section not hugging its content is flagged", () => {
    // Right inset 432 > 160 slack.
    const findings = sectionTrim.check(buildBoardModel(makeDocument([
      box("sec", 0, 0, 640, 240, "section"),
      { ...box("child", 48, 64), parentId: "sec" },
    ])));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toContain("right slack 432px (>160 — not hugging)");
  });

  test("ideal trim is clean; exact thresholds carry no finding", () => {
    // Header 64, sides/bottom 48 — the rulebook ideal.
    const ideal = sectionTrim.check(buildBoardModel(makeDocument([
      box("sec", 0, 0, 256, 208, "section"),
      { ...box("child", 48, 64), parentId: "sec" },
    ])));
    expect(ideal).toHaveLength(0);

    // Header exactly 48, left exactly 24 is not "under"; right slack exactly 160 is not "over".
    const edges = sectionTrim.check(buildBoardModel(makeDocument([
      box("sec", 0, 0, 344, 192, "section"),
      { ...box("child", 24, 48), parentId: "sec" },  // right inset 160, bottom 48
    ])));
    expect(edges).toHaveLength(0);
  });

  test("escaped children, empty sections, the page frame, and stickies are out of scope", () => {
    const findings = sectionTrim.check(buildBoardModel(makeDocument([
      // Child sticking out the left: containment's error, not a trim warning.
      box("sec", 0, 0, 256, 208, "section"),
      { ...box("child", -16, 64), parentId: "sec" },  // right inset 112, bottom 48
      // Empty section: nothing to trim against.
      box("empty", 400, 0, 480, 320, "section"),
      // Locked page frame: the page is not a trimmed section.
      { ...box("page", 0, 400, 2000, 1000, "section"), locked: "background" as const },
      // A section whose only child is a sticky: commentary, not content.
      box("notes", 1000, 0, 480, 320, "section"),
      { ...box("note", 1016, 16, 160, 96, "sticky"), parentId: "notes" },
    ])));
    expect(findings).toHaveLength(0);
  });
});
