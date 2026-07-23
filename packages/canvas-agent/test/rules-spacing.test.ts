import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { runDiagnostics } from "../src/diagnostics/run";
import { rule as spacing } from "../src/rules/spacing";
import { box, makeDocument } from "./synthetic";

describe("spacing rule", () => {
  test("declares its two faces", () => {
    expect(spacing.id).toBe("spacing");
    expect(spacing.tier).toBe("warning");
    expect(spacing.guidance).toContain("default, not a law");
    expect(typeof spacing.quickfix).toBe("function");
  });

  test("an off-ladder sibling gap is flagged with the nearest rungs", () => {
    // Ported from lint.test.ts: gap 32 sits on the ladder, gap 48 does not.
    const clean = spacing.check(buildBoardModel(makeDocument([box("a", 0, 0), box("b", 192, 0)])));
    expect(clean).toHaveLength(0);

    const dirty = spacing.check(buildBoardModel(makeDocument([box("a", 0, 0), box("b", 208, 0)])));
    expect(dirty).toHaveLength(1);
    expect(dirty[0]).toMatchObject({
      rule: "spacing",
      severity: "warning",
      at: ["a", "b"],
      suggestion: "nearest rungs 32 / 64",
    });
    expect(dirty[0]!.message).toContain("48px");
    expect(dirty[0]!.where).toEqual({ x: 160, y: 0, width: 48, height: 96 });
  });

  test("gaps within rung tolerance carry no finding", () => {
    // gap 70 is within 8px of the 64 rung.
    const report = spacing.check(buildBoardModel(makeDocument([box("a", 0, 0), box("b", 230, 0)])));
    expect(report).toHaveLength(0);
  });

  test("gaps beyond the ladder window carry no obligation", () => {
    // Ported from lint.test.ts: 240px apart is "apart", not sibling spacing.
    const report = spacing.check(buildBoardModel(makeDocument([box("a", 0, 0), box("b", 400, 0)])));
    expect(report).toHaveLength(0);
  });

  test("sections are exempt; the vertical axis is checked", () => {
    const withSection = spacing.check(buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("wrap", 204, 0, 480, 320, "section"),
    ])));
    expect(withSection).toHaveLength(0);

    const vertical = spacing.check(buildBoardModel(makeDocument([
      box("top", 0, 0),
      box("bottom", 0, 140),
    ])));
    expect(vertical).toHaveLength(1);
    expect(vertical[0]!.message).toContain("axis y");
  });

  test("quickfix shifts the later box onto the nearest rung", () => {
    const document = makeDocument([box("a", 0, 0), box("b", 204, 0)]);
    const board = buildBoardModel(document);
    // v5: spacing is demoted from the live registry (Tier-B style file to
    // be), so run the rule explicitly.
    const diagnostic = runDiagnostics(board, [spacing]).find((entry) => entry.rule === "spacing")!;
    expect(diagnostic.quickfixAvailable).toBe(true);

    const operations = spacing.quickfix!(board, diagnostic);
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "b",
      patch: { geometry: { x: 192, y: 0, width: 160, height: 96 } },
    }]);

    const fixed = makeDocument([box("a", 0, 0), box("b", 192, 0)]);
    expect(spacing.check(buildBoardModel(fixed))).toHaveLength(0);
  });

  test("quickfix returns no ops when the finding no longer applies", () => {
    const stale = {
      id: "W1",
      rule: "spacing",
      severity: "warning" as const,
      at: ["a", "b"],
      message: "gap a↔b 44px off the ladder (axis x)",
      quickfixAvailable: true,
    };
    const cleanBoard = buildBoardModel(makeDocument([box("a", 0, 0), box("b", 224, 0)]));
    expect(spacing.quickfix!(cleanBoard, stale)).toEqual([]);
  });
});
