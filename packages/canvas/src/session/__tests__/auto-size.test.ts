/**
 * Auto-size: a node's text never clips, and its row and column peers keep one
 * size (session/tools/operations/auto-size.ts).
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

import { textFitReport } from "../../board/text-fit";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

const LONG = "Validate the signed webhook payload against the tenant's rotating secret";
/** Too long for the 280×100 default node. */
const LONGER = `${LONG}, then hand the verified event to the ledger writer queue`;

function objectOf(document: InteractiveCanvasDocument, id: string): InteractiveCanvasObject {
  return document.objects.find((object) => object.id === id)!;
}

function center(object: InteractiveCanvasObject): { cx: number; cy: number } {
  const g = object.geometry;
  return { cx: g.x + g.width / 2, cy: g.y + g.height / 2 };
}

function fits(object: InteractiveCanvasObject): boolean {
  return textFitReport(object, object.geometry, object.text ?? "").fits;
}

function onGrid(object: InteractiveCanvasObject): boolean {
  const { x, y, width, height } = object.geometry;
  return [x, y, width, height].every((value) => value % 20 === 0);
}

/** An empty page frame, so a scope has something to hold. */
function pageBoard(objects: InteractiveCanvasObject[] = []): InteractiveCanvasDocument {
  return makeDocument([{ ...box("page", 0, 0, 1600, 1200, "section"), text: "Page" }, ...objects]);
}

/** A detail line wider than a 160px box: it widens the node, where a long name only heightens it. */
const WIDE_DETAIL = "retries three times with jittered backoff";

/** A section holding a 2×2 grid of 160×80 processes at a 480×160 pitch: room for a column to widen. */
function gridBoard(): InteractiveCanvasDocument {
  const cell = (id: string, x: number, y: number) =>
    ({ ...box(id, x, y, 160, 80, "process"), parentId: "frame" });
  return makeDocument([
    { ...box("frame", 0, 0, 1200, 600, "section"), text: "Frame" },
    cell("a", 40, 80), cell("b", 520, 80),
    cell("c", 40, 240), cell("d", 520, 240),
  ]);
}

describe("auto-size · grow to fit", () => {
  test("place_shape with a name too long for the default size grows around its center", () => {
    const session = makeTestSession(pageBoard(), ["page"]);

    const result = runOp(session, "place_shape", { id: "n", type: "process", at: [200, 200], text: LONGER });

    expect(result.isError).toBeUndefined();
    const n = objectOf(session.draft, "n");
    expect(fits(n)).toBe(true);
    expect(onGrid(n)).toBe(true);
    expect(result.text).toContain(`APPLIED · place_shape n process ${n.geometry.x},${n.geometry.y} ${n.geometry.width}×${n.geometry.height}`);
    expect(result.text).toContain("grew n to");
  });

  test("a name that fits the default size keeps the default box", () => {
    const session = makeTestSession(pageBoard(), ["page"]);

    const result = runOp(session, "place_shape", { id: "n", type: "process", at: [200, 200], text: "Store" });

    expect(objectOf(session.draft, "n").geometry).toMatchObject({ x: 200, y: 200 });
    expect(result.text).not.toContain("grew");
  });

  test("clone with new text that does not fit grows the copy, not the source", () => {
    const session = makeTestSession(pageBoard([box("src", 40, 40, 160, 80, "process")]), ["page"]);

    runOp(session, "clone", { sourceId: "src", id: "copy", at: [400, 0], text: LONGER });

    expect(fits(objectOf(session.draft, "copy"))).toBe(true);
    expect(objectOf(session.draft, "src").geometry).toMatchObject({ width: 160, height: 80 });
  });

  test("change_shape to a narrower text slot grows the node back to fit", () => {
    const named = { ...box("n", 200, 200, 240, 120, "process"), text: "Authorize the payment request" };
    const session = makeTestSession(pageBoard([named]), ["page"]);
    expect(fits(named)).toBe(true);

    runOp(session, "change_shape", { id: "n", patch: { type: "decision" } });

    const n = objectOf(session.draft, "n");
    expect(n.type).toBe("decision");
    expect(fits(n)).toBe(true);
  });

  test("an icon whose caption detail does not fit widens, keeping its center", () => {
    const session = makeTestSession(pageBoard(), ["page"]);
    const detail = "consumes the order events stream and fans each one out to three workers";

    runOp(session, "place_shape", { id: "i", type: "server", at: [400, 400], text: "Worker", detail });

    const icon = objectOf(session.draft, "i");
    expect(icon.type).toBe("icon");
    expect(fits(icon)).toBe(true);
  });
});

