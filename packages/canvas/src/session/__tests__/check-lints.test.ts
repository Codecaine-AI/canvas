/**
 * The check-only lints (FINISHING_RULES past LAYOUT_RULES): what canvas_check
 * and finalize report about colors and wires, measured on the renderer's own
 * routes and chips, and never on an edit.
 */
import { describe, expect, test } from "bun:test";

import { FINISHING_RULES, LAYOUT_RULES } from "../../board/lints";
import { runDiagnostics } from "../../board/lints/run";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { canvasThemePreset } from "../../theme/canvas-style";
import { box, connect, makeDocument } from "./synthetic";

const style = canvasThemePreset("schematic-light");

function found(document: InteractiveCanvasDocument, rule: string): string[] {
  return runDiagnostics(document, FINISHING_RULES, { canvasStyle: style })
    .filter((finding) => finding.rule === rule)
    .map((finding) => `${finding.message} (${finding.suggestion})`);
}

const page = (): InteractiveCanvasObject => ({ ...box("page", 0, 0, 2400, 1600, "section"), color: "white" });

describe("check-only lints", () => {
  test("no edit runs them: they are not layout rules", () => {
    const ids = new Set(LAYOUT_RULES.map((rule) => rule.id));
    for (const id of ["same-color", "gray-share", "shared-wire", "chip-on-border", "short-wire", "hidden-arrowhead"]) {
      expect(ids.has(id)).toBe(false);
    }
  });

  test("gray-share fires past half the sections and nodes, naming the gray sections to recolor", () => {
    const board = (grays: number) => makeDocument([
      page(),
      { ...box("frame", 40, 40, 600, 400, "section"), color: "gray", parentId: "page" },
      ...Array.from({ length: 3 }, (_, index) => ({
        ...box(`n${index}`, 1000 + index * 300, 200, 160, 96, "process"),
        color: index < grays ? "gray" as const : "blue" as const,
      })),
    ]);
    // 2 of 4 is half: fine. 3 of 4 is not.
    expect(found(board(1), "gray-share")).toEqual([]);
    expect(found(board(2), "gray-share")).toEqual(["gray is 3 of 4 sections and nodes (75%) (change_color frame violet)"]);
  });

  test("shared-wire: a wire and its reply on one line, but not one trunk in one stroke", () => {
    const nodes = [page(), box("ask", 200, 200), box("answer", 800, 200), box("other", 800, 600)];
    expect(found(makeDocument(nodes, [connect("there", "ask", "answer"), connect("back", "answer", "ask")]), "shared-wire"))
      .toEqual([expect.stringMatching(/^there and back share \d+px of line at \(\d+, \d+\) \(route back 16px aside\)$/)]);
    // Two wires that leave one node in one stroke read as one trunk.
    const fan = [connect("a", "ask", "answer"), connect("b", "ask", "other")];
    const trunk = makeDocument(nodes, fan);
    expect(found(trunk, "shared-wire")).toEqual([]);
    // In two strokes they are two meanings on one line.
    const mixed = makeDocument(nodes, [fan[0]!, { ...fan[1]!, style: "dashed" }]);
    expect(found(mixed, "shared-wire")).toEqual(["a and b share 220px of line at (384, 248) (route b 16px aside)"]);
  });

  test("chip-on-border: a chip across a frame line, and none once the chip sits clear", () => {
    const board = (outerX: number) => makeDocument([
      page(),
      { ...box("frame", 40, 40, 400, 400, "section"), color: "blue", parentId: "page" },
      { ...box("inner", 200, 200), parentId: "frame" },
      box("outer", outerX, 200),
    ], [{ ...connect("cross", "inner", "outer"), label: "crosses" }]);
    // The chip centers on the wire's midpoint, x 440: the frame's right edge.
    expect(found(board(520), "chip-on-border")).toEqual(["cross's chip sits on the border of frame (move_label cross off the border)"]);
    expect(found(board(1200), "chip-on-border")).toEqual([]);
  });

  test("short-wire and hidden-arrowhead: a long label on a short wire hides the line and the head", () => {
    const board = (gap: number) => makeDocument([page(), box("a", 200, 600), box("b", 360 + gap, 600)],
      [{ ...connect("tight", "a", "b"), label: "a label far longer than its wire" }]);
    expect(found(board(80), "short-wire")).toEqual([expect.stringMatching(/^tight is \d+px, short for its chip \(move a and b apart to ≥\d+px\)$/)]);
    expect(found(board(80), "hidden-arrowhead")).toEqual(["tight's arrowhead is under its own chip (move_label tight away from the head)"]);
    expect(found(board(800), "short-wire")).toEqual([]);
    expect(found(board(800), "hidden-arrowhead")).toEqual([]);
  });

  test("hidden-arrowhead: two heads of two strokes on one spot", () => {
    const nodes = [page(), box("a", 200, 200), box("b", 200, 600), box("target", 800, 400)];
    const into = (style?: "dashed") => [
      { ...connect("solid", "a", "target"), to: { objectId: "target", anchor: "left" as const } },
      { ...connect("other", "b", "target"), to: { objectId: "target", anchor: "left" as const }, ...(style ? { style } : {}) },
    ];
    expect(found(makeDocument(nodes, into("dashed")), "hidden-arrowhead")).toEqual(["other's arrowhead sits on solid's (end other at another point)"]);
    // One stroke into one node is one trunk with one head.
    expect(found(makeDocument(nodes, into()), "hidden-arrowhead")).toEqual([]);
  });
});
