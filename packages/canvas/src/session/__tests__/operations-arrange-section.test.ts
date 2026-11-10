/**
 * `arrange_section` — one frame's nodes laid out in the rows the model names,
 * pitched from each node's painted footprint at the craft-target gaps, with
 * the frame closed around what landed.
 *
 * What these pin: the gaps a reader sees (footprint to footprint, so an icon's
 * caption counts), the shared center line of a mixed-size row, the frame that
 * contains every footprint, and each refusal naming why and what to do.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

import { CRAFT_TARGETS } from "../../authoring/style-guide/craft-targets";
import { diffDocuments } from "../../board/doc-diff";
import { runDiagnostics } from "../../board/lints/run";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import { hitBoundsForObject } from "../../objects/geometry";
import { makeTestSession, runOp } from "./helpers";
import { box, makeDocument } from "./synthetic";

function objectOf(document: InteractiveCanvasDocument, id: string): InteractiveCanvasObject {
  const found = document.objects.find((object) => object.id === id);
  if (!found) throw new Error(`no object ${id} on the draft`);
  return found;
}

function footprint(document: InteractiveCanvasDocument, id: string) {
  return hitBoundsForObject(objectOf(document, id));
}

/** A small frame and three nodes of three sizes, scattered outside it. */
function mixedBoard(): InteractiveCanvasDocument {
  return makeDocument([
    { ...box("frame", 0, 0, 480, 360, "section"), text: "Frame" },
    { ...box("wide", 900, 40, 280, 100, "process"), text: "Wide" },
    { ...box("tall", 1300, 600, 240, 160, "process"), text: "Tall" },
    { ...box("small", 700, 900, 240, 100, "process"), text: "Small" },
  ]);
}

/** A frame holding two captioned icons and a plain node. */
function iconBoard(): InteractiveCanvasDocument {
  return makeDocument([
    { ...box("frame", 100, 100, 960, 640, "section"), text: "Frame" },
    { ...box("db", 140, 180, 120, 120, "icon"), text: "Orders database", icon: "database" as const, parentId: "frame" },
    { ...box("model", 400, 180, 120, 120, "icon"), text: "Ranking model", icon: "model" as const, parentId: "frame" },
    { ...box("api", 700, 180, 280, 100, "process"), text: "API", parentId: "frame" },
  ]);
}