describe("auto-size · peers grow with it", () => {
  test("row peers take the row's height and column peers its width, each keeping its center", () => {
    const session = makeTestSession(gridBoard(), ["frame"]);
    const before = new Map(session.draft.objects.map((object) => [object.id, center(object)]));

    runOp(session, "update_text", { id: "a", text: LONG, detail: WIDE_DETAIL });

    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => objectOf(session.draft, id));
    expect(fits(a!)).toBe(true);
    expect(a!.geometry.width).toBeGreaterThan(160);
    expect(a!.geometry.height).toBeGreaterThan(80);
    // b shares a's row: same height, own width.
    expect(b!.geometry.height).toBe(a!.geometry.height);
    expect(b!.geometry.width).toBe(160);
    // c shares a's column: same width, own height.
    expect(c!.geometry.width).toBe(a!.geometry.width);
    expect(c!.geometry.height).toBe(80);
    // d shares neither: untouched.
    expect(d!.geometry).toEqual({ x: 520, y: 240, width: 160, height: 80 });
    for (const peer of [b!, c!]) {
      expect(onGrid(peer)).toBe(true);
      const was = before.get(peer.id)!;
      expect(Math.abs(center(peer).cx - was.cx)).toBeLessThanOrEqual(10);
      expect(Math.abs(center(peer).cy - was.cy)).toBeLessThanOrEqual(10);
    }
    // The row still lines up: tops and bottoms agree.
    expect(b!.geometry.y).toBe(a!.geometry.y);
  });

  test("a peer already larger is never shrunk, and the grown node matches it", () => {
    const board = gridBoard();
    board.objects = board.objects.map((object) =>
      object.id === "b" ? { ...object, geometry: { ...object.geometry, y: 40, height: 160 } } : object);
    const session = makeTestSession(board, ["frame"]);

    runOp(session, "update_text", { id: "a", text: "Validate the signed webhook payload" });

    expect(objectOf(session.draft, "b").geometry.height).toBe(160);
    expect(objectOf(session.draft, "a").geometry.height).toBe(160);
  });

  test("a different type, a different section, a sticky, or a locked frame's node is not a peer", () => {
    const session = makeTestSession(makeDocument([
      { ...box("frame", 0, 0, 800, 300, "section"), text: "Frame" },
      { ...box("a", 40, 80, 160, 80, "process"), parentId: "frame" },
      { ...box("other-type", 280, 80, 160, 80, "database"), parentId: "frame" },
      { ...box("note", 520, 60, 160, 120, "sticky"), parentId: "frame" },
      { ...box("locked", 1000, 0, 400, 300, "section"), text: "Locked", locked: "all" },
      { ...box("frozen", 1040, 80, 160, 80, "process"), parentId: "locked" },
      box("outside", 900, 80, 60, 80, "process"),
    ]), ["frame"]);

    runOp(session, "update_text", { id: "a", text: LONG });

    expect(objectOf(session.draft, "a").geometry.height).toBeGreaterThan(80);
    expect(objectOf(session.draft, "other-type").geometry).toMatchObject({ height: 80 });
    expect(objectOf(session.draft, "note").geometry).toMatchObject({ height: 120 });
    expect(objectOf(session.draft, "frozen").geometry).toMatchObject({ height: 80 });
    expect(objectOf(session.draft, "outside").geometry).toMatchObject({ height: 80 });
  });

  test("a node placed into a row that already grew joins the row's height", () => {
    const session = makeTestSession(gridBoard(), ["frame"]);
    runOp(session, "update_text", { id: "a", text: LONG });
    const rowHeight = objectOf(session.draft, "a").geometry.height;
    expect(rowHeight).toBeGreaterThan(80);
    const rowCenter = center(objectOf(session.draft, "a")).cy;

    // The default process is 280×100; the row is taller, so the new node takes its height.
    runOp(session, "place_shape", { id: "e", type: "process", at: [760, rowCenter - 50], text: "Ship" });

    const e = objectOf(session.draft, "e");
    expect(e.geometry.height).toBe(Math.max(rowHeight, 100));
    expect(objectOf(session.draft, "a").geometry.height).toBe(e.geometry.height);
    expect(onGrid(e)).toBe(true);
  });

  test("a resize the drawer asks for, that the text fits, moves no peer", () => {
    const session = makeTestSession(gridBoard(), ["frame"]);

    runOp(session, "resize", { id: "a", width: 200, height: 120 });

    expect(objectOf(session.draft, "b").geometry.height).toBe(80);
    expect(objectOf(session.draft, "c").geometry.width).toBe(160);
  });
});

