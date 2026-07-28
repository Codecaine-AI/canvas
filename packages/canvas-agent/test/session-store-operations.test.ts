/**
 * The operation FACTORY, exercised through the gesture roster.
 *
 * What is under test here is the pipeline every descriptor shares — the sealed
 * text-only mutator envelope, the failure contract that leaves the draft and the
 * event log untouched, membership reconciliation after a move or a placement,
 * the delta/lint report, and the page-frame draft — not the gestures themselves.
 * Per-gesture behaviour lives with its group: session-store-gestures (Place /
 * Sections / Delete), operations-content, session-store-arrange,
 * operations-edges.
 *
 * `fit_section` is the exception and is tested here in full, because it is the
 * one mutator that resolves its own geometry off the draft and owns its own
 * no-op.
 */
import { describe, expect, test } from "bun:test";

import { formatBoardDigest } from "../src/board/digest";
import { pageFrameOf } from "../src/board/helpers";
import { draftWithPageFrame, wreckedDocumentError } from "../src/service/session";
import { look, makeTestSession, runOp } from "./helpers";
import { box, connect, makeDocument } from "./synthetic";

describe("session operations", () => {
  test("look returns the standing text truth and its one framed render, without editing", () => {
    const section = { ...box("home", 0, 0, 480, 320, "section"), text: "Home" };
    const child = { ...box("child", 64, 96), parentId: "home" };
    const baseline = makeDocument([section, child]);
    const session = makeTestSession(baseline, ["home"]);

    const result = look(session, "home");

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("LOOK · 1 render · close-up home");
    // The close-up still answers "where does the board stand?" in text.
    expect(result.text).toContain(formatBoardDigest(session.draft));
    expect(result.text).toContain("BOARD DIFF · none");
    expect(result.text).toContain("DIAGNOSTICS ·");
    expect(result.text).toContain("REQUESTS · none");
    // A look is not an edit, so it carries no per-call delta.
    expect(result.text).not.toContain("\nDELTA");
    // The one framed region is the one raster — the board rides the state block.
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]).toBeInstanceOf(Buffer);
    // The raster lands on the look log while the result carries its image.
    expect(session.views.map((view) => view.kind)).toEqual(["section"]);
    expect(session.views[0]!.sectionId).toBe("home");
    // Perception does not create an edit event.
    expect(session.events).toEqual([]);
    expect(session.draft).toBe(baseline);
  });

  test("a mutator returns text only — pictures come from look", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "update_text", { id: "alpha", text: "changed" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · update_text alpha");
    expect(result.pngs).toBeUndefined();
    expect(result.text).not.toContain("render failed");
    expect(session.views).toEqual([]);
    expect(session.draft).not.toBe(draftBefore);
  });

  test("look renders a section placed during the run", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const placed = runOp(session, "place_section", {
      id: "new-section",
      text: "New",
      at: [320, 0],
      size: { width: 480, height: 320 },
    });
    expect(placed.isError).toBeUndefined();
    expect(placed.text).toContain("APPLIED · place_section new-section 320,0 480×320");

    const result = look(session, "new-section");
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("LOOK · 1 render · close-up new-section");
    expect(result.pngs).toHaveLength(1);
    expect(result.pngs![0]).toBeInstanceOf(Buffer);
    expect(session.draft.objects.find((object) => object.id === "new-section")?.type)
      .toBe("section");
  });

  test("a view id that names a plain box frames it as an object close-up", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);

    const result = look(session, "alpha");

    // `view` frames sections and objects alike: a box comes back as a crop of
    // its bounds with a context ring, measured like any framed region.
    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("LOOK · 1 render · framed alpha");
    expect(result.text).toContain("MEASURES · object alpha 0,0 160×96");
    expect(result.pngs).toHaveLength(1);
  });

  test("a failing operation preserves the draft and emits no event", () => {
    const baseline = makeDocument([box("alpha", 0, 0)]);
    const session = makeTestSession(baseline, ["alpha"]);
    const draftBefore = session.draft;

    const result = runOp(session, "change_color", { id: "missing", color: "blue" });

    expect(result.isError).toBe(true);
    expect(result.text).toBe(
      'ERROR · change_color — id "missing" is not on the board — it names neither an'
      + " object nor an edge.",
    );
    expect(session.draft).toBe(draftBefore);
    expect(session.draft.objects[0]!.text).toBe("alpha");
    expect(session.events).toEqual([]);
  });

  test("each applied operation emits the proposal/delta pair, object or edge", () => {
    const alpha = { ...box("alpha", 0, 0), color: "red" as const };
    const beta = box("beta", 320, 0);
    const connection = {
      ...connect("alpha-beta", "alpha", "beta"),
      label: "before",
      style: "solid" as const,
      color: "gray" as const,
    };
    const baseline = makeDocument([alpha, beta], [connection]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const objectResult = runOp(session, "update_text", { id: "alpha", text: "renamed" });
    const connectionResult = runOp(session, "change_color", {
      id: "alpha-beta",
      color: "violet",
    });

    expect(objectResult.isError).toBeUndefined();
    expect(objectResult.text).toContain("APPLIED · update_text alpha");
    expect(connectionResult.isError).toBeUndefined();
    expect(connectionResult.text).toContain("APPLIED · change_color alpha-beta");
    expect(session.draft.objects.find((object) => object.id === "alpha")).toMatchObject({
      text: "renamed",
      color: "red",
      geometry: alpha.geometry,
    });
    expect(session.draft.connections.find((item) => item.id === "alpha-beta")).toMatchObject({
      label: "before",
      style: "solid",
      color: "violet",
    });
    // Each applied operation emits the proposal/delta pair the harness has
    // always emitted, so two edits leave four events.
    expect(session.events).toHaveLength(4);
    expect(session.events.map((event) => event.type)).toEqual([
      "proposal",
      "delta",
      "proposal",
      "delta",
    ]);
  });

  test("re-derives membership for both moved and placed objects", () => {
    const sectionA = box("section-a", 0, 0, 400, 320, "section");
    const sectionB = box("section-b", 500, 0, 400, 320, "section");
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([sectionA, sectionB, child]);
    const session = makeTestSession(baseline, ["section-a", "section-b"]);

    const moved = runOp(session, "move_to", { id: "child", x: 580, y: 120 });
    const placed = runOp(session, "place_shape", {
      id: "new-child",
      type: "rectangle",
      at: [60, 120],
    });

    expect(moved.isError).toBeUndefined();
    expect(placed.isError).toBeUndefined();
    expect(session.draft.objects.find((object) => object.id === "child")?.parentId)
      .toBe("section-b");
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
  });

  test("placing a child re-derives membership and leaves every frame's size alone", () => {
    const page = box("page", -60, -60, 900, 800, "section");
    const section = { ...box("section-a", 0, 0, 400, 320, "section"), parentId: "page" };
    const child = { ...box("child", 80, 112), parentId: "section-a" };
    const baseline = makeDocument([page, section, child]);
    const session = makeTestSession(baseline, ["section-a"]);

    const result = runOp(session, "place_shape", {
      id: "new-child",
      type: "rectangle",
      at: [60, 200],
    });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · place_shape new-child");
    expect(session.draft.objects.find((object) => object.id === "new-child")?.parentId)
      .toBe("section-a");
    // Nothing resizes itself: both frames hold the geometry they were given.
    expect(session.draft.objects.find((object) => object.id === "page")?.geometry)
      .toEqual(page.geometry);
    expect(session.draft.objects.find((object) => object.id === "section-a")?.geometry)
      .toEqual(section.geometry);
    expect(result.text).not.toContain("section-a  0,0 400×320 →");
  });

  test("fit_section snugs one frame around its children and spares its ancestors", () => {
    const page = box("page", -64, -64, 1200, 1000, "section");
    const outer = { ...box("outer", 0, 0, 800, 700, "section"), parentId: "page" };
    const inner = { ...box("inner", 100, 150, 400, 300, "section"), parentId: "outer" };
    const child = { ...box("child", 180, 240, 100, 80), parentId: "inner" };
    const baseline = makeDocument([page, outer, inner, child]);
    const session = makeTestSession(baseline, ["outer"]);

    const result = runOp(session, "fit_section", { id: "inner" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · fit_section inner");
    const fitted = session.draft.objects.find((object) => object.id === "inner")!.geometry;
    // Snug around the one child, plus padding and title clearance.
    expect(fitted.width).toBeLessThan(inner.geometry.width);
    expect(fitted.height).toBeLessThan(inner.geometry.height);
    expect(fitted.x).toBeLessThanOrEqual(child.geometry.x);
    expect(fitted.y).toBeLessThanOrEqual(child.geometry.y);
    expect(fitted.x + fitted.width).toBeGreaterThanOrEqual(
      child.geometry.x + child.geometry.width,
    );
    expect(fitted.y + fitted.height).toBeGreaterThanOrEqual(
      child.geometry.y + child.geometry.height,
    );
    // No cascade: the ancestors keep their own geometry.
    expect(session.draft.objects.find((object) => object.id === "outer")?.geometry)
      .toEqual(outer.geometry);
    expect(session.draft.objects.find((object) => object.id === "page")?.geometry)
      .toEqual(page.geometry);
    // The resize reads truthfully as a section geometry change.
    expect(result.text).toContain("inner  100,150 400×300 →");
  });

  test("fit_section reports an empty section as a no-op", () => {
    const page = box("page", 0, 0, 900, 800, "section");
    const empty = { ...box("empty", 32, 32, 400, 320, "section"), parentId: "page" };
    const baseline = makeDocument([page, empty]);
    const session = makeTestSession(baseline, ["empty"]);
    const draftBefore = session.draft;

    const result = runOp(session, "fit_section", { id: "empty" });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain(
      "NO-OP · fit_section empty — skipped — the section is empty",
    );
    expect(result.text).not.toContain("ERROR ·");
    expect(session.draft).toBe(draftBefore);
    expect(session.draft.objects.find((object) => object.id === "empty")?.geometry)
      .toEqual(empty.geometry);
    expect(session.events).toEqual([]);
  });

  test("fit_section rejects a target that is not a frame, and says what is", () => {
    const page = box("page", 0, 0, 900, 800, "section");
    const child = { ...box("child", 80, 112), parentId: "page" };
    const note = { ...box("note", 400, 112, 180, 120, "sticky"), parentId: "page" };
    const baseline = makeDocument([page, child, note]);
    const session = makeTestSession(baseline, ["child"]);
    const draftBefore = session.draft;

    const shape = runOp(session, "fit_section", { id: "child" });
    expect(shape.isError).toBe(true);
    expect(shape.text).toBe(
      'ERROR · fit_section — id "child" is a rectangle, not a frame —'
      + " fit_section, change_section_border, lock and unlock act on sections;"
      + " place_section opens one.",
    );

    const sticky = runOp(session, "fit_section", { id: "note" });
    expect(sticky.isError).toBe(true);
    expect(sticky.text).toContain('id "note" is a sticky, not a frame');

    const ghost = runOp(session, "fit_section", { id: "ghost" });
    expect(ghost.isError).toBe(true);
    expect(ghost.text).toBe('ERROR · fit_section — id "ghost" is not on the board.');

    expect(session.draft).toBe(draftBefore);
    expect(session.events).toEqual([]);
  });

  test("injects a conventional page frame into frameless drafts only", () => {
    const child = box("child", 80, 112);
    const baseline = { ...makeDocument([child]), size: { width: 1200, height: 720 } };

    const draft = draftWithPageFrame(baseline);

    expect(baseline.objects).toEqual([child]);
    expect(draft.objects[0]).toMatchObject({
      id: "page-frame",
      type: "section",
      text: "Synthetic",
      color: "white",
      parentId: null,
      geometry: { x: 32, y: 32, width: 1136, height: 656 },
      style: { shape: "section" },
    });
    expect(pageFrameOf(draft)?.geometry).toEqual({
      x: 32,
      y: 32,
      width: 1136,
      height: 656,
    });
    expect(wreckedDocumentError(draft)).toBeNull();
    expect(draftWithPageFrame(draft)).toBe(draft);
  });

  test("derives a snapped padded frame without document size and defaults an empty page", () => {
    const contentDraft = draftWithPageFrame(makeDocument([
      box("child", 83, 117, 161, 97),
    ]));
    // The derived frame rounds outward on GEOMETRY_NORMALIZATION_GRID (4),
    // the write grid, not the UI's interaction grid (16): the padded content
    // bounds (51,85 → 276,246) grow to (48,84 → 276,248).
    expect(contentDraft.objects[0]?.geometry)
      .toEqual({ x: 48, y: 84, width: 228, height: 164 });

    const emptyDraft = draftWithPageFrame(makeDocument([]));
    expect(emptyDraft.objects[0]?.geometry)
      .toEqual({ x: 32, y: 32, width: 1136, height: 656 });
  });

  test("returns the change delta and new lint findings without rejecting the edit", () => {
    const baseline = makeDocument([
      box("alpha", 0, 0),
      box("beta", 320, 0),
    ], [{ ...connect("edge", "alpha", "beta"), label: "go" }]);
    const session = makeTestSession(baseline, ["alpha", "beta"]);

    const result = runOp(session, "move_to", { id: "beta", x: 200, y: 0 });

    expect(result.isError).toBeUndefined();
    expect(result.text).toContain("APPLIED · move_to beta → (200, 0)");
    expect(result.text).toContain("DELTA");
    expect(result.text).toContain("beta  320,0 → 200,0");
    expect(result.text).toContain("LINTS · +2 −0");
    expect(result.text).toContain('W1 unreadable-labels: label "go" chip on edge');
    expect(result.text).toContain("crowding: alpha and beta");
    expect(result.text).not.toContain("[quickfix]");
    expect(session.lastDiagnostics).toHaveLength(2);
    expect(session.draft.objects.find((object) => object.id === "beta")?.geometry)
      .toEqual({ x: 200, y: 0, width: 160, height: 96 });
    expect(session.events.map((event) => event.type)).toEqual(["proposal", "delta"]);
  });
});
