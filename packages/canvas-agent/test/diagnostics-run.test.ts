import { describe, expect, test } from "bun:test";

import { buildBoardModel } from "../src/digest/board-model";
import { formatDiagnostics, runDiagnostics as runAll } from "../src/diagnostics/run";
import { rule as containmentRule } from "../src/rules/containment";
import { rule as spacingRule } from "../src/rules/spacing";
import type { BoardModel } from "../src/digest/board-model";
import { box, makeDocument } from "./synthetic";

// Framework tests exercise the runner (ordering, ids, formatting), so they run
// against a fixed two-rule registry — full-registry behavior belongs to the
// per-rule test files, which would otherwise break these pins every time a
// rule is added.
const runDiagnostics = (board: BoardModel) => runAll(board, [spacingRule, containmentRule]);

/** A section whose parentId child pokes out the right side (containment E). */
function escapedChildObjects() {
  return [
    box("section", 0, 0, 480, 320, "section"),
    { ...box("child", 400, 96, 184, 96, "process"), parentId: "section" },
  ];
}

/** Two boxes with an off-ladder 44px horizontal gap (spacing W). */
function offLadderObjects(prefix = "") {
  return [
    box(`${prefix}a`, 0, 600, 160, 96),
    box(`${prefix}b`, 204, 600, 160, 96),
  ];
}

describe("runDiagnostics", () => {
  test("orders errors before warnings and assigns E*/W* ids", () => {
    const board = buildBoardModel(makeDocument([
      ...offLadderObjects(),
      ...escapedChildObjects(),
    ]));
    const diagnostics = runDiagnostics(board);

    expect(diagnostics.map((diagnostic) => diagnostic.id)).toEqual(["E1", "W1"]);
    expect(diagnostics[0]).toMatchObject({
      rule: "containment",
      severity: "error",
      at: ["child", "section"],
      quickfixAvailable: false,
    });
    expect(diagnostics[1]).toMatchObject({
      rule: "spacing",
      severity: "warning",
      at: ["a", "b"],
      quickfixAvailable: true,
    });
    expect(diagnostics[1]!.message).toContain("44px");
    expect(diagnostics[1]!.suggestion).toBe("nearest rungs 32 / 64");
  });

  test("re-running on an unchanged board yields identical diagnostics", () => {
    const board = buildBoardModel(makeDocument([
      ...offLadderObjects(),
      ...escapedChildObjects(),
    ]));
    expect(runDiagnostics(board)).toEqual(runDiagnostics(board));
  });

  test("multiple findings from one rule keep positional order", () => {
    // a↔b off-ladder on x, a↔c off-ladder on y.
    const board = buildBoardModel(makeDocument([
      box("a", 0, 0),
      box("b", 204, 0),
      box("c", 0, 140),
    ]));
    const diagnostics = runDiagnostics(board);
    expect(diagnostics.map((diagnostic) => [diagnostic.id, ...diagnostic.at])).toEqual([
      ["W1", "a", "b"],
      ["W2", "a", "c"],
    ]);
  });

  test("a clean board produces no diagnostics", () => {
    const board = buildBoardModel(makeDocument([box("a", 0, 0), box("b", 224, 0)]));
    expect(runDiagnostics(board)).toEqual([]);
  });
});

describe("formatDiagnostics", () => {
  test("formats counts, ids, suggestions, and quickfix markers", () => {
    const board = buildBoardModel(makeDocument([
      ...offLadderObjects(),
      ...escapedChildObjects(),
    ]));
    const text = formatDiagnostics(runDiagnostics(board));

    expect(text).toContain("DIAGNOSTICS · 1 error · 1 warning");
    expect(text).toContain("E1 containment: child extends");
    expect(text).toContain("W1 spacing: gap a↔b 44px off the ladder (axis x) (nearest rungs 32 / 64) [quickfix]");
  });

  test("an empty list renders as clean", () => {
    expect(formatDiagnostics([])).toBe("DIAGNOSTICS · clean");
  });
});