describe("arrange_section — rows in, coordinates out", () => {
  test("pitches mixed sizes at the craft gaps, shares each row's center, and fits the frame", () => {
    const session = makeTestSession(mixedBoard(), ["frame"]);

    const result = runOp(session, "arrange_section", {
      section: "frame",
      rows: [["wide", "tall"], ["small"]],
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · arrange_section frame → frame 0,0");
    const doc = session.draft;
    const [wide, tall, small, frame] = ["wide", "tall", "small", "frame"].map((id) => footprint(doc, id));

    // Across a row: nodeGapRow between footprints. Down a column: nodeGapColumn
    // between the tallest box of one row and the next row's cell.
    expect(tall!.x - (wide!.x + wide!.width)).toBeGreaterThanOrEqual(CRAFT_TARGETS.nodeGapRow);
    expect(tall!.x - (wide!.x + wide!.width)).toBeLessThanOrEqual(CRAFT_TARGETS.nodeGapRow + 4);
    expect(small!.y - (tall!.y + tall!.height)).toBeGreaterThanOrEqual(CRAFT_TARGETS.nodeGapColumn);
    expect(small!.y - (tall!.y + tall!.height)).toBeLessThanOrEqual(CRAFT_TARGETS.nodeGapColumn + 4);
    // Columns line up across rows.
    expect(Math.abs(small!.x + small!.width / 2 - (wide!.x + wide!.width / 2))).toBeLessThanOrEqual(2);
    // One center line per row, so a side-to-side wire runs straight (within
    // the write path's grid of 4).
    expect(Math.abs(wide!.y + wide!.height / 2 - (tall!.y + tall!.height / 2))).toBeLessThanOrEqual(2);

    // The frame holds every footprint with the frame padding, title band above.
    const pad = CRAFT_TARGETS.framePadding;
    expect(wide!.x - frame!.x).toBe(pad);
    expect(frame!.x + frame!.width - (tall!.x + tall!.width)).toBeGreaterThanOrEqual(pad);
    expect(frame!.y + frame!.height - (small!.y + small!.height)).toBeGreaterThanOrEqual(pad);
    expect(Math.min(wide!.y, tall!.y) - frame!.y).toBeGreaterThanOrEqual(pad + 40);
    // The frame keeps its corner, and adopts the nodes it now covers.
    expect(objectOf(doc, "frame").geometry).toMatchObject({ x: 0, y: 0 });
    for (const id of ["wide", "tall", "small"]) {
      expect(objectOf(doc, id).parentId, id).toBe("frame");
    }
  });

  test("an icon's caption counts: the row gap is measured from the caption band, and the frame holds it", () => {
    const session = makeTestSession(iconBoard(), ["frame"]);
    const before = session.draft;
    // The fixture is only meaningful if a caption widens or deepens the footprint.
    const dbBefore = footprint(before, "db");
    expect(dbBefore.width > 120 || dbBefore.height > 120).toBe(true);

    const result = runOp(session, "arrange_section", {
      section: "frame",
      rows: [["db", "model"], ["api"]],
    });

    expect(result.isError).toBeUndefined();
    const doc = session.draft;
    const [db, model, api, frame] = ["db", "model", "api", "frame"].map((id) => footprint(doc, id));
    expect(model!.x - (db!.x + db!.width)).toBeGreaterThanOrEqual(CRAFT_TARGETS.nodeGapRow);
    expect(api!.y - Math.max(db!.y + db!.height, model!.y + model!.height))
      .toBeGreaterThanOrEqual(CRAFT_TARGETS.nodeGapColumn);
    for (const node of [db!, model!, api!]) {
      expect(node.x).toBeGreaterThanOrEqual(frame!.x + CRAFT_TARGETS.framePadding);
      expect(node.y + node.height).toBeLessThanOrEqual(frame!.y + frame!.height - CRAFT_TARGETS.framePadding);
    }
    for (const id of ["db", "model", "api"]) {
      expect(objectOf(doc, id).parentId, id).toBe("frame");
    }
  });

  test("a child left out of rows stays put and the result says so", () => {
    const session = makeTestSession(iconBoard(), ["frame"]);

    const result = runOp(session, "arrange_section", { section: "frame", rows: [["db", "model"]] });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("not arranged: api");
    expect(objectOf(session.draft, "api").geometry).toMatchObject({ x: 700, y: 180 });
  });

  test("a nested frame wider than its parent stays its child, and the parent grows to hold it", () => {
    const baseline = makeDocument([
      { ...box("outer", 0, 0, 600, 400, "section"), text: "Outer" },
      { ...box("inner", 40, 80, 520, 280, "section"), text: "Inner", color: "blue" as const, parentId: "outer" },
      ...["a", "b", "c"].map((id) => ({ ...box(id, 80, 160, 280, 100, "process"), parentId: "inner" })),
    ]);
    const session = makeTestSession(baseline, ["inner"]);

    const result = runOp(session, "arrange_section", { section: "inner", rows: [["a", "b", "c"]] });

    expect(result.isError).toBeUndefined();
    // The row of three makes inner wider than outer was; the accepted board
    // keeps the tree and has no overlapping frames.
    const accepted = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;
    for (const doc of [session.draft, accepted]) {
      expect(objectOf(doc, "inner").geometry.width).toBeGreaterThan(600);
      expect(objectOf(doc, "inner").parentId).toBe("outer");
      for (const id of ["a", "b", "c"]) expect(objectOf(doc, id).parentId, id).toBe("inner");
      const overlaps = runDiagnostics(doc).filter((finding) => finding.rule === "covered-content");
      expect(overlaps.map((finding) => finding.message)).toEqual([]);
    }
  });
});

describe("arrange_section — refusals", () => {
  function refusalBoard(): InteractiveCanvasDocument {
    return makeDocument([
      { ...box("frame", 0, 0, 960, 640, "section"), text: "Frame" },
      { ...box("a", 40, 80, 280, 100, "process"), parentId: "frame" },
      { ...box("b", 400, 80, 280, 100, "process"), parentId: "frame" },
      { ...box("inner", 40, 300, 400, 300, "section"), text: "Inner", parentId: "frame" },
      { ...box("deep", 80, 380, 240, 100, "process"), parentId: "inner" },
      { ...box("note", 600, 300, 200, 200, "sticky"), parentId: "frame" },
      { ...box("other", 1200, 0, 600, 400, "section"), text: "Other" },
      { ...box("theirs", 1240, 80, 280, 100, "process"), parentId: "other" },
      { ...box("frozen", 2000, 0, 600, 400, "section"), text: "Frozen", locked: "all" },
      { ...box("held", 2040, 80, 280, 100, "process"), parentId: "frozen" },
      { ...box("pinned", 600, 80, 240, 100, "process"), parentId: "frame", locked: "background" },
    ]);
  }

  const cases: Array<{ name: string; params: Record<string, unknown>; message: string }> = [
    {
      name: "a section among the rows",
      params: { section: "frame", rows: [["a", "inner"]] },
      message: 'rows id "inner" is a section',
    },
    {
      name: "the frame itself among the rows",
      params: { section: "frame", rows: [["a", "frame"]] },
      message: 'rows id "frame" is the section being arranged',
    },
    {
      name: "a sticky among the rows",
      params: { section: "frame", rows: [["a", "note"]] },
      message: 'rows id "note" is a sticky',
    },
    {
      name: "a locked node",
      params: { section: "frame", rows: [["a", "pinned"]] },
      message: 'rows id "pinned" is locked (background)',
    },
    {
      name: "a duplicate id",
      params: { section: "frame", rows: [["a", "b"], ["a"]] },
      message: 'rows id "a" appears more than once',
    },
    {
      name: "a node of another section",
      params: { section: "frame", rows: [["a", "theirs"]] },
      message: 'rows id "theirs" belongs to section "other"',
    },
    {
      name: "a node of a nested section",
      params: { section: "frame", rows: [["a", "deep"]] },
      message: 'rows id "deep" belongs to section "inner"',
    },
    {
      name: "an id not on the board",
      params: { section: "frame", rows: [["a", "ghost"]] },
      message: 'rows id "ghost" is not on the board',
    },
    {
      name: "a section id that is not a section",
      params: { section: "a", rows: [["b"]] },
      message: 'section "a" is a process, not a frame',
    },
    {
      name: "a locked section",
      params: { section: "frozen", rows: [["held"]] },
      message: 'section "frozen" is locked (all)',
    },
  ];

  for (const { name, params, message } of cases) {
    test(`refuses ${name}, and nothing moves`, () => {
      const session = makeTestSession(refusalBoard(), ["frame"]);
      const before = session.draft;

      const result = runOp(session, "arrange_section", params);

      expect(result.isError).toBe(true);
      expect(result.text).toContain("ERROR · arrange_section");
      expect(result.text).toContain(message);
      expect(session.draft).toBe(before);
    });
  }
});