describe("auto-size · review fixes", () => {
  test("a peer whose match would newly overlap a neighbor keeps its size; the edited node still grows", () => {
    const session = makeTestSession(pageBoard([
      { ...box("a", 200, 200, 160, 80, "process"), text: "A" },
      box("b", 600, 200, 160, 80, "process"),
      box("neighbor", 600, 300, 160, 80, "rectangle"),
    ]), ["page"]);

    const result = runOp(session, "update_text", { id: "a", text: LONG });

    expect(fits(objectOf(session.draft, "a"))).toBe(true);
    expect(objectOf(session.draft, "b").geometry).toEqual({ x: 600, y: 200, width: 160, height: 80 });
    expect(result.text).toContain("kept b at 160×80: matching its row would overlap neighbor");
    expect(result.text).not.toContain("covered-content");
  });

  test("resize holds the target's top-left even when it matches a taller row peer", () => {
    const session = makeTestSession(pageBoard([
      { ...box("a", 200, 200, 160, 240, "process"), text: LONG },
      box("b", 600, 80, 160, 320, "process"),
    ]), ["page"]);

    runOp(session, "resize", { id: "a", width: 160, height: 80 });

    expect(objectOf(session.draft, "a").geometry).toMatchObject({ x: 200, y: 200 });
    expect(fits(objectOf(session.draft, "a"))).toBe(true);
  });

  test("match_size never writes its like source", () => {
    const session = makeTestSession(pageBoard([
      { ...box("a", 200, 200, 160, 240, "process"), text: LONG },
      box("source", 600, 200, 160, 80, "process"),
    ]), ["page"]);

    runOp(session, "match_size", { id: "a", like: "source" });

    expect(objectOf(session.draft, "source").geometry).toEqual({ x: 600, y: 200, width: 160, height: 80 });
    expect(fits(objectOf(session.draft, "a"))).toBe(true);
  });

  test("many text edits land where one edit to the same text lands, center unmoved", () => {
    const stepped = makeTestSession(pageBoard([box("a", 200, 200, 160, 80, "process")]), ["page"]);
    for (let words = 10; words <= 170; words += 10) {
      runOp(stepped, "update_text", { id: "a", text: "word ".repeat(words) });
    }
    const once = makeTestSession(pageBoard([box("a", 200, 200, 160, 80, "process")]), ["page"]);
    runOp(once, "update_text", { id: "a", text: "word ".repeat(170) });

    const a = objectOf(stepped.draft, "a");
    expect(a.geometry).toEqual(objectOf(once.draft, "a").geometry);
    expect(center(a)).toEqual({ cx: 280, cy: 240 });
    expect(onGrid(a)).toBe(true);
  });
});
