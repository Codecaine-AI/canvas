import { describe, expect, test } from "bun:test";

import { formatLintReport, lintDraft } from "../src/pipeline";
import { loadCanvasBoards } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

describe("lintDraft", () => {
  test("a known-clean corpus board reports clean", () => {
    const { document } = loadCanvasBoards()
      .find((board) => board.file === "agent-flows-2.canvas.json")!;
    const report = lintDraft(document);
    expect(report.clean).toBe(true);
    expect(formatLintReport(report)).toBe("Lint: clean.");
  });

  test("an off-ladder sibling gap is flagged with the nearest rung", () => {
    const clean = lintDraft(makeDocument([box("a", 0, 0), box("b", 192, 0)]));
    expect(clean.clean).toBe(true); // gap 32 sits on the ladder

    const dirty = lintDraft(makeDocument([box("a", 0, 0), box("b", 208, 0)]));
    expect(dirty.spacing).toHaveLength(1);
    expect(dirty.spacing[0]).toMatchObject({ aId: "a", bId: "b", axis: "x", gap: 48 });
    expect([32, 64]).toContain(dirty.spacing[0]!.nearestRung);
    expect(formatLintReport(dirty)).toContain("off the ladder");
  });

  test("gaps beyond the ladder window carry no obligation", () => {
    const report = lintDraft(makeDocument([box("a", 0, 0), box("b", 400, 0)]));
    expect(report.spacing).toHaveLength(0);
  });

  test("sub-pixel geometry is off-grid; 16px audit is opt-in", () => {
    const document = makeDocument([box("a", 10.5, 0), box("b", 24, 200)]);
    const report = lintDraft(document);
    expect(report.offGrid).toEqual([{ kind: "off-grid", id: "a", fields: ["x"] }]);

    const strict = lintDraft(document, undefined, { gridSize: 16 });
    expect(strict.offGrid.some((violation) => violation.id === "b")).toBe(true);
  });

  test("overflow beyond the frame reports side and amount", () => {
    const report = lintDraft(
      makeDocument([box("a", 0, 0, 160, 96)]),
      { x: 0, y: 0, width: 100, height: 200 },
    );
    expect(report.overflow).toEqual([
      { kind: "overflow", id: "a", side: "E", amount: 60 },
    ]);
    expect(formatLintReport(report)).toContain("60px past the right edge");
  });

  test("a connector forced through boxes is a crossing violation", () => {
    // A closed ring of walls around the source: every elbow to the outside
    // target must pass through a wall.
    const document = makeDocument(
      [
        box("target", 300, 300, 100, 100),
        box("wall-n", 0, 0, 700, 80),
        box("wall-s", 0, 620, 700, 80),
        box("wall-w", 0, 0, 80, 700),
        box("wall-e", 620, 0, 80, 700),
        box("outside", 900, 300, 100, 100),
      ],
      [connect("connection-1", "target", "outside")],
    );
    const report = lintDraft(document);
    expect(report.crossings.length).toBeGreaterThan(0);
    expect(report.crossings[0]).toMatchObject({ from: "target", to: "outside" });
    expect(formatLintReport(report)).toContain("passes through a box");
  });
});
