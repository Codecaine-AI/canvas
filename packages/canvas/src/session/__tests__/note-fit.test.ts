/**
 * A card note has one height, the height its text needs, fitted on write
 * (objects/sticky/note-fit.ts, auto-size.ts rule 0).
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";
import { fitNotesToText, noteNeededHeight } from "../../objects/sticky/note-fit";
import { canvasThemePreset, FIGJAM_CANVAS_STYLE } from "../../theme/canvas-style";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

const CARD = canvasThemePreset("schematic-light");

function note(id: string, text: string, x = 200, y = 200, width = 240, height = 240): InteractiveCanvasObject {
  return { ...box(id, x, y, width, height, "sticky"), text, color: "yellow", style: { shape: "note" } };
}

function pageBoard(objects: InteractiveCanvasObject[]): InteractiveCanvasDocument {
  return makeDocument([{ ...box("page", 0, 0, 1600, 1200, "section"), text: "Page" }, ...objects]);
}

function geometryOf(document: InteractiveCanvasDocument, id: string) {
  return document.objects.find((object) => object.id === id)!.geometry;
}

const FIVE_LINES = "one\ntwo\nthree\nfour\nfive";

describe("card note · fit on write", () => {
  test("update_text shrinks a tall note to one line of text and grows it back for five, top-left held", () => {
    const session = makeTestSession(pageBoard([note("n", "Short")]), ["page"], { canvasStyle: CARD });

    runOp(session, "update_text", { id: "n", text: "Short note" });
    const short = geometryOf(session.draft, "n");
    // 14px padding + one 24px line + 14px padding = 52, on the grid: 60.
    expect(short).toEqual({ x: 200, y: 200, width: 240, height: 60 });

    runOp(session, "update_text", { id: "n", text: FIVE_LINES });
    const tall = geometryOf(session.draft, "n");
    expect(tall).toMatchObject({ x: 200, y: 200, width: 240 });
    expect(tall.height).toBe(noteNeededHeight(session.draft.objects.find((o) => o.id === "n")!, CARD));
    expect(tall.height).toBeGreaterThan(short.height);
  });

  test("place_sticky lands at the height its text needs", () => {
    const session = makeTestSession(pageBoard([]), ["page"], { canvasStyle: CARD });

    const result = runOp(session, "place_sticky", { id: "n", at: [200, 200], text: "Retries are capped at three." });

    const placed = session.draft.objects.find((object) => object.id === "n")!;
    expect(placed.geometry.height).toBe(noteNeededHeight(placed, CARD));
    expect(result.text).toContain(`${placed.geometry.width}×${placed.geometry.height}`);
  });

  test("resize keeps a dragged height at or above the needed one, and lifts one below it", () => {
    const session = makeTestSession(pageBoard([note("n", FIVE_LINES, 200, 200, 240, 400)]), ["page"], { canvasStyle: CARD });
    const needed = noteNeededHeight(note("n", FIVE_LINES), CARD)!;

    runOp(session, "resize", { id: "n", height: needed + 80 });
    expect(geometryOf(session.draft, "n").height).toBe(needed + 80);

    runOp(session, "resize", { id: "n", height: 40 });
    expect(geometryOf(session.draft, "n")).toMatchObject({ y: 200, width: 240, height: needed });
  });

  test("a figjam paper sticky keeps its square on update_text", () => {
    const session = makeTestSession(pageBoard([note("n", "Short")]), ["page"], { canvasStyle: FIGJAM_CANVAS_STYLE });

    runOp(session, "update_text", { id: "n", text: "Short note" });

    expect(geometryOf(session.draft, "n")).toMatchObject({ width: 240, height: 240 });
  });
});

describe("fitNotesToText", () => {
  test("fits every card note, leaves shapes alone, grows a section around a note that grew and never shrinks one", () => {
    const document = makeDocument([
      { ...box("frame", 0, 0, 400, 200, "section"), text: "Frame" },
      { ...note("tall", "Short", 40, 60, 240, 240), parentId: "frame" },
      { ...note("deep", "x\n".repeat(12).trim(), 40, 340, 240, 60), parentId: null },
      box("shape", 600, 60, 160, 96, "process"),
    ]);

    const fitted = fitNotesToText(document, CARD);

    expect(geometryOf(fitted, "tall").height).toBe(60);
    expect(geometryOf(fitted, "deep").height).toBe(noteNeededHeight(fitted.objects.find((o) => o.id === "deep")!, CARD));
    expect(geometryOf(fitted, "deep").height).toBeGreaterThan(60);
    expect(geometryOf(fitted, "shape")).toEqual({ x: 600, y: 60, width: 160, height: 96 });
    expect(geometryOf(fitted, "frame")).toEqual({ x: 0, y: 0, width: 400, height: 200 });
    // Fitting is a fixed point.
    expect(fitNotesToText(fitted, CARD)).toBe(fitted);
  });

  test("leaves every figjam paper sticky as it is", () => {
    const document = makeDocument([note("paper", "Short", 0, 0, 240, 240)]);
    expect(fitNotesToText(document, FIGJAM_CANVAS_STYLE)).toBe(document);
  });
});
