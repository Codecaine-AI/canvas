/**
 * near-miss: what canvas_check says about a board a few px off its guide
 * lines, and that the call each finding names puts the board on the line.
 */
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { box, connect, makeDocument } from "../../../session/__tests__/synthetic";
import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../../state/schema";
import { canvasThemePreset } from "../../../theme/canvas-style";
import { callToolkitTool, checkCanvasFile, openCanvasFile } from "../../../toolkit";
import { findBoardGuides } from "../../smart-guides/near-misses";
import { FINISHING_RULES, LAYOUT_RULES } from "..";
import { runDiagnostics } from "../run";

const style = canvasThemePreset("schematic-light");

function found(document: InteractiveCanvasDocument): string[] {
  return runDiagnostics(document, FINISHING_RULES, { canvasStyle: style })
    .filter((finding) => finding.rule === "near-miss")
    .map((finding) => `${finding.message} (${finding.suggestion})`);
}

const page = (): InteractiveCanvasObject => ({ ...box("page", 0, 0, 2400, 1600, "section"), color: "white" });
const node = (id: string, x: number, y: number) => box(id, x, y, 280, 100);
/** An icon paints a 56px tile in the middle of a 300×120 box. */
const icon = (id: string, x: number, y: number): InteractiveCanvasObject => ({ ...box(id, x, y, 300, 120, "icon"), icon: "database" });
const frame = (id: string, x: number, y: number, width: number, height: number): InteractiveCanvasObject =>
  ({ ...box(id, x, y, width, height, "section"), parentId: "page", color: "blue" });

/** One board per kind of near-miss, each with the one line canvas_check prints for it. */
const BOARDS: { name: string; document: InteractiveCanvasDocument; finding: string }[] = [
  {
    name: "a box one grid step off the box its wire runs to",
    document: makeDocument([page(), node("a", 200, 200), node("b", 800, 220)], [connect("w", "a", "b")]),
    finding: "b is 20px off a's center line, so w bends (move b by dy -20)",
  },
  {
    // Ford: "The icon should be moved so that it's in line with the green icon above it. And that the line is straight."
    name: "an icon tile half a step off its box, which no move on the grid centers",
    document: makeDocument([page(), node("registry", 640, 460), icon("plugins", 1200, 460)], [connect("load", "plugins", "registry")]),
    finding: "plugins is 10px off registry's center line, so load bends (arrange plugins, registry align center_v)",
  },
  {
    name: "two siblings with no wire, tops 10px apart",
    document: makeDocument([page(), node("a", 200, 200), node("b", 800, 210)]),
    finding: "b is 10px off a's top edge (move b by dy -10)",
  },
  {
    name: "a section's far edge short of its sibling's",
    document: makeDocument([page(), frame("top", 100, 100, 1000, 300), frame("low", 100, 460, 1020, 300)]),
    finding: "top's right edge is 20px off low's (resize top width 1020)",
  },
  {
    name: "a section's near edge inside its sibling's",
    document: makeDocument([page(), frame("top", 100, 100, 1000, 300), frame("low", 120, 460, 980, 200)]),
    finding: "low's left edge is 20px off top's (move low by dx -20, then resize low width 1000)",
  },
  {
    name: "a row of three with gaps of 120 and 140",
    document: makeDocument([page(), node("a", 200, 200), node("b", 600, 200), node("c", 1020, 200)]),
    finding: "b sits 120px from a and 140px from c (move c by dx -20)",
  },
  {
    // Ford: "This should be, like, more justified between and then, like, centered."
    name: "a section's one row 40px left of its center",
    document: makeDocument([
      page(), frame("group", 100, 100, 1000, 300),
      { ...node("a", 220, 200), parentId: "group" }, { ...node("b", 620, 200), parentId: "group" },
    ]),
    finding: "a, b sit 40px left of group's center (move a by dx 40, then move b by dx 40)",
  },
  {
    // Ford: "We should prefer unless otherwise stated, that, like, the arrow goes into the center of the objects."
    name: "an arrowhead a straight wire holds off the center of a side",
    document: makeDocument([
      page(), frame("left", 100, 100, 500, 400), frame("right", 760, 100, 440, 400),
      { ...icon("t", 200, 200), parentId: "left" }, { ...node("b", 840, 220), parentId: "right" },
    ], [{ ...connect("w", "t", "b"), waypoints: [[700, 260]] }]),
    finding: "w's arrowhead is 10px off the center of b's left side (arrange t, b align center_v)",
  },
  {
    name: "a straight wire whose stored corner holds it off the line its two boxes share",
    document: makeDocument([page(), node("a", 200, 220), node("b", 840, 220)], [{ ...connect("w", "a", "b"), waypoints: [[700, 260]] }]),
    finding: "w's arrowhead is 10px off the center of b's left side (route w reset)",
  },
  // Boxes a hand put off the agent's grid: `move` and `resize` land on it, so the call named must still reach the line.
  {
    name: "a row whose last box sits off the grid, with gaps of 120 and 128",
    document: makeDocument([page(), node("a", 200, 200), node("b", 600, 200), node("c", 1008, 200)]),
    finding: "b sits 120px from a and 128px from c (move c by dx -8)",
  },
  {
    name: "a box off the grid on the other axis, which a move would shift both ways",
    document: makeDocument([page(), node("a", 200, 200), node("b", 220, 608), node("c", 800, 608)]),
    finding: "b is 20px off a's left edge (arrange b, a align left)",
  },
  {
    name: "a section's far edge off the grid, which only its own resize reaches",
    document: makeDocument([page(), frame("top", 100, 100, 1000, 300), frame("low", 100, 460, 1008, 300)]),
    finding: "low's right edge is 8px off top's (resize low width 1000)",
  },
  {
    name: "two boxes that sit differently in their own frames, which lining up the frames leaves apart",
    document: makeDocument([
      page(), frame("left", 100, 100, 400, 200), frame("right", 700, 100, 400, 200),
      { ...node("a", 160, 140), parentId: "left" }, { ...node("b", 760, 152), parentId: "right" },
    ], [connect("w", "a", "b")]),
    finding: "b is 12px off a's center line, so w bends (arrange b, a align center_v)",
  },
];

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** The board as a file the board tools can edit. */
function opened(document: InteractiveCanvasDocument) {
  const dir = mkdtempSync(join(tmpdir(), "near-miss-"));
  dirs.push(dir);
  const path = join(dir, "board.canvas.json");
  writeFileSync(path, JSON.stringify({ ...document, viewport: { x: 0, y: 0, zoom: 1 }, annotations: [] }));
  return openCanvasFile(path, { canvasStyle: style });
}

