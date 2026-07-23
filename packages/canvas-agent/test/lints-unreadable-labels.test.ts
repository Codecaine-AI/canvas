import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { runDiagnostics } from "../src/diagnostics/run";
import { rule as unreadableLabels } from "../src/lints/unreadable-labels";
import { box, connect, makeDocument } from "./synthetic";

describe("unreadable-labels lint", () => {
  test("declares its faces", () => {
    expect(unreadableLabels.id).toBe("unreadable-labels");
    expect(unreadableLabels.tier).toBe("warning");
    expect(unreadableLabels.guidance).toContain("128");
    expect(typeof unreadableLabels.quickfix).toBe("function");
  });

  test("a labeled pair below the raised 128px floor warns", () => {
    // Gap 96 was legal under v4's max(96, chip+32) floor; v5 raises the
    // floor to 128 (flowchart R1: short chips sat in 96px slots).
    const findings = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 256, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      rule: "unreadable-labels",
      severity: "warning",
      at: ["a", "b"],
      where: { x: 160, y: 0, width: 96, height: 96 },
    });
    expect(findings[0]!.message).toContain('96px gap is too tight for its "X" chip');
    expect(findings[0]!.suggestion).toContain("≥128px");
  });

  test("floor threshold: gap 127 warns, gap 128 is clean", () => {
    const under = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 287, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(under).toHaveLength(1);
    expect(under[0]!.message).toContain("127px");

    const atFloor = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 288, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    )));
    expect(atFloor).toHaveLength(0);
  });

  test("wide chips push the minimum past the floor (chip width + 32)", () => {
    // "connect-to-database" → chip 19*8+24 = 176px, needed 208.
    const tight = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 360, 0)],  // gap 200
      [{ ...connect("e", "a", "b"), label: "connect-to-database" }],
    )));
    expect(tight).toHaveLength(1);
    expect(tight[0]!.suggestion).toContain("≥208px");

    const roomy = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 368, 0)],  // gap 208
      [{ ...connect("e", "a", "b"), label: "connect-to-database" }],
    )));
    expect(roomy).toHaveLength(0);
  });

  test("pairs beyond the 224px window carry no obligation", () => {
    // Even a chip needing 256px is out of scope once the pair is 240 apart —
    // at that distance the chip is not wedged between the boxes.
    const findings = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 400, 0)],  // gap 240
      [{ ...connect("e", "a", "b"), label: "a-very-long-edge-label-here" }],
    )));
    expect(findings).toHaveLength(0);
  });

  test("unlabeled pairs and section endpoints carry no finding", () => {
    const unlabeled = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 208, 0)],
      [connect("e", "a", "b")],
    )));
    expect(unlabeled).toHaveLength(0);

    const sectionPair = unreadableLabels.check(buildBoardModel(makeDocument(
      [box("wrap", 0, 0, 480, 320, "section"), box("b", 520, 0)],
      [{ ...connect("e", "wrap", "b"), label: "X" }],
    )));
    expect(sectionPair).toHaveLength(0);
  });

  test("quickfix widens the pair to the breathing minimum on the 16px grid", () => {
    const document = makeDocument(
      [box("a", 0, 0), box("b", 256, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    );
    const board = buildBoardModel(document);
    const diagnostic = runDiagnostics(board).find((entry) => entry.rule === "unreadable-labels")!;
    expect(diagnostic.quickfixAvailable).toBe(true);

    const operations = unreadableLabels.quickfix!(board, diagnostic);
    expect(operations).toEqual([{
      type: "updateObject",
      objectId: "b",
      patch: { geometry: { x: 288, y: 0, width: 160, height: 96 } },
    }]);

    const fixed = makeDocument(
      [box("a", 0, 0), box("b", 288, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    );
    expect(unreadableLabels.check(buildBoardModel(fixed))).toHaveLength(0);
  });

  test("quickfix returns no ops when the finding no longer applies", () => {
    const stale = {
      id: "W1",
      rule: "unreadable-labels",
      severity: "warning" as const,
      at: ["a", "b"],
      message: 'labeled edge a↔b: 96px gap is too tight for its "X" chip',
      quickfixAvailable: true,
    };
    const cleanBoard = buildBoardModel(makeDocument(
      [box("a", 0, 0), box("b", 320, 0)],
      [{ ...connect("e", "a", "b"), label: "X" }],
    ));
    expect(unreadableLabels.quickfix!(cleanBoard, stale)).toEqual([]);
  });
});
