import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { runDiagnostics } from "../src/diagnostics/run";
import { rule as rhythm } from "../src/rules/rhythm";
import { box, makeDocument } from "./synthetic";

/** The cram case: gaps 32 and 96 — each on a rung, together uneven. */
function crammedRow() {
  return makeDocument([box("a", 0, 0), box("b", 192, 0), box("c", 448, 0)]);
}

describe("rhythm rule", () => {
  test("declares its two faces", () => {
    expect(rhythm.id).toBe("rhythm");
    expect(rhythm.tier).toBe("warning");
    expect(rhythm.guidance).toContain("pitch");
    expect(rhythm.guidance).toContain("{0, 32, 64, 96, 128}");
    expect(typeof rhythm.quickfix).toBe("function");
  });

  test("on-rung but uneven gaps are flagged (the Lint-clean cram case)", () => {
    const findings = rhythm.check(buildBoardModel(crammedRow()));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "rhythm",
      severity: "warning",
      at: ["a", "b", "c"],
      suggestion: "even the gaps to the 64px rung",
      where: { x: 0, y: 0, width: 608, height: 96 },
    });
    expect(findings[0]!.message).toContain("gaps 32/96px uneven (spread 64px, axis x)");
  });

  test("an evenly pitched row is clean; spread of exactly 16px is tolerated", () => {
    const even = rhythm.check(buildBoardModel(makeDocument([
      box("a", 0, 0), box("b", 224, 0), box("c", 448, 0),
    ])));
    expect(even).toHaveLength(0);

    // Gaps 48 / 64: spread exactly 16 carries no finding.
    const edge = rhythm.check(buildBoardModel(makeDocument([
      box("a", 0, 0), box("b", 208, 0), box("c", 432, 0),
    ])));
    expect(edge).toHaveLength(0);
  });

  test("a gap beyond the ladder window breaks the run", () => {
    // 320px to c is "apart": the remaining pair is too short to carry rhythm.
    const findings = rhythm.check(buildBoardModel(makeDocument([
      box("a", 0, 0), box("b", 192, 0), box("c", 672, 0),
    ])));
    expect(findings).toHaveLength(0);
  });

  test("only same-parent siblings form a run; the vertical axis is checked", () => {
    const split = rhythm.check(buildBoardModel(makeDocument([
      box("sec", 176, 200, 240, 288, "section"),
      box("a", 0, 0),
      { ...box("b", 192, 0), parentId: "sec" },
      box("c", 448, 0),
    ])));
    expect(split).toHaveLength(0);

    const column = rhythm.check(buildBoardModel(makeDocument([
      box("a", 0, 0), box("b", 0, 128), box("c", 0, 320),
    ])));
    expect(column).toHaveLength(1);
    expect(column[0]!.message).toContain("gaps 32/96px uneven (spread 64px, axis y)");
  });

  test("quickfix evens the gaps to the median rung, first box fixed", () => {
    const board = buildBoardModel(crammedRow());
    // v5: rhythm is demoted from the live registry — run the rule explicitly.
    const diagnostic = runDiagnostics(board, [rhythm]).find((entry) => entry.rule === "rhythm")!;
    expect(diagnostic.quickfixAvailable).toBe(true);

    const operations = rhythm.quickfix!(board, diagnostic);
    // b shifts onto the 64 rung; c already lands on the re-pitched position.
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "b",
      patch: { geometry: { x: 224, y: 0, width: 160, height: 96 } },
    }]);

    const fixed = buildBoardModel(makeDocument([
      box("a", 0, 0), box("b", 224, 0), box("c", 448, 0),
    ]));
    expect(rhythm.check(fixed)).toHaveLength(0);
  });

  test("quickfix returns no ops when the finding no longer applies", () => {
    const stale = {
      id: "W1",
      rule: "rhythm",
      severity: "warning" as const,
      at: ["a", "b", "c"],
      message: "run a→b→c gaps 32/96px uneven (spread 64px, axis x)",
      quickfixAvailable: true,
    };
    const clean = buildBoardModel(makeDocument([
      box("a", 0, 0), box("b", 224, 0), box("c", 448, 0),
    ]));
    expect(rhythm.quickfix!(clean, stale)).toEqual([]);
  });
});
