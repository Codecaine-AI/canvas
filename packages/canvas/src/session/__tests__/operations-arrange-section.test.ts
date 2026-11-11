/**
 * `arrange_section` — one frame's nodes laid out in the rows the model names,
 * pitched from each node's painted footprint at the craft-target gaps, with
 * the frame closed around what landed.
 *
 * What these pin: the gaps a reader sees (footprint to footprint, so an icon's
 * caption counts and its empty box sides do not), a gap widened for a
 * labelled wire, the shared center line of a mixed-size row, each row centred
 * in the frame, the frame that contains every footprint, and each refusal
 * naming why and what to do.
 */
import { describe, expect, test } from "bun:test";

import type { InteractiveCanvasDocument, InteractiveCanvasObject } from "../../state/schema";

import { CRAFT_TARGETS } from "../../authoring/style-guide/craft-targets";
import { diffDocuments } from "../../board/doc-diff";
import { runDiagnostics } from "../../board/lints/run";
import { createInteractiveCanvasState, reduceInteractiveCanvasState } from "../../state/actions";
import { hitBoundsForObject } from "../../objects/geometry";
import { connectionLabelChipMetrics } from "../../connectors/label-chip";
import { ARROW_KEEP_OUT_PX, blockedLabelIds, paintedRects, placeConnectionLabels, routedConnectionIn } from "../../connectors/label-placement";
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
    // A shorter row is centred in the frame.
    expect(Math.abs(small!.x + small!.width / 2 - (frame!.x + frame!.width / 2))).toBeLessThanOrEqual(2);
    // One center line per row, so a side-to-side wire runs straight (within
    // the write path's grid of 4).
    expect(Math.abs(wide!.y + wide!.height / 2 - (tall!.y + tall!.height / 2))).toBeLessThanOrEqual(2);

    // The frame holds every footprint with the frame padding, title band above.
    const pad = CRAFT_TARGETS.framePadding;
    expect(wide!.x - frame!.x).toBe(pad);
    expect(frame!.x + frame!.width - (tall!.x + tall!.width)).toBe(pad);
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

  /** Where a box paints: an icon's tile and caption, else its box. */
  function painted(document: InteractiveCanvasDocument, id: string) {
    const rects = paintedRects(objectOf(document, id));
    const x = Math.min(...rects.map((rect) => rect.x));
    const right = Math.max(...rects.map((rect) => rect.x + rect.width));
    const y = Math.min(...rects.map((rect) => rect.y));
    const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
    return { x, y, right, bottom, centerY: (y + bottom) / 2 };
  }

  test("an icon is measured by its tile and caption: the row sits centred, its gap is the craft gap, and its wire runs straight", () => {
    // Board 12's row: a 300×120 icon (it paints a 56px tile and a caption)
    // beside a 300×120 process.
    const session = makeTestSession(makeDocument(
      [
        { ...box("frame", 40, 360, 900, 260, "section"), text: "Frame" },
        { ...box("files", 80, 460, 300, 120, "icon"), text: "Harness folders", icon: "folder" as const, parentId: "frame" },
        { ...box("collector", 600, 460, 300, 120, "process"), text: "trace-collector", parentId: "frame" },
      ],
      [{ id: "tail", from: { objectId: "files", anchor: "right" }, to: { objectId: "collector", anchor: "left" }, label: "slow tail" }],
    ), ["frame"]);

    const result = runOp(session, "arrange_section", { section: "frame", rows: [["files", "collector"]] });

    expect(result.isError).toBeUndefined();
    const doc = session.draft;
    const frame = objectOf(doc, "frame").geometry;
    const files = painted(doc, "files");
    const collector = painted(doc, "collector");
    // The same air left and right of what paints (within the grid a cell rounds up to).
    expect(Math.abs((files.x - frame.x) - (frame.x + frame.width - collector.right))).toBeLessThanOrEqual(4);
    // The gap a reader sees is the craft gap, not the craft gap plus the icon's empty box side.
    expect(collector.x - files.right).toBeGreaterThanOrEqual(CRAFT_TARGETS.nodeGapRow);
    expect(collector.x - files.right).toBeLessThanOrEqual(CRAFT_TARGETS.nodeGapRow + 20);
    // The icon's stored box still sits inside the frame with air.
    const stored = objectOf(doc, "files").geometry;
    expect(stored.x - frame.x).toBeGreaterThanOrEqual(20);
    expect(objectOf(doc, "files").parentId).toBe("frame");
    // The tile's middle and the box's middle share one line, so the wire between them is straight.
    const wire = doc.connections[0]!;
    const route = routedConnectionIn(doc, wire, objectOf(doc, "files"), objectOf(doc, "collector")).points!;
    expect(new Set(route.map((point) => Math.round(point.y))).size).toBe(1);
  });

  test("a gap a labelled wire crosses widens to its chip plus the air for both ends", () => {
    const label = "retry with the next provider";
    const session = makeTestSession(makeDocument(
      [
        { ...box("frame", 0, 0, 960, 400, "section"), text: "Frame" },
        { ...box("a", 40, 80, 240, 100, "process"), parentId: "frame" },
        { ...box("b", 480, 80, 240, 100, "process"), parentId: "frame" },
        { ...box("c", 40, 280, 240, 100, "process"), parentId: "frame" },
        { ...box("d", 480, 280, 240, 100, "process"), parentId: "frame" },
      ],
      [
        { id: "ab", from: { objectId: "a", anchor: "right" }, to: { objectId: "b", anchor: "left" }, label },
        { id: "cd", from: { objectId: "c", anchor: "right" }, to: { objectId: "d", anchor: "left" } },
      ],
    ), ["frame"]);
    const chip = connectionLabelChipMetrics(label);
    // The fixture is only meaningful if the craft gap is too short for the chip.
    expect(chip.width + 68).toBeGreaterThan(CRAFT_TARGETS.nodeGapRow);

    const result = runOp(session, "arrange_section", { section: "frame", rows: [["a", "b"], ["c", "d"]] });

    expect(result.isError).toBeUndefined();
    const doc = session.draft;
    const [a, b, c, d] = ["a", "b", "c", "d"].map((id) => objectOf(doc, id).geometry);
    expect(b!.x - (a!.x + a!.width)).toBeGreaterThanOrEqual(chip.width + 68);
    // Rows of one length share columns, so the unlabelled row widens with it.
    expect(c!.x).toBe(a!.x);
    expect(d!.x).toBe(b!.x);
    // The chip lands clear, short of the arrowhead.
    const route = routedConnectionIn(doc, doc.connections[0]!, objectOf(doc, "a"), objectOf(doc, "b")).points!;
    const center = placeConnectionLabels(doc).get("ab")!;
    expect(center.x + chip.width / 2).toBeLessThanOrEqual(route.at(-1)!.x - ARROW_KEEP_OUT_PX);
    expect(blockedLabelIds(doc)).toEqual([]);
  });

  test("a child left out of rows stays put and the result says so", () => {
    const session = makeTestSession(iconBoard(), ["frame"]);

    const result = runOp(session, "arrange_section", { section: "frame", rows: [["db", "model"]] });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("not arranged: api");
    expect(objectOf(session.draft, "api").geometry).toMatchObject({ x: 700, y: 180 });
  });

  // root > outer > inner, lint-clean, with inner's three nodes in a column.
  // A row of three makes inner 1320px wide, past both of its ancestors.
  function nestedBoard(outerLock?: "background"): InteractiveCanvasDocument {
    return makeDocument([
      { ...box("root", 0, 0, 800, 800, "section"), text: "Root" },
      { ...box("outer", 40, 80, 720, 680, "section"), text: "Outer", color: "blue" as const, parentId: "root", locked: outerLock },
      { ...box("inner", 80, 160, 640, 560, "section"), text: "Inner", color: "green" as const, parentId: "outer" },
      ...["a", "b", "c"].map((id, row) => ({ ...box(id, 120, 240 + row * 140, 280, 100, "process"), parentId: "inner" })),
    ]);
  }

  test("a nested frame wider than its ancestors stays their child, and every ancestor grows to hold it", () => {
    const baseline = nestedBoard();
    const session = makeTestSession(baseline, ["inner"]);

    const result = runOp(session, "arrange_section", { section: "inner", rows: [["a", "b", "c"]] });

    expect(result.isError).toBeUndefined();
    // The draft and the accepted board keep the tree and have no overlapping frames.
    const accepted = reduceInteractiveCanvasState(createInteractiveCanvasState(baseline), {
      type: "canvas.applyAgentPatch",
      operations: diffDocuments(baseline, session.draft),
      summary: "accept",
    }).document;
    for (const doc of [session.draft, accepted]) {
      expect(objectOf(doc, "inner").geometry.width).toBeGreaterThan(800);
      expect(objectOf(doc, "root").parentId ?? null).toBeNull();
      expect(objectOf(doc, "outer").parentId).toBe("root");
      expect(objectOf(doc, "inner").parentId).toBe("outer");
      for (const id of ["a", "b", "c"]) expect(objectOf(doc, id).parentId, id).toBe("inner");
      const overlaps = runDiagnostics(doc).filter((finding) => finding.rule === "covered-content");
      expect(overlaps.map((finding) => finding.message)).toEqual([]);
    }
  });

  test("a nested frame whose parent cannot grow is refused, and nothing moves", () => {
    const session = makeTestSession(nestedBoard("background"), ["inner"]);
    const before = session.draft;

    const result = runOp(session, "arrange_section", { section: "inner", rows: [["a", "b", "c"]] });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("inner would leave outer, which cannot grow to hold it");
    expect(session.draft).toBe(before);
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
