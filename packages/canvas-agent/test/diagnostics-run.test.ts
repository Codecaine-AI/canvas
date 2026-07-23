import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument } from "@codecaine-ai/canvas/schema";

import { formatDiagnostics, runDiagnostics as runAll } from "../src/board/lints/run";
import type { Diagnostic, LayoutRule } from "../src/board/lints/types";
import { box, makeDocument } from "./synthetic";

// Framework tests exercise the runner (ordering, ids, formatting), so they run
// against two minimal fixture rules. Full-registry behavior belongs to the
// per-lint test files, which would otherwise break these pins every time a
// lint is added.
type Finding = Omit<Diagnostic, "id" | "quickfixAvailable">;

const spacingRule: LayoutRule = {
  id: "spacing",
  title: "Spacing fixture",
  tier: "warning",
  guidance: "Test fixture only.",
  check(document) {
    const findings: Finding[] = [];
    for (let index = 0; index < document.objects.length; index += 1) {
      const first = document.objects[index]!;
      for (const second of document.objects.slice(index + 1)) {
        const xGap = second.geometry.x - (first.geometry.x + first.geometry.width);
        const yGap = second.geometry.y - (first.geometry.y + first.geometry.height);
        const axis = first.geometry.y === second.geometry.y && xGap === 44
          ? "x"
          : first.geometry.x === second.geometry.x && yGap === 44
            ? "y"
            : null;
        if (!axis) continue;
        findings.push({
          rule: "spacing",
          severity: "warning",
          at: [first.id, second.id],
          message: `gap ${first.id}↔${second.id} 44px off the ladder (axis ${axis})`,
          suggestion: "nearest rungs 32 / 64",
        });
      }
    }
    return findings;
  },
  quickfix: () => [],
};

const containmentRule: LayoutRule = {
  id: "containment",
  title: "Containment fixture",
  tier: "error",
  guidance: "Test fixture only.",
  check(document) {
    const child = document.objects.find((object) => object.id === "child");
    const section = document.objects.find((object) => object.id === "section");
    if (!child || !section) return [];
    const overflow = child.geometry.x + child.geometry.width
      - (section.geometry.x + section.geometry.width);
    if (overflow <= 0) return [];
    return [{
      rule: "containment",
      severity: "error",
      at: [child.id, section.id],
      message: `${child.id} extends ${overflow}px outside its section ${section.id}`,
      suggestion: `move ${child.id} back inside, or grow ${section.id}`,
    }];
  },
};

const runDiagnostics = (document: InteractiveCanvasDocument) =>
  runAll(document, [spacingRule, containmentRule]);

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
    const document = makeDocument([
      ...offLadderObjects(),
      ...escapedChildObjects(),
    ]);
    const diagnostics = runDiagnostics(document);

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
    const document = makeDocument([
      ...offLadderObjects(),
      ...escapedChildObjects(),
    ]);
    expect(runDiagnostics(document)).toEqual(runDiagnostics(document));
  });

  test("multiple findings from one rule keep positional order", () => {
    // a↔b off-ladder on x, a↔c off-ladder on y.
    const document = makeDocument([
      box("a", 0, 0),
      box("b", 204, 0),
      box("c", 0, 140),
    ]);
    const diagnostics = runDiagnostics(document);
    expect(diagnostics.map((diagnostic) => [diagnostic.id, ...diagnostic.at])).toEqual([
      ["W1", "a", "b"],
      ["W2", "a", "c"],
    ]);
  });

  test("a clean board produces no diagnostics", () => {
    const document = makeDocument([box("a", 0, 0), box("b", 224, 0)]);
    expect(runDiagnostics(document)).toEqual([]);
  });
});

describe("formatDiagnostics", () => {
  test("formats counts, ids, suggestions, and quickfix markers", () => {
    const document = makeDocument([
      ...offLadderObjects(),
      ...escapedChildObjects(),
    ]);
    const text = formatDiagnostics(runDiagnostics(document));

    expect(text).toContain("DIAGNOSTICS · 1 error · 1 warning");
    expect(text).toContain("E1 containment: child extends");
    expect(text).toContain("W1 spacing: gap a↔b 44px off the ladder (axis x) (nearest rungs 32 / 64) [quickfix]");
  });

  test("an empty list renders as clean", () => {
    expect(formatDiagnostics([])).toBe("DIAGNOSTICS · clean");
  });
});