describe("near-miss: the smart guides at canvas_check", () => {
  test("no edit runs it: it is not a layout rule", () => {
    expect(LAYOUT_RULES.map((rule) => rule.id)).not.toContain("near-miss");
    expect(FINISHING_RULES.map((rule) => rule.id)).toContain("near-miss");
  });

  for (const { name, document, finding } of BOARDS) {
    test(`${name}: names the ids and the call that fixes it`, () => {
      expect(found(document)).toEqual([finding]);
    });
  }

  /** Makes the calls the board's one finding names, with the board tools, then checks the board again. */
  async function fixed(name: string, document: InteractiveCanvasDocument): Promise<string> {
    const file = opened(document);
    const [miss, ...rest] = findBoardGuides(file.session.draft, style).nearMisses;
    expect(rest, name).toEqual([]);
    for (const step of miss!.fix) {
      const result = await callToolkitTool(file, step.tool, step.args);
      expect(result.isError ?? false, `${name}: ${result.text}`).toBe(false);
    }
    return checkCanvasFile(file, "board").text;
  }

  test("each call a finding names, made with the board tools, clears the finding", async () => {
    for (const { name, document } of BOARDS) expect(await fixed(name, document), name).not.toContain("near-miss");
  });

  test("a board on its lines, or far off them, is left alone", () => {
    // On the line, a full row apart, and a wire with no line to share.
    expect(found(makeDocument([page(), node("a", 200, 200), node("b", 800, 200)], [connect("w", "a", "b")]))).toEqual([]);
    expect(found(makeDocument([page(), node("a", 200, 200), node("b", 800, 260)], [connect("w", "a", "b")]))).toEqual([]);
    expect(found(makeDocument([page(), node("a", 200, 200), node("b", 600, 200), node("c", 1000, 200)]))).toEqual([]);
    // A side pin the router drops, so the head paints on the center. One it keeps, because the center costs a bend.
    const pinned = (...more: InteractiveCanvasObject[]) => makeDocument([page(), node("a", 200, 200), node("b", 800, 600), ...more],
      [{ ...connect("w", "a", "b"), to: { objectId: "b", anchor: "top" as const, position: [0.45, 0] as [number, number] } }]);
    expect(found(pinned())).toEqual([]);
    expect(found(pinned(box("k", 930, 380, 120, 100)))).toEqual([]);
    // A straight wire 15px off the center of b's side, from a box whose center is 100px away: no snap lines them up.
    expect(found(makeDocument([page(), box("a", 200, 220, 280, 300), node("b", 800, 220)],
      [{ ...connect("w", "a", "b"), waypoints: [[640, 285]] }]))).toEqual([]);
    // Gaps of 112 and 100, where the one move that evens them would bend the top box's straight wire.
    const column = [page(), node("a", 200, 208), node("b", 200, 420), node("c", 200, 620), node("root", 800, 208)];
    expect(found(makeDocument(column))).toEqual(["b sits 112px from a and 100px from c (move a by dy 12)"]);
    expect(found(makeDocument(column, [connect("w", "root", "a")]))).toEqual([]);
  });

  test("several wires into one port are one arrowhead, named once by the straight wire that holds it", async () => {
    // Ford keeps the merged junction: "The lines just appear more aesthetic."
    const document = makeDocument([
      page(), frame("left", 100, 100, 500, 600), frame("right", 760, 100, 440, 600),
      { ...icon("m", 200, 440), parentId: "left" }, { ...icon("t", 200, 200), parentId: "left" }, { ...node("b", 840, 220), parentId: "right" },
    ], [{ ...connect("v", "m", "b"), waypoints: [[700, 500], [700, 260]] }, { ...connect("w", "t", "b"), waypoints: [[700, 260]] }]);
    expect(found(document)).toEqual(["w's arrowhead is 10px off the center of b's left side (arrange t, b align center_v)"]);
    expect(await fixed("junction", document)).not.toContain("near-miss");
  });
});
