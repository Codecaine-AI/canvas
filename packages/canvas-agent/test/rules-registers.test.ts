import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { runDiagnostics } from "../src/diagnostics/run";
import { rule as registers } from "../src/rules/registers";
import { box, makeDocument } from "./synthetic";

/**
 * Near-register fixture: y-centers 144 (a), 144 (c), 152 (b) — within the
 * 8px band, not exactly aligned, drawn from two parents (a/c float, b sits
 * in a section). All geometry 16-aligned; the near-miss comes from mixed
 * heights, not off-grid positions.
 */
function nearRegisterObjects() {
  return [
    box("sec", 280, 0, 240, 288, "section"),
    box("a", 0, 96, 160, 96),                                  // y-center 144
    { ...box("b", 320, 96, 160, 112), parentId: "sec" },       // y-center 152
    box("c", 640, 112, 160, 64),                               // y-center 144
  ];
}

describe("registers rule", () => {
  test("declares its two faces", () => {
    expect(registers.id).toBe("registers");
    expect(registers.tier).toBe("warning");
    expect(registers.guidance).toContain("centerline");
    expect(registers.guidance).toContain("8px");
    expect(typeof registers.quickfix).toBe("function");
  });

  test("three near-aligned nodes from two parents are told to align or separate", () => {
    const findings = registers.check(buildBoardModel(makeDocument(nearRegisterObjects())));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "registers",
      severity: "warning",
      at: ["a", "c", "b"],   // cluster order: by center, then id
      suggestion: "median register y=144",
    });
    expect(findings[0]!.message).toContain("within 8px — align or separate");
    expect(findings[0]!.where).toEqual({ x: 0, y: 96, width: 800, height: 112 });
  });

  test("exactly aligned centers are clean", () => {
    const findings = registers.check(buildBoardModel(makeDocument([
      box("sec", 280, 0, 240, 288, "section"),
      box("a", 0, 96),
      { ...box("b", 320, 96), parentId: "sec" },
      box("c", 640, 96),
    ])));
    expect(findings).toHaveLength(0);
  });

  test("a single parent carries no cross-branch finding", () => {
    const findings = registers.check(buildBoardModel(makeDocument([
      box("a", 0, 96, 160, 96),
      box("b", 320, 96, 160, 112),
      box("c", 640, 112, 160, 64),
    ])));
    expect(findings).toHaveLength(0);
  });

  test("centers beyond the 8px band do not cluster", () => {
    // y-centers 144 / 152 / 160: only two fit one 8px band — no trio, no finding.
    const findings = registers.check(buildBoardModel(makeDocument([
      box("sec", 280, 0, 240, 288, "section"),
      box("a", 0, 96, 160, 96),                                // 144
      { ...box("b", 320, 96, 160, 112), parentId: "sec" },     // 152
      box("c", 640, 112, 160, 96),                             // 160
    ])));
    expect(findings).toHaveLength(0);
  });

  test("quickfix snaps every member to the median register", () => {
    const board = buildBoardModel(makeDocument(nearRegisterObjects()));
    // v5: registers is demoted from the live registry — run the rule explicitly.
    const diagnostic = runDiagnostics(board, [registers]).find((entry) => entry.rule === "registers")!;
    expect(diagnostic.quickfixAvailable).toBe(true);

    const operations = registers.quickfix!(board, diagnostic);
    // a and c already sit on the 144 register; only b moves (center 152 → 144).
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "b",
      patch: { geometry: { x: 320, y: 88, width: 160, height: 112 } },
    }]);

    const fixed = buildBoardModel(makeDocument([
      box("sec", 280, 0, 240, 288, "section"),
      box("a", 0, 96, 160, 96),
      { ...box("b", 320, 88, 160, 112), parentId: "sec" },
      box("c", 640, 112, 160, 64),
    ]));
    expect(registers.check(fixed)).toHaveLength(0);
  });

  test("quickfix returns no ops when the finding no longer applies", () => {
    const stale = {
      id: "W1",
      rule: "registers",
      severity: "warning" as const,
      at: ["a", "c", "b"],
      message: "y-centers of a/c/b within 8px — align or separate",
      quickfixAvailable: true,
    };
    const clean = buildBoardModel(makeDocument([
      box("a", 0, 96),
      { ...box("b", 320, 96), parentId: "sec" },
      box("c", 640, 96),
    ]));
    expect(registers.quickfix!(clean, stale)).toEqual([]);
  });
});
